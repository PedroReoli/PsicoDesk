use chrono::Utc;
use rusqlite::params;
use uuid::Uuid;

use super::Database;
use crate::{
    domain::models::{Document, RegisterDocumentInput},
    error::AppError,
};

impl Database {
    pub fn list_documents(&self, patient_id: Option<&str>) -> Result<Vec<Document>, AppError> {
        let mut statement = self.connection.prepare(
            "SELECT d.id, d.patient_id, p.full_name, d.title, d.document_type, d.template_version, d.encrypted_path, d.checksum, d.created_at FROM documents d LEFT JOIN patients p ON p.id=d.patient_id WHERE (?1 IS NULL OR d.patient_id=?1) ORDER BY d.created_at DESC LIMIT 500"
        )?;
        let rows = statement.query_map([patient_id], |row| {
            Ok(Document {
                id: row.get(0)?,
                patient_id: row.get(1)?,
                patient_name: row.get(2)?,
                title: row.get(3)?,
                document_type: row.get(4)?,
                template_version: row.get(5)?,
                encrypted_path: row.get(6)?,
                checksum: row.get(7)?,
                created_at: row.get(8)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>().map_err(AppError::from)
    }

    pub fn insert_document(
        &self,
        input: &RegisterDocumentInput,
        actor_id: &str,
    ) -> Result<Document, AppError> {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        self.connection.execute(
            "INSERT INTO documents(id, patient_id, title, document_type, template_version, encrypted_path, checksum, created_by, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
            params![id, input.patient_id, input.title, input.document_type, input.template_version, input.encrypted_path, input.checksum, actor_id, now],
        )?;
        let patient_name = if let Some(patient_id) = input.patient_id.as_deref() {
            Some(self.connection.query_row(
                "SELECT full_name FROM patients WHERE id=?1",
                [patient_id],
                |row| row.get(0),
            )?)
        } else {
            None
        };
        Ok(Document {
            id,
            patient_id: input.patient_id.clone(),
            patient_name,
            title: input.title.clone(),
            document_type: input.document_type.clone(),
            template_version: input.template_version,
            encrypted_path: input.encrypted_path.clone(),
            checksum: input.checksum.clone(),
            created_at: now,
        })
    }
}
