use chrono::Utc;
use rusqlite::{params, OptionalExtension};

use crate::{domain::models::Role, error::AppError};

use super::Database;

pub struct RecoveryCredential {
    pub user_id: String,
    pub role: Role,
    pub status: String,
    pub code_hash: String,
    pub expires_at: String,
    pub failed_attempts: i64,
    pub locked_until: Option<String>,
}

impl Database {
    pub fn replace_recovery_code(
        &self,
        user_id: &str,
        code_hash: &str,
        expires_at: &str,
    ) -> Result<(), AppError> {
        self.connection.execute(
            "INSERT INTO password_recovery(user_id,code_hash,expires_at,failed_attempts,locked_until,created_at)
             VALUES (?1,?2,?3,0,NULL,?4)
             ON CONFLICT(user_id) DO UPDATE SET code_hash=excluded.code_hash,expires_at=excluded.expires_at,failed_attempts=0,locked_until=NULL,created_at=excluded.created_at",
            params![user_id, code_hash, expires_at, Utc::now().to_rfc3339()],
        )?;
        Ok(())
    }

    pub fn find_recovery_credential(
        &self,
        username: &str,
    ) -> Result<Option<RecoveryCredential>, AppError> {
        self.connection
            .query_row(
                "SELECT u.id,u.role,u.status,r.code_hash,r.expires_at,r.failed_attempts,r.locked_until
                 FROM users u JOIN password_recovery r ON r.user_id=u.id
                 WHERE u.username=?1 COLLATE NOCASE",
                [username],
                |row| {
                    let role: String = row.get(1)?;
                    Ok(RecoveryCredential {
                        user_id: row.get(0)?,
                        role: Role::parse(&role).ok_or(rusqlite::Error::InvalidQuery)?,
                        status: row.get(2)?,
                        code_hash: row.get(3)?,
                        expires_at: row.get(4)?,
                        failed_attempts: row.get(5)?,
                        locked_until: row.get(6)?,
                    })
                },
            )
            .optional()
            .map_err(AppError::from)
    }

    pub fn record_recovery_failure(
        &self,
        user_id: &str,
        attempts: i64,
        locked_until: Option<&str>,
    ) -> Result<(), AppError> {
        self.connection.execute(
            "UPDATE password_recovery SET failed_attempts=?2,locked_until=?3 WHERE user_id=?1",
            params![user_id, attempts, locked_until],
        )?;
        Ok(())
    }

    pub fn consume_recovery_code(
        &mut self,
        user_id: &str,
        new_password_hash: &str,
    ) -> Result<(), AppError> {
        let transaction = self.connection.transaction()?;
        let consumed =
            transaction.execute("DELETE FROM password_recovery WHERE user_id=?1", [user_id])?;
        if consumed != 1 {
            return Err(AppError::InvalidCredentials);
        }
        let updated = transaction.execute(
            "UPDATE users SET password_hash=?2,failed_login_attempts=0,locked_until=NULL,updated_at=?3 WHERE id=?1 AND role='owner' AND status='active'",
            params![user_id, new_password_hash, Utc::now().to_rfc3339()],
        )?;
        if updated != 1 {
            return Err(AppError::InvalidCredentials);
        }
        transaction.commit()?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use rusqlite::Connection;

    use super::*;

    fn database() -> Database {
        let connection = Connection::open_in_memory().expect("database");
        connection
            .execute_batch(include_str!("../../../migrations/0001_initial.sql"))
            .expect("migration");
        connection.execute("INSERT INTO users(id,display_name,username,password_hash,role,status,created_at,updated_at) VALUES ('owner','Owner','owner','old','owner','active','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')", []).expect("owner");
        Database { connection }
    }

    #[test]
    fn recovery_hash_is_rotated_and_consumed_once() {
        let mut db = database();
        db.replace_recovery_code("owner", "$argon2id$first", "2027-01-01T00:00:00Z")
            .expect("first");
        db.replace_recovery_code("owner", "$argon2id$second", "2027-01-01T00:00:00Z")
            .expect("rotate");
        let credential = db
            .find_recovery_credential("owner")
            .expect("find")
            .expect("credential");
        assert_eq!(credential.code_hash, "$argon2id$second");
        db.consume_recovery_code("owner", "new-hash")
            .expect("consume");
        assert!(db
            .find_recovery_credential("owner")
            .expect("find again")
            .is_none());
        assert!(db.consume_recovery_code("owner", "another").is_err());
        let password: String = db
            .connection
            .query_row(
                "SELECT password_hash FROM users WHERE id='owner'",
                [],
                |row| row.get(0),
            )
            .expect("password");
        assert_eq!(password, "new-hash");
    }
}
