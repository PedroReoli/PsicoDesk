use chrono::{Datelike, Duration, Local, TimeZone, Utc};
use rusqlite::params;

use super::{scheduling::appointment_from_row, Database};
use crate::{domain::models::DashboardReport, error::AppError};

impl Database {
    pub fn dashboard_report(
        &self,
        include_finance: bool,
        professional_id: Option<&str>,
    ) -> Result<DashboardReport, AppError> {
        let local_now = Local::now();
        let month_start_local = Local
            .with_ymd_and_hms(local_now.year(), local_now.month(), 1, 0, 0, 0)
            .single()
            .ok_or_else(|| AppError::Internal("invalid local month".into()))?;
        let next_month = if local_now.month() == 12 {
            Local.with_ymd_and_hms(local_now.year() + 1, 1, 1, 0, 0, 0)
        } else {
            Local.with_ymd_and_hms(local_now.year(), local_now.month() + 1, 1, 0, 0, 0)
        }
        .single()
        .ok_or_else(|| AppError::Internal("invalid next month".into()))?;
        let day_start_local = Local
            .with_ymd_and_hms(
                local_now.year(),
                local_now.month(),
                local_now.day(),
                0,
                0,
                0,
            )
            .single()
            .ok_or_else(|| AppError::Internal("invalid local day".into()))?;
        let day_end_local = day_start_local + Duration::days(1);
        let month_start = month_start_local.with_timezone(&Utc).to_rfc3339();
        let month_end = next_month.with_timezone(&Utc).to_rfc3339();
        let day_start = day_start_local.with_timezone(&Utc).to_rfc3339();
        let day_end = day_end_local.with_timezone(&Utc).to_rfc3339();

        let sessions_this_month = self.connection.query_row("SELECT COUNT(*) FROM appointments WHERE starts_at>=?1 AND starts_at<?2 AND status='completed' AND (?3 IS NULL OR professional_id=?3)", params![month_start, month_end, professional_id], |row| row.get(0))?;
        let active_patients = self.connection.query_row(
            "SELECT COUNT(*) FROM patients p WHERE p.status='active' AND (?1 IS NULL OR EXISTS(SELECT 1 FROM patient_professionals pp WHERE pp.patient_id=p.id AND pp.professional_id=?1 AND pp.scope='clinical'))",
            [professional_id],
            |row| row.get(0),
        )?;
        let revenue_this_month_minor = if include_finance {
            self.connection.query_row(
                "SELECT COALESCE(SUM(amount_minor),0) FROM payments WHERE paid_at>=?1 AND paid_at<?2",
                params![month_start, month_end], |row| row.get(0),
            )?
        } else {
            0
        };
        let pending_amount_minor = if include_finance {
            self.connection.query_row("SELECT COALESCE(SUM(amount_minor),0) FROM charges WHERE status IN ('pending','overdue')", [], |row| row.get(0))?
        } else {
            0
        };
        let scheduled_count: i64 = self.connection.query_row("SELECT COUNT(*) FROM appointments WHERE starts_at>=?1 AND starts_at<?2 AND status NOT IN ('cancelled') AND (?3 IS NULL OR professional_id=?3)", params![month_start, month_end, professional_id], |row| row.get(0))?;
        let completed_count: i64 = self.connection.query_row("SELECT COUNT(*) FROM appointments WHERE starts_at>=?1 AND starts_at<?2 AND status='completed' AND (?3 IS NULL OR professional_id=?3)", params![month_start, month_end, professional_id], |row| row.get(0))?;
        let occupancy_percent = if scheduled_count == 0 {
            0
        } else {
            ((completed_count * 100) / scheduled_count).clamp(0, 100)
        };

        let mut statement = self.connection.prepare("SELECT a.id, a.patient_id, p.full_name, a.professional_id, u.display_name, a.starts_at, a.ends_at, a.status, a.kind, a.recurrence_id, a.cancellation_reason, a.version FROM appointments a JOIN patients p ON p.id=a.patient_id JOIN users u ON u.id=a.professional_id WHERE a.starts_at>=?1 AND a.starts_at<?2 AND (?3 IS NULL OR a.professional_id=?3) ORDER BY a.starts_at")?;
        let appointments_today = statement
            .query_map(
                params![day_start, day_end, professional_id],
                appointment_from_row,
            )?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(DashboardReport {
            sessions_this_month,
            active_patients,
            revenue_this_month_minor,
            occupancy_percent,
            pending_amount_minor,
            appointments_today,
        })
    }
}
