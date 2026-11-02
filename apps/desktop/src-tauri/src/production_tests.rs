use serde_json::json;
use tempfile::tempdir;

use crate::{
    domain::models::{
        CreateAppointmentInput, CreateChargeInput, CreatePatientInput, RegisterDocumentInput,
        RegisterPaymentInput, Role,
    },
    error::AppError,
    infrastructure::{backup, database::Database},
};

fn test_database() -> (tempfile::TempDir, Database, [u8; 32]) {
    let directory = tempdir().expect("temporary directory");
    let key = [0x42; 32];
    let database = Database::open(&directory.path().join("psicodesk-test.db"), &key)
        .expect("encrypted database");
    (directory, database, key)
}

#[test]
fn critical_local_workflow_persists_and_rejects_invalid_transitions() {
    let (_directory, mut database, _key) = test_database();
    let owner = database
        .insert_user("Responsável", "owner", "hash", &Role::Owner, None)
        .expect("owner");
    let psychologist = database
        .insert_user(
            "Psicóloga Teste",
            "psi.teste",
            "hash",
            &Role::Psychologist,
            Some("CRP 00/00000"),
        )
        .expect("psychologist");
    let other_psychologist = database
        .insert_user(
            "Outro Profissional",
            "psi.outro",
            "hash",
            &Role::Psychologist,
            Some("CRP 00/00001"),
        )
        .expect("other psychologist");
    let patient = database
        .insert_patient(
            &CreatePatientInput {
                full_name: "Paciente Local".into(),
                social_name: None,
                birth_date: Some("1990-01-02".into()),
                email: None,
                phone: None,
                guardian_name: None,
                guardian_phone: None,
                professional_id: Some(psychologist.id.clone()),
            },
            Some(&psychologist.id),
        )
        .expect("patient");

    let clinical_options = database
        .list_patient_options(Some(&psychologist.id))
        .expect("scoped patients");
    assert_eq!(clinical_options.len(), 1);
    assert_eq!(clinical_options[0].id, patient.id);
    assert_eq!(
        database
            .list_active_psychologists()
            .expect("directory")
            .len(),
        2
    );

    let appointment_input = CreateAppointmentInput {
        patient_id: patient.id.clone(),
        professional_id: psychologist.id.clone(),
        starts_at: "2026-11-03T12:00:00Z".into(),
        ends_at: "2026-11-03T13:00:00Z".into(),
        kind: "individual".into(),
        recurrence_id: None,
    };
    let appointment = database
        .insert_appointment(&appointment_input, &owner.id)
        .expect("appointment");
    assert!(matches!(
        database.insert_appointment(&appointment_input, &owner.id),
        Err(AppError::Conflict(_))
    ));
    let other_patient = database
        .insert_patient(
            &CreatePatientInput {
                full_name: "Paciente de Outro Profissional".into(),
                social_name: None,
                birth_date: None,
                email: None,
                phone: None,
                guardian_name: None,
                guardian_phone: None,
                professional_id: Some(other_psychologist.id.clone()),
            },
            Some(&other_psychologist.id),
        )
        .expect("other patient");
    let other_appointment = database
        .insert_appointment(
            &CreateAppointmentInput {
                patient_id: other_patient.id.clone(),
                professional_id: other_psychologist.id.clone(),
                starts_at: "2026-11-03T14:00:00Z".into(),
                ends_at: "2026-11-03T15:00:00Z".into(),
                kind: "individual".into(),
                recurrence_id: None,
            },
            &owner.id,
        )
        .expect("other appointment");
    assert!(!database
        .professional_can_access_patient(&psychologist.id, &other_patient.id)
        .expect("scope"));
    assert!(!database
        .professional_owns_appointment(&psychologist.id, &other_appointment.id)
        .expect("ownership"));
    assert_ne!(
        other_appointment.patient_id, patient.id,
        "prontuário não pode vincular atendimento de outro paciente"
    );
    assert_eq!(
        database
            .list_appointments(
                "2026-11-03T00:00:00Z",
                "2026-11-04T00:00:00Z",
                Some(&psychologist.id),
            )
            .expect("scoped schedule")
            .len(),
        1
    );
    assert_eq!(
        database
            .list_appointments("2026-11-03T00:00:00Z", "2026-11-04T00:00:00Z", None,)
            .expect("full schedule")
            .len(),
        2
    );

    let record = database
        .insert_clinical_record(
            &patient.id,
            &psychologist.id,
            Some(&appointment.id),
            "Evolução clínica inicial.",
            None,
        )
        .expect("clinical record");
    let amendment = database
        .insert_clinical_record(
            &patient.id,
            &psychologist.id,
            Some(&appointment.id),
            "Adendo preservando o registro original.",
            Some(&record.id),
        )
        .expect("amendment");
    assert_eq!(amendment.amendment_of.as_deref(), Some(record.id.as_str()));

    let charge = database
        .insert_charge(
            &CreateChargeInput {
                patient_id: patient.id.clone(),
                description: "Sessão individual".into(),
                amount_minor: 20_000,
                due_date: "2026-11-10".into(),
            },
            &owner.id,
        )
        .expect("charge");
    let overpayment = RegisterPaymentInput {
        amount_minor: 20_001,
        method: "pix".into(),
        paid_at: "2026-11-03T13:05:00Z".into(),
    };
    assert!(matches!(
        database.register_payment(&charge.id, &overpayment, &owner.id),
        Err(AppError::Validation(_))
    ));
    database
        .register_payment(
            &charge.id,
            &RegisterPaymentInput {
                amount_minor: 20_000,
                method: "pix".into(),
                paid_at: "2026-11-03T13:05:00Z".into(),
            },
            &owner.id,
        )
        .expect("payment");
    assert_eq!(database.list_charges(Some("paid")).expect("paid").len(), 1);

    database
        .insert_document(
            &RegisterDocumentInput {
                patient_id: Some(patient.id),
                title: "Declaração de comparecimento".into(),
                document_type: "declaration".into(),
                template_version: 1,
                encrypted_path: "document.psd".into(),
                checksum: "sha256:test".into(),
            },
            &owner.id,
        )
        .expect("document metadata");
    assert_eq!(database.list_documents(None).expect("documents").len(), 1);

    database
        .upsert_setting("session_policy", &json!({"autoLockMinutes": 30}), &owner.id)
        .expect("session policy");
    assert_eq!(
        database
            .get_setting("session_policy")
            .expect("setting")
            .expect("persisted")
            .value,
        json!({"autoLockMinutes": 30})
    );
}

