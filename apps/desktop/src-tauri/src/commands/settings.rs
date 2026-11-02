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
    Ok(setting)
}
