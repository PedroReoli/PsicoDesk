use chrono::Utc;
use rusqlite::params;
use serde_json::Value;

use super::Database;
use crate::{domain::models::AppSetting, error::AppError};

const ALLOWED_SETTINGS: &[&str] = &[
    "clinic_profile",
    "backup_policy",
    "session_policy",
    "appearance",
    "document_defaults",
    "retention_notice",
];

impl Database {
    pub fn list_settings(&self) -> Result<Vec<AppSetting>, AppError> {
        let mut statement = self
            .connection
            .prepare("SELECT key, value_json, updated_at FROM app_settings ORDER BY key")?;
        let rows = statement.query_map([], |row| {
            let raw: String = row.get(1)?;
            Ok(AppSetting {
                key: row.get(0)?,
                value: serde_json::from_str(&raw).unwrap_or(Value::Null),
                updated_at: row.get(2)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>().map_err(AppError::from)
    }

    pub fn upsert_setting(
        &self,
        key: &str,
        value: &Value,
        actor_id: &str,
    ) -> Result<AppSetting, AppError> {
        if !ALLOWED_SETTINGS.contains(&key) {
            return Err(AppError::Validation("Configuração não reconhecida.".into()));
        }
        let serialized = serde_json::to_string(value)
            .map_err(|_| AppError::Validation("Valor de configuração inválido.".into()))?;
        if serialized.len() > 32_768 {
            return Err(AppError::Validation(
                "Configuração excede o limite permitido.".into(),
            ));
        }
        let now = Utc::now().to_rfc3339();
        self.connection.execute(
            "INSERT INTO app_settings(key,value_json,updated_by,updated_at) VALUES (?1,?2,?3,?4) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,updated_by=excluded.updated_by,updated_at=excluded.updated_at",
            params![key, serialized, actor_id, now],
        )?;
        Ok(AppSetting {
            key: key.into(),
            value: value.clone(),
            updated_at: now,
        })
    }
}
