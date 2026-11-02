use serde_json::json;
use tauri::State;

use crate::{
    application::{
        audit,
        authorization::{require, Permission},
    },
    commands::authenticate,
    domain::models::{AppSetting, UpdateAppSettingInput},
    error::{AppError, CommandError, CommandResult},
    state::AppState,
};

#[tauri::command(rename_all = "camelCase")]
pub fn get_session_policy(
    state: State<'_, AppState>,
    session_token: String,
) -> CommandResult<AppSetting> {
    authenticate(&state, &session_token).map_err(CommandError::from)?;
    let db = state
        .database
        .lock()
        .map_err(|_| CommandError::from(AppError::Internal("database lock poisoned".into())))?;
    Ok(db
        .get_setting("session_policy")
        .map_err(CommandError::from)?
        .unwrap_or(AppSetting {
            key: "session_policy".into(),
            value: json!({"autoLockMinutes": 15}),
            updated_at: String::new(),
        }))
}

#[tauri::command(rename_all = "camelCase")]
pub fn get_app_settings(
    state: State<'_, AppState>,
    session_token: String,
) -> CommandResult<Vec<AppSetting>> {
    let principal = authenticate(&state, &session_token).map_err(CommandError::from)?;
    require(&principal, Permission::ManageSettings).map_err(CommandError::from)?;
    state
        .database
        .lock()
        .map_err(|_| CommandError::from(AppError::Internal("database lock poisoned".into())))?
        .list_settings()
        .map_err(Into::into)
}

#[tauri::command(rename_all = "camelCase")]
pub fn update_app_setting(
    state: State<'_, AppState>,
    session_token: String,
    input: UpdateAppSettingInput,
) -> CommandResult<AppSetting> {
    let principal = authenticate(&state, &session_token).map_err(CommandError::from)?;
    require(&principal, Permission::ManageSettings).map_err(CommandError::from)?;
    if input.key == "session_policy" {
        let valid = input
            .value
            .as_object()
            .filter(|value| value.len() == 1)
            .and_then(|value| value.get("autoLockMinutes"))
            .and_then(serde_json::Value::as_u64)
            .is_some_and(|minutes| (1..=120).contains(&minutes));
        if !valid {
            return Err(AppError::Validation(
                "O bloqueio automático deve estar entre 1 e 120 minutos.".into(),
            )
            .into());
        }
    }
    let db = state
        .database
        .lock()
        .map_err(|_| CommandError::from(AppError::Internal("database lock poisoned".into())))?;
    let setting = db
        .upsert_setting(&input.key, &input.value, &principal.user_id)
        .map_err(CommandError::from)?;
    audit::record(
        &db,
        Some(&principal),
        "setting.updated",
        "setting",
        Some(&input.key),
        "success",
        json!({}),
    )
    .map_err(CommandError::from)?;
    if input.key == "session_policy" {
        let minutes = input.value["autoLockMinutes"].as_i64().unwrap_or(15);
        state
            .sessions
            .update_idle_timeout(&session_token, minutes)
            .map_err(CommandError::from)?;
    }
    Ok(setting)
}
