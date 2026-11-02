use chrono::Utc;
use rusqlite::{params, OptionalExtension};
use uuid::Uuid;

use super::Database;
use crate::{
    domain::models::{CreatePatientInput, Patient, UpdatePatientInput},
    error::AppError,
};

impl Database {
    pub fn list_patients(&self, query: Option<&str>) -> Result<Vec<Patient>, AppError> {
        let pattern = format!("%{}%", query.unwrap_or_default().trim());
        let mut statement = self.connection.prepare(
            "SELECT id, full_name, social_name, birth_date, email_ciphertext, phone_ciphertext, guardian_name, guardian_phone_ciphertext, status, created_at, updated_at, version FROM patients WHERE (?1 = '%%' OR full_name LIKE ?1 ESCAPE '\\' OR social_name LIKE ?1 ESCAPE '\\') ORDER BY full_name COLLATE NOCASE LIMIT 200"
        )?;
        let rows = statement.query_map([pattern], patient_from_row)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(AppError::from)
    }

    pub fn list_patients_for_professional(
        &self,
        query: Option<&str>,
        professional_id: &str,
    ) -> Result<Vec<Patient>, AppError> {
        let pattern = format!("%{}%", query.unwrap_or_default().trim());
        let mut statement = self.connection.prepare(
            "SELECT p.id, p.full_name, p.social_name, p.birth_date, p.email_ciphertext, p.phone_ciphertext, p.guardian_name, p.guardian_phone_ciphertext, p.status, p.created_at, p.updated_at, p.version FROM patients p WHERE EXISTS(SELECT 1 FROM patient_professionals pp WHERE pp.patient_id=p.id AND pp.professional_id=?2 AND pp.scope='clinical') AND (?1='%%' OR p.full_name LIKE ?1 ESCAPE '\\' OR p.social_name LIKE ?1 ESCAPE '\\') ORDER BY p.full_name COLLATE NOCASE LIMIT 200"
        )?;
        let rows = statement.query_map(params![pattern, professional_id], patient_from_row)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(AppError::from)
    }

    pub fn insert_patient(
        &mut self,
        input: &CreatePatientInput,
        professional_id: Option<&str>,
    ) -> Result<Patient, AppError> {
        let transaction = self.connection.transaction()?;
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        transaction.execute(
            "INSERT INTO patients(id, full_name, social_name, birth_date, email_ciphertext, phone_ciphertext, guardian_name, guardian_phone_ciphertext, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)",
            params![id, input.full_name, input.social_name, input.birth_date, input.email, input.phone, input.guardian_name, input.guardian_phone, now],
        )?;
        if let Some(professional_id) = professional_id {
            transaction.execute("INSERT INTO patient_professionals(patient_id, professional_id, scope, created_at) VALUES (?1, ?2, 'clinical', ?3)", params![id, professional_id, now])?;
        }
        transaction.commit()?;
        Ok(Patient {
            id,
            full_name: input.full_name.clone(),
            social_name: input.social_name.clone(),
            birth_date: input.birth_date.clone(),
            email: input.email.clone(),
            phone: input.phone.clone(),
            guardian_name: input.guardian_name.clone(),
            guardian_phone: input.guardian_phone.clone(),
            status: "active".into(),
            created_at: now.clone(),
            updated_at: now,
            version: 1,
        })
    }

    pub fn update_patient(
        &self,
        id: &str,
        input: &UpdatePatientInput,
    ) -> Result<Patient, AppError> {
        let now = Utc::now().to_rfc3339();
        let changed = self.connection.execute(
            "UPDATE patients SET full_name=?2, social_name=?3, birth_date=?4, email_ciphertext=?5, phone_ciphertext=?6, guardian_name=?7, guardian_phone_ciphertext=?8, status=?9, updated_at=?10, version=version+1 WHERE id=?1 AND version=?11",
            params![id, input.full_name, input.social_name, input.birth_date, input.email, input.phone, input.guardian_name, input.guardian_phone, input.status, now, input.version],
        )?;
        if changed == 0 {
            let exists: bool = self.connection.query_row(
                "SELECT EXISTS(SELECT 1 FROM patients WHERE id=?1)",
                [id],
                |row| row.get(0),
            )?;
            return Err(if exists {
                AppError::Conflict(
                    "A ficha foi alterada em outra sessão. Recarregue antes de salvar.".into(),
                )
            } else {
                AppError::NotFound
            });
        }
        self.find_patient(id)?.ok_or(AppError::NotFound)
    }

    pub fn find_patient(&self, id: &str) -> Result<Option<Patient>, AppError> {
        self.connection.query_row("SELECT id, full_name, social_name, birth_date, email_ciphertext, phone_ciphertext, guardian_name, guardian_phone_ciphertext, status, created_at, updated_at, version FROM patients WHERE id=?1", [id], patient_from_row).optional().map_err(AppError::from)
    }

    pub fn professional_can_access_patient(
        &self,
        professional_id: &str,
        patient_id: &str,
    ) -> Result<bool, AppError> {
        self.connection.query_row("SELECT EXISTS(SELECT 1 FROM patient_professionals WHERE professional_id=?1 AND patient_id=?2 AND scope='clinical')", params![professional_id, patient_id], |row| row.get(0)).map_err(AppError::from)
    }
}

fn patient_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Patient> {
    Ok(Patient {
        id: row.get(0)?,
        full_name: row.get(1)?,
        social_name: row.get(2)?,
        birth_date: row.get(3)?,
        email: row.get(4)?,
        phone: row.get(5)?,
        guardian_name: row.get(6)?,
        guardian_phone: row.get(7)?,
        status: row.get(8)?,
        created_at: row.get(9)?,
        updated_at: row.get(10)?,
        version: row.get(11)?,
    })
}
