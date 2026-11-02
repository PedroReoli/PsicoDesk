use chrono::Utc;
use rusqlite::{params, OptionalExtension};
use uuid::Uuid;

use super::Database;
use crate::{domain::models::ClinicalRecord, error::AppError};

impl Database {
    pub fn list_clinical_records(&self, patient_id: &str) -> Result<Vec<ClinicalRecord>, AppError> {
        let mut statement = self.connection.prepare(
            "SELECT r.id, r.patient_id, r.author_id, u.display_name, r.appointment_id, r.body_ciphertext, r.amendment_of, r.content_hash, r.created_at FROM clinical_records r JOIN users u ON u.id=r.author_id WHERE r.patient_id=?1 ORDER BY r.created_at DESC"
        )?;
        let rows = statement.query_map([patient_id], record_from_row)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(AppError::from)
    }

    pub fn insert_clinical_record(
        &self,
        patient_id: &str,
        author_id: &str,
        appointment_id: Option<&str>,
        body: &str,
        amendment_of: Option<&str>,
    ) -> Result<ClinicalRecord, AppError> {
        if let Some(original_id) = amendment_of {
            let original_patient: Option<String> = self
                .connection
                .query_row(
                    "SELECT patient_id FROM clinical_records WHERE id=?1",
                    [original_id],
                    |row| row.get(0),
                )
                .optional()?;
            if original_patient.as_deref() != Some(patient_id) {
                return Err(AppError::NotFound);
            }
        }
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        let content_hash = stable_content_hash(body);
        self.connection.execute(
            "INSERT INTO clinical_records(id, patient_id, author_id, appointment_id, body_ciphertext, amendment_of, content_hash, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
            params![id, patient_id, author_id, appointment_id, body, amendment_of, content_hash, now],
        )?;
        self.find_clinical_record(&id)?.ok_or(AppError::NotFound)
    }

    pub fn find_clinical_record(&self, id: &str) -> Result<Option<ClinicalRecord>, AppError> {
        self.connection.query_row(
            "SELECT r.id, r.patient_id, r.author_id, u.display_name, r.appointment_id, r.body_ciphertext, r.amendment_of, r.content_hash, r.created_at FROM clinical_records r JOIN users u ON u.id=r.author_id WHERE r.id=?1",
            [id], record_from_row,
        ).optional().map_err(AppError::from)
    }
}

fn record_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<ClinicalRecord> {
    Ok(ClinicalRecord {
        id: row.get(0)?,
        patient_id: row.get(1)?,
        author_id: row.get(2)?,
        author_name: row.get(3)?,
        appointment_id: row.get(4)?,
        body: row.get(5)?,
        amendment_of: row.get(6)?,
        content_hash: row.get(7)?,
        created_at: row.get(8)?,
    })
}

fn stable_content_hash(content: &str) -> String {
    use sha2::{Digest, Sha256};
    format!("sha256:{}", hex::encode(Sha256::digest(content.as_bytes())))
}

#[cfg(test)]
mod tests {
    use super::stable_content_hash;

    #[test]
    fn content_hash_is_deterministic_and_sensitive_to_change() {
        assert_eq!(
            stable_content_hash("registro"),
            stable_content_hash("registro")
        );
        assert_ne!(
            stable_content_hash("registro"),
            stable_content_hash("registro alterado")
        );
    }
}
