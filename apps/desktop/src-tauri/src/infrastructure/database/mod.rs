mod clinical;
mod documents;
mod finance;
mod patients;
mod reports;
mod scheduling;
mod settings;

use std::path::Path;

use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::Value;
use uuid::Uuid;

use crate::{
    domain::models::{ProfessionalOption, Role, UserSummary},
    error::AppError,
};

pub struct Database {
    pub(crate) connection: Connection,
}

pub struct UserCredential {
    pub user: UserSummary,
    pub password_hash: String,
    pub failed_login_attempts: i64,
    pub locked_until: Option<String>,
}

impl Database {
    pub fn open(path: &Path, key: &[u8]) -> Result<Self, AppError> {
        let connection = Connection::open(path)?;
        let key_literal = format!("x'{}'", hex::encode(key));
        connection.pragma_update(None, "key", key_literal)?;
        connection.pragma_update(None, "cipher_memory_security", "ON")?;
        connection.pragma_update(None, "foreign_keys", "ON")?;
        connection.pragma_update(None, "journal_mode", "WAL")?;
        connection.pragma_update(None, "synchronous", "FULL")?;

        let cipher_version: Option<String> = connection
            .query_row("PRAGMA cipher_version", [], |row| row.get(0))
            .optional()?;
        if cipher_version.as_deref().unwrap_or_default().is_empty() {
            return Err(AppError::Security(
                "SQLCipher não está disponível nesta distribuição.".into(),
            ));
        }

        connection.execute_batch(include_str!("../../../migrations/0001_initial.sql"))?;
        Ok(Self { connection })
    }

    pub fn has_users(&self) -> Result<bool, AppError> {
        let count: i64 = self
            .connection
            .query_row("SELECT COUNT(*) FROM users", [], |row| row.get(0))?;
        Ok(count > 0)
    }

    pub fn insert_user(
        &self,
        display_name: &str,
        username: &str,
        password_hash: &str,
        role: &Role,
        professional_registration: Option<&str>,
    ) -> Result<UserSummary, AppError> {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        self.connection.execute(
            "INSERT INTO users(id, display_name, username, password_hash, role, professional_registration, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)",
            params![id, display_name, username, password_hash, role.as_str(), professional_registration, now],
        ).map_err(map_constraint)?;
        Ok(UserSummary {
            id,
            display_name: display_name.into(),
            username: username.into(),
            role: role.clone(),
            professional_registration: professional_registration.map(str::to_owned),
            status: "active".into(),
            created_at: now,
        })
    }

    pub fn find_user_credential(&self, username: &str) -> Result<Option<UserCredential>, AppError> {
        self.connection.query_row(
            "SELECT id, display_name, username, password_hash, role, professional_registration, status, failed_login_attempts, locked_until, created_at FROM users WHERE username = ?1 COLLATE NOCASE",
            [username],
            |row| {
                let role_text: String = row.get(4)?;
                let role = Role::parse(&role_text).ok_or(rusqlite::Error::InvalidQuery)?;
                Ok(UserCredential {
                    user: UserSummary { id: row.get(0)?, display_name: row.get(1)?, username: row.get(2)?, role, professional_registration: row.get(5)?, status: row.get(6)?, created_at: row.get(9)? },
                    password_hash: row.get(3)?, failed_login_attempts: row.get(7)?, locked_until: row.get(8)?,
                })
            },
        ).optional().map_err(AppError::from)
    }

    pub fn record_login_failure(
        &self,
        user_id: &str,
        attempts: i64,
        locked_until: Option<&str>,
    ) -> Result<(), AppError> {
        self.connection.execute("UPDATE users SET failed_login_attempts = ?2, locked_until = ?3, updated_at = ?4 WHERE id = ?1", params![user_id, attempts, locked_until, Utc::now().to_rfc3339()])?;
        Ok(())
    }

    pub fn clear_login_failures(&self, user_id: &str) -> Result<(), AppError> {
        self.connection.execute("UPDATE users SET failed_login_attempts = 0, locked_until = NULL, updated_at = ?2 WHERE id = ?1", params![user_id, Utc::now().to_rfc3339()])?;
        Ok(())
    }

