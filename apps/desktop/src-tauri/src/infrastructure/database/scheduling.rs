use chrono::Utc;
use rusqlite::{params, OptionalExtension};
use uuid::Uuid;

use super::Database;
use crate::{
    domain::models::{Appointment, CreateAppointmentInput, UpdateAppointmentStatusInput},
    error::AppError,
};

impl Database {
    pub fn list_appointments(
        &self,
        from: &str,
        to: &str,
        professional_id: Option<&str>,
    ) -> Result<Vec<Appointment>, AppError> {
        let mut statement = self.connection.prepare(
            "SELECT a.id, a.patient_id, p.full_name, a.professional_id, u.display_name, a.starts_at, a.ends_at, a.status, a.kind, a.recurrence_id, a.cancellation_reason, a.version FROM appointments a JOIN patients p ON p.id=a.patient_id JOIN users u ON u.id=a.professional_id WHERE a.starts_at >= ?1 AND a.starts_at < ?2 AND (?3 IS NULL OR a.professional_id=?3) ORDER BY a.starts_at LIMIT 1000"
        )?;
        let rows = statement.query_map(params![from, to, professional_id], appointment_from_row)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(AppError::from)
    }

    pub fn insert_appointment(
        &mut self,
        input: &CreateAppointmentInput,
        actor_id: &str,
    ) -> Result<Appointment, AppError> {
        let transaction = self.connection.transaction()?;
        let conflict: bool = transaction.query_row(
            "SELECT EXISTS(SELECT 1 FROM appointments WHERE professional_id=?1 AND status NOT IN ('cancelled','no_show') AND starts_at < ?3 AND ends_at > ?2)",
            params![input.professional_id, input.starts_at, input.ends_at], |row| row.get(0),
        )?;
        if conflict {
            return Err(AppError::Conflict(
                "O profissional já possui atendimento nesse horário.".into(),
            ));
        }
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        transaction.execute(
            "INSERT INTO appointments(id, patient_id, professional_id, starts_at, ends_at, kind, recurrence_id, created_by, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?9)",
            params![id, input.patient_id, input.professional_id, input.starts_at, input.ends_at, input.kind, input.recurrence_id, actor_id, now],
        )?;
        transaction.commit()?;
        self.find_appointment(&id)?.ok_or(AppError::NotFound)
    }

    pub fn update_appointment_status(
        &self,
        id: &str,
        input: &UpdateAppointmentStatusInput,
    ) -> Result<Appointment, AppError> {
        let current = self.find_appointment(id)?.ok_or(AppError::NotFound)?;
        let starts_at = input.starts_at.as_deref().unwrap_or(&current.starts_at);
        let ends_at = input.ends_at.as_deref().unwrap_or(&current.ends_at);
        let conflict: bool = self.connection.query_row(
            "SELECT EXISTS(SELECT 1 FROM appointments WHERE id<>?1 AND professional_id=?2 AND status NOT IN ('cancelled','no_show') AND starts_at < ?4 AND ends_at > ?3)",
            params![id, current.professional_id, starts_at, ends_at], |row| row.get(0),
        )?;
        if conflict {
            return Err(AppError::Conflict(
                "O profissional já possui atendimento nesse horário.".into(),
            ));
        }
        let changed = self.connection.execute(
            "UPDATE appointments SET status=?2, cancellation_reason=?3, starts_at=?4, ends_at=?5, updated_at=?6, version=version+1 WHERE id=?1 AND version=?7",
            params![id, input.status, input.cancellation_reason, starts_at, ends_at, Utc::now().to_rfc3339(), input.version],
        )?;
        if changed == 0 {
            return Err(AppError::Conflict(
                "O agendamento foi alterado. Recarregue antes de salvar.".into(),
            ));
        }
        self.find_appointment(id)?.ok_or(AppError::NotFound)
    }

    pub fn find_appointment(&self, id: &str) -> Result<Option<Appointment>, AppError> {
        self.connection.query_row(
            "SELECT a.id, a.patient_id, p.full_name, a.professional_id, u.display_name, a.starts_at, a.ends_at, a.status, a.kind, a.recurrence_id, a.cancellation_reason, a.version FROM appointments a JOIN patients p ON p.id=a.patient_id JOIN users u ON u.id=a.professional_id WHERE a.id=?1",
            [id], appointment_from_row,
        ).optional().map_err(AppError::from)
    }

    pub fn professional_owns_appointment(
        &self,
        professional_id: &str,
        appointment_id: &str,
    ) -> Result<bool, AppError> {
        self.connection
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM appointments WHERE id=?1 AND professional_id=?2)",
                params![appointment_id, professional_id],
                |row| row.get(0),
            )
            .map_err(AppError::from)
    }
}

pub(crate) fn appointment_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Appointment> {
    Ok(Appointment {
        id: row.get(0)?,
        patient_id: row.get(1)?,
        patient_name: row.get(2)?,
        professional_id: row.get(3)?,
        professional_name: row.get(4)?,
        starts_at: row.get(5)?,
        ends_at: row.get(6)?,
        status: row.get(7)?,
        kind: row.get(8)?,
        recurrence_id: row.get(9)?,
        cancellation_reason: row.get(10)?,
        version: row.get(11)?,
    })
}