#[test]
fn encrypted_backup_restores_previous_consistent_state() {
    let (directory, mut database, key) = test_database();
    let owner = database
        .insert_user("Responsável", "owner", "hash", &Role::Owner, None)
        .expect("owner");
    let backup_dir = directory.path().join("backups");
    let snapshot = backup::create(&database, &key, &backup_dir).expect("backup");

    database
        .insert_patient(
            &CreatePatientInput {
                full_name: "Paciente posterior".into(),
                social_name: None,
                birth_date: None,
                email: None,
                phone: None,
                guardian_name: None,
                guardian_phone: None,
                professional_id: None,
            },
            None,
        )
        .expect("patient after snapshot");
    assert_eq!(
        database
            .list_patient_options(None)
            .expect("before restore")
            .len(),
        1
    );

    backup::restore(&mut database, &key, &backup_dir, &snapshot.id).expect("restore");
    assert!(database.has_users().expect("owner remains"));
    assert_eq!(database.list_users().expect("users")[0].id, owner.id);
    assert!(database
        .list_patient_options(None)
        .expect("after restore")
        .is_empty());

    let wrong_key = [0x24; 32];
    assert!(Database::open(&directory.path().join("psicodesk-test.db"), &wrong_key).is_err());
}

#[test]
fn login_lock_state_persists_and_is_cleared_after_valid_authentication() {
    let (_directory, database, _key) = test_database();
    assert!(!database.has_users().expect("empty bootstrap state"));
    let user = database
        .insert_user("Responsável", "owner", "hash", &Role::Owner, None)
        .expect("owner");
    assert!(database.has_users().expect("configured bootstrap state"));
    database
        .record_login_failure(&user.id, 5, Some("2099-01-01T00:00:00Z"))
        .expect("locked login");
    let locked = database
        .find_user_credential("OWNER")
        .expect("credential")
        .expect("user");
    assert_eq!(locked.failed_login_attempts, 5);
    assert_eq!(locked.locked_until.as_deref(), Some("2099-01-01T00:00:00Z"));
    database
        .clear_login_failures(&user.id)
        .expect("clear login failures");
    let cleared = database
        .find_user_credential("owner")
        .expect("credential")
        .expect("user");
    assert_eq!(cleared.failed_login_attempts, 0);
    assert!(cleared.locked_until.is_none());
}