    pub fn list_users(&self) -> Result<Vec<UserSummary>, AppError> {
        let mut statement = self.connection.prepare("SELECT id, display_name, username, role, professional_registration, status, created_at FROM users ORDER BY display_name COLLATE NOCASE")?;
        let rows = statement.query_map([], |row| {
            let role_text: String = row.get(3)?;
            Ok(UserSummary {
                id: row.get(0)?,
                display_name: row.get(1)?,
                username: row.get(2)?,
                role: Role::parse(&role_text).ok_or(rusqlite::Error::InvalidQuery)?,
                professional_registration: row.get(4)?,
                status: row.get(5)?,
                created_at: row.get(6)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>().map_err(AppError::from)
    }

    pub fn list_active_psychologists(&self) -> Result<Vec<ProfessionalOption>, AppError> {
        let mut statement = self.connection.prepare(
            "SELECT id, display_name, professional_registration FROM users WHERE role='psychologist' AND status='active' ORDER BY display_name COLLATE NOCASE",
        )?;
        let rows = statement.query_map([], |row| {
            Ok(ProfessionalOption {
                id: row.get(0)?,
                display_name: row.get(1)?,
                professional_registration: row.get(2)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>().map_err(AppError::from)
    }

    pub fn update_user_status(&self, id: &str, status: &str) -> Result<UserSummary, AppError> {
        let changed = self.connection.execute(
            "UPDATE users SET status = ?2, updated_at = ?3 WHERE id = ?1",
            params![id, status, Utc::now().to_rfc3339()],
        )?;
        if changed == 0 {
            return Err(AppError::NotFound);
        }
        self.connection.query_row("SELECT id, display_name, username, role, professional_registration, status, created_at FROM users WHERE id = ?1", [id], |row| {
            let role_text: String = row.get(3)?;
            Ok(UserSummary { id: row.get(0)?, display_name: row.get(1)?, username: row.get(2)?, role: Role::parse(&role_text).ok_or(rusqlite::Error::InvalidQuery)?, professional_registration: row.get(4)?, status: row.get(5)?, created_at: row.get(6)? })
        }).map_err(AppError::from)
    }

    pub fn insert_audit_event(
        &self,
        actor_id: Option<&str>,
        action: &str,
        entity_type: &str,
        entity_id: Option<&str>,
        result: &str,
        metadata: &Value,
    ) -> Result<(), AppError> {
        self.connection.execute(
            "INSERT INTO audit_events(id, actor_id, action, entity_type, entity_id, result, metadata_json, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![Uuid::new_v4().to_string(), actor_id, action, entity_type, entity_id, result, metadata.to_string(), Utc::now().to_rfc3339()],
        )?;
        Ok(())
    }
}

pub(crate) fn map_constraint(error: rusqlite::Error) -> AppError {
    match &error {
        rusqlite::Error::SqliteFailure(details, _)
            if details.extended_code == 2067 || details.extended_code == 1555 =>
        {
            AppError::Conflict("Já existe um registro com esses dados.".into())
        }
        _ => AppError::Database(error),
    }
}

#[cfg(test)]
mod tests {
    use rusqlite::Connection;

    #[test]
    fn migration_creates_integrity_constraints_and_immutable_records() {
        let connection = Connection::open_in_memory().expect("database");
        connection
            .pragma_update(None, "foreign_keys", "ON")
            .expect("foreign keys");
        connection
            .execute_batch(include_str!("../../../migrations/0001_initial.sql"))
            .expect("migration");
        connection.execute("INSERT INTO users(id,display_name,username,password_hash,role,status,created_at,updated_at) VALUES ('u1','Profissional','prof','hash','psychologist','active','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')", []).expect("user");
        connection.execute("INSERT INTO patients(id,full_name,status,created_at,updated_at) VALUES ('p1','Paciente Teste','active','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')", []).expect("patient");
        connection.execute("INSERT INTO clinical_records(id,patient_id,author_id,body_ciphertext,content_hash,created_at) VALUES ('r1','p1','u1','conteúdo','sha256:test','2026-01-01T00:00:00Z')", []).expect("record");
        assert!(connection
            .execute(
                "UPDATE clinical_records SET body_ciphertext='alterado' WHERE id='r1'",
                []
            )
            .is_err());
        let integrity: String = connection
            .query_row("PRAGMA integrity_check", [], |row| row.get(0))
            .expect("integrity");
        assert_eq!(integrity, "ok");
    }
}
