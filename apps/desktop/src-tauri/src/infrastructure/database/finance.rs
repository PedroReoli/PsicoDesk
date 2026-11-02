use chrono::Utc;
use rusqlite::{params, OptionalExtension};
use uuid::Uuid;

use super::Database;
use crate::{
    domain::models::{Charge, CreateChargeInput, Payment, RegisterPaymentInput},
    error::AppError,
};

impl Database {
    pub fn list_charges(&self, status: Option<&str>) -> Result<Vec<Charge>, AppError> {
        let mut statement = self.connection.prepare(
            "SELECT c.id, c.patient_id, p.full_name, c.description, c.amount_minor, COALESCE(SUM(pay.amount_minor),0), c.due_date, c.status, c.created_at FROM charges c JOIN patients p ON p.id=c.patient_id LEFT JOIN payments pay ON pay.charge_id=c.id WHERE (?1 IS NULL OR c.status=?1) GROUP BY c.id ORDER BY c.due_date DESC LIMIT 500"
        )?;
        let rows = statement.query_map([status], charge_from_row)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(AppError::from)
    }

    pub fn insert_charge(
        &self,
        input: &CreateChargeInput,
        actor_id: &str,
    ) -> Result<Charge, AppError> {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        self.connection.execute(
            "INSERT INTO charges(id, patient_id, description, amount_minor, due_date, created_by, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?7)",
            params![id, input.patient_id, input.description, input.amount_minor, input.due_date, actor_id, now],
        )?;
        self.find_charge(&id)?.ok_or(AppError::NotFound)
    }

    pub fn register_payment(
        &mut self,
        charge_id: &str,
        input: &RegisterPaymentInput,
        actor_id: &str,
    ) -> Result<Payment, AppError> {
        let transaction = self.connection.transaction()?;
        let charge_amount: Option<i64> = transaction
            .query_row(
                "SELECT amount_minor FROM charges WHERE id=?1 AND status <> 'cancelled'",
                [charge_id],
                |row| row.get(0),
            )
            .optional()?;
        let charge_amount = charge_amount.ok_or(AppError::NotFound)?;
        let paid: i64 = transaction.query_row(
            "SELECT COALESCE(SUM(amount_minor),0) FROM payments WHERE charge_id=?1",
            [charge_id],
            |row| row.get(0),
        )?;
        if input.amount_minor <= 0 || paid + input.amount_minor > charge_amount {
            return Err(AppError::Validation(
                "O pagamento deve ser positivo e não pode ultrapassar o saldo da cobrança.".into(),
            ));
        }
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        transaction.execute("INSERT INTO payments(id, charge_id, amount_minor, method, paid_at, created_by, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7)", params![id, charge_id, input.amount_minor, input.method, input.paid_at, actor_id, now])?;
        if paid + input.amount_minor == charge_amount {
            transaction.execute(
                "UPDATE charges SET status='paid', updated_at=?2 WHERE id=?1",
                params![charge_id, now],
            )?;
        }
        transaction.commit()?;
        Ok(Payment {
            id,
            charge_id: charge_id.into(),
            amount_minor: input.amount_minor,
            method: input.method.clone(),
            paid_at: input.paid_at.clone(),
            created_at: now,
        })
    }

    fn find_charge(&self, id: &str) -> Result<Option<Charge>, AppError> {
        self.connection.query_row(
            "SELECT c.id, c.patient_id, p.full_name, c.description, c.amount_minor, COALESCE(SUM(pay.amount_minor),0), c.due_date, c.status, c.created_at FROM charges c JOIN patients p ON p.id=c.patient_id LEFT JOIN payments pay ON pay.charge_id=c.id WHERE c.id=?1 GROUP BY c.id",
            [id], charge_from_row,
        ).optional().map_err(AppError::from)
    }
}

fn charge_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Charge> {
    Ok(Charge {
        id: row.get(0)?,
        patient_id: row.get(1)?,
        patient_name: row.get(2)?,
        description: row.get(3)?,
        amount_minor: row.get(4)?,
        paid_minor: row.get(5)?,
        due_date: row.get(6)?,
        status: row.get(7)?,
        created_at: row.get(8)?,
    })
}
