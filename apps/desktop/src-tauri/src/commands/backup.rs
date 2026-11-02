use serde_json::json;
use tauri::State;

use crate::{
    application::{
        audit,
        authorization::{require, Permission},
    },
    commands::authenticate,
    domain::models::{BackupInfo, RestoreBackupInput},
    error::{AppError, CommandError, CommandResult},
    infrastructure::backup,
    state::AppState,
};

#[tauri::command(rename_all = "camelCase")]
pub fn create_backup(
    state: State<'_, AppState>,
    session_token: String,
) -> CommandResult<BackupInfo> {
    let principal = authenticate(&state, &session_token).map_err(CommandError::from)?;
    require(&principal, Permission::ManageBackups).map_err(CommandError::from)?;
    let db = state
        .database
        .lock()
        .map_err(|_| CommandError::from(AppError::Internal("database lock poisoned".into())))?;
    let info = backup::create(
        &db,
        state.database_key.as_slice(),
        &state.data_dir.join("backups"),
    )
    .map_err(CommandError::from)?;
    audit::record(
        &db,
        Some(&principal),
        "backup.created",
        "backup",
        Some(&info.id),
        "success",
        json!({"sizeBytes":info.size_bytes}),
    )
    .map_err(CommandError::from)?;
    Ok(info)
}

#[tauri::command(rename_all = "camelCase")]
pub fn list_backups(
    state: State<'_, AppState>,
    session_token: String,
) -> CommandResult<Vec<BackupInfo>> {
    let principal = authenticate(&state, &session_token).map_err(CommandError::from)?;
    require(&principal, Permission::ManageBackups).map_err(CommandError::from)?;
    backup::list(&state.data_dir.join("backups")).map_err(Into::into)
}

#[tauri::command(rename_all = "camelCase")]
pub fn restore_backup(
    state: State<'_, AppState>,
    session_token: String,
    input: RestoreBackupInput,
) -> CommandResult<()> {
    let principal = authenticate(&state, &session_token).map_err(CommandError::from)?;
    require(&principal, Permission::ManageBackups).map_err(CommandError::from)?;
    if input.confirmation != "RESTAURAR BACKUP" {
        return Err(AppError::Validation("Digite RESTAURAR BACKUP para confirmar.".into()).into());
    }
    let mut db = state
        .database
        .lock()
        .map_err(|_| CommandError::from(AppError::Internal("database lock poisoned".into())))?;
    let safety = backup::create(
        &db,
        state.database_key.as_slice(),
        &state.data_dir.join("backups"),
    )
    .map_err(CommandError::from)?;
    audit::record(
        &db,
        Some(&principal),
        "backup.restore_requested",
        "backup",
        Some(&input.backup_id),
        "success",
        json!({"safetyBackupId":safety.id}),
    )
    .map_err(CommandError::from)?;
    backup::restore(
        &mut db,
        state.database_key.as_slice(),
        &state.data_dir.join("backups"),
        &input.backup_id,
    )
    .map_err(CommandError::from)?;
    state.sessions.clear().map_err(CommandError::from)?;
    Ok(())
}
