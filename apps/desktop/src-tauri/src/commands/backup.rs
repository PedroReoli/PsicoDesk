use serde::Deserialize;
use serde_json::json;
use tauri::{Manager, State};

use crate::{
    application::{
        audit,
        authorization::{require, Permission},
    },
    commands::authenticate,
    domain::models::{BackupInfo, RestoreBackupInput},
    error::{AppError, CommandError, CommandResult},
    infrastructure::{backup, portable_backup},
    state::AppState,
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PortableBackupInput {
    passphrase: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RestorePortableBackupInput {
    backup_id: String,
    passphrase: String,
    confirmation: String,
}

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
    Ok(())
}

#[tauri::command(rename_all = "camelCase")]
pub fn export_portable_backup(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    session_token: String,
    input: PortableBackupInput,
) -> CommandResult<portable_backup::PortableBackupInfo> {
    let principal = authenticate(&state, &session_token).map_err(CommandError::from)?;
    require(&principal, Permission::ManageBackups).map_err(CommandError::from)?;
    let directory = portable_directory(&app).map_err(CommandError::from)?;
    let db = state
        .database
        .lock()
        .map_err(|_| CommandError::from(AppError::Internal("database lock poisoned".into())))?;
    let info = portable_backup::export(
        &db,
        state.database_key.as_slice(),
        &state.data_dir.join("documents"),
        &directory,
        &input.passphrase,
    )
    .map_err(CommandError::from)?;
    audit::record(
        &db,
        Some(&principal),
        "backup.portable_exported",
        "backup",
        Some(&info.id),
        "success",
        json!({"sizeBytes":info.size_bytes}),
    )
    .map_err(CommandError::from)?;
    Ok(info)
}

#[tauri::command(rename_all = "camelCase")]
pub fn list_portable_backups(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    session_token: String,
) -> CommandResult<Vec<portable_backup::PortableBackupInfo>> {
    let principal = authenticate(&state, &session_token).map_err(CommandError::from)?;
    require(&principal, Permission::ManageBackups).map_err(CommandError::from)?;
    let directory = portable_directory(&app).map_err(CommandError::from)?;
    portable_backup::list(&directory).map_err(Into::into)
}

#[tauri::command(rename_all = "camelCase")]
pub fn restore_portable_backup(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    session_token: String,
    input: RestorePortableBackupInput,
) -> CommandResult<()> {
    let principal = authenticate(&state, &session_token).map_err(CommandError::from)?;
    require(&principal, Permission::ManageBackups).map_err(CommandError::from)?;
    if input.confirmation != "RESTAURAR BACKUP PORTÁTIL" {
        return Err(AppError::Validation(
            "Digite RESTAURAR BACKUP PORTÁTIL para confirmar.".into(),
        )
        .into());
    }
    let directory = portable_directory(&app).map_err(CommandError::from)?;
    let internal_directory = state.data_dir.join("backups");
    let mut db = state
        .database
        .lock()
        .map_err(|_| CommandError::from(AppError::Internal("database lock poisoned".into())))?;
    let safety = backup::create(&db, state.database_key.as_slice(), &internal_directory)
        .map_err(CommandError::from)?;
    let result = portable_backup::restore(
        &mut db,
        state.database_key.as_slice(),
        &state.data_dir.join("documents"),
        &directory,
        &input.backup_id,
        &input.passphrase,
    );
    if let Err(error) = result {
        backup::restore(
            &mut db,
            state.database_key.as_slice(),
            &internal_directory,
            &safety.id,
        )
        .map_err(|_| {
            CommandError::from(AppError::Internal(
                "portable restore and safety rollback failed".into(),
            ))
        })?;
        audit::record(
            &db,
            Some(&principal),
            "backup.portable_restore",
            "backup",
            Some(&input.backup_id),
            "denied",
            json!({"reason":"validation_failed"}),
        )
        .map_err(CommandError::from)?;
        return Err(CommandError::from(error));
    }
    state.sessions.clear().map_err(CommandError::from)?;
    audit::record(
        &db,
        Some(&principal),
        "backup.portable_restore",
        "backup",
        Some(&input.backup_id),
        "success",
        json!({"safetyBackupId":safety.id}),
    )
    .map_err(CommandError::from)?;
    Ok(())
}

fn portable_directory(app: &tauri::AppHandle) -> Result<std::path::PathBuf, AppError> {
    let documents = app.path().document_dir().map_err(|_| {
        AppError::Validation("A pasta Documentos não está disponível neste computador.".into())
    })?;
    Ok(documents.join("PsicoDesk").join("Backups"))
}
