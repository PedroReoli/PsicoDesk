use serde_json::json;
use tauri::State;

use crate::{
    application::{
        audit,
        authorization::{require, Permission},
        validation,
    },
    commands::authenticate,
    domain::models::{ClinicalRecord, CreateClinicalAmendmentInput, CreateClinicalRecordInput},
    error::{AppError, CommandError, CommandResult},
    state::AppState,
};

fn authorize_patient(
    state: &AppState,
    user_id: &str,
    patient_id: &str,
) -> Result<(), CommandError> {
    let db = state
        .database
        .lock()
        .map_err(|_| CommandError::from(AppError::Internal("database lock poisoned".into())))?;
    if db
        .professional_can_access_patient(user_id, patient_id)
        .map_err(CommandError::from)?
    {
        Ok(())
    } else {
        Err(AppError::Forbidden.into())
    }
}

#[tauri::command(rename_all = "camelCase")]
pub fn list_clinical_records(
    state: State<'_, AppState>,
    session_token: String,
    patient_id: String,
) -> CommandResult<Vec<ClinicalRecord>> {
    let principal = authenticate(&state, &session_token).map_err(CommandError::from)?;
    require(&principal, Permission::ReadClinicalRecords).map_err(CommandError::from)?;
    authorize_patient(&state, &principal.user_id, &patient_id)?;
    let db = state
        .database
        .lock()
        .map_err(|_| CommandError::from(AppError::Internal("database lock poisoned".into())))?;
    let records = db
        .list_clinical_records(&patient_id)
        .map_err(CommandError::from)?;
    audit::record(
        &db,
        Some(&principal),
        "clinical_records.read",
        "patient",
        Some(&patient_id),
        "success",
        json!({"count":records.len()}),
    )
    .map_err(CommandError::from)?;
    Ok(records)
}

#[tauri::command(rename_all = "camelCase")]
pub fn create_clinical_record(
    state: State<'_, AppState>,
    session_token: String,
    input: CreateClinicalRecordInput,
) -> CommandResult<ClinicalRecord> {
    let principal = authenticate(&state, &session_token).map_err(CommandError::from)?;
    require(&principal, Permission::WriteClinicalRecords).map_err(CommandError::from)?;
    authorize_patient(&state, &principal.user_id, &input.patient_id)?;
    let body = validation::required_text(&input.body, "Registro clínico", 3, 100_000)
        .map_err(CommandError::from)?;
    let db = state
        .database
        .lock()
        .map_err(|_| CommandError::from(AppError::Internal("database lock poisoned".into())))?;
    if let Some(appointment_id) = input.appointment_id.as_deref() {
        let appointment = db
            .find_appointment(appointment_id)
            .map_err(CommandError::from)?
            .ok_or_else(|| CommandError::from(AppError::NotFound))?;
        if appointment.patient_id != input.patient_id
            || appointment.professional_id != principal.user_id
        {
            return Err(AppError::Forbidden.into());
        }
    }
    let record = db
        .insert_clinical_record(
            &input.patient_id,
            &principal.user_id,
            input.appointment_id.as_deref(),
            &body,
            None,
        )
        .map_err(CommandError::from)?;
    audit::record(
        &db,
        Some(&principal),
        "clinical_record.created",
        "clinical_record",
        Some(&record.id),
        "success",
        json!({"patientId":input.patient_id}),
    )
    .map_err(CommandError::from)?;
    Ok(record)
}

#[tauri::command(rename_all = "camelCase")]
pub fn create_clinical_amendment(
    state: State<'_, AppState>,
    session_token: String,
    record_id: String,
    input: CreateClinicalAmendmentInput,
) -> CommandResult<ClinicalRecord> {
    let principal = authenticate(&state, &session_token).map_err(CommandError::from)?;
    require(&principal, Permission::WriteClinicalRecords).map_err(CommandError::from)?;
    let body =
        validation::required_text(&input.body, "Adendo", 3, 100_000).map_err(CommandError::from)?;
    let db = state
        .database
        .lock()
        .map_err(|_| CommandError::from(AppError::Internal("database lock poisoned".into())))?;
    let original = db
        .find_clinical_record(&record_id)
        .map_err(CommandError::from)?
        .ok_or_else(|| CommandError::from(AppError::NotFound))?;
    if !db
        .professional_can_access_patient(&principal.user_id, &original.patient_id)
        .map_err(CommandError::from)?
    {
        return Err(AppError::Forbidden.into());
    }
    let amendment = db
        .insert_clinical_record(
            &original.patient_id,
            &principal.user_id,
            original.appointment_id.as_deref(),
            &body,
            Some(&record_id),
        )
        .map_err(CommandError::from)?;
    audit::record(
        &db,
        Some(&principal),
        "clinical_record.amended",
        "clinical_record",
        Some(&amendment.id),
        "success",
        json!({"originalId":record_id}),
    )
    .map_err(CommandError::from)?;
    Ok(amendment)
}
