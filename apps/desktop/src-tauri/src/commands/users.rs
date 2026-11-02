use serde_json::json;
use tauri::State;

use crate::{
    application::{
        audit,
        authorization::{require, Permission},
        validation,
    },
    commands::authenticate,
    domain::models::{CreateUserInput, UpdateUserStatusInput, UserSummary},
    error::{AppError, CommandError, CommandResult},
    security::password,
    state::AppState,
};

#[tauri::command(rename_all = "camelCase")]
pub fn list_users(
    state: State<'_, AppState>,
    session_token: String,
) -> CommandResult<Vec<UserSummary>> {
    let principal = authenticate(&state, &session_token).map_err(CommandError::from)?;
    require(&principal, Permission::ManageUsers).map_err(CommandError::from)?;
    state
        .database
        .lock()
        .map_err(|_| CommandError::from(AppError::Internal("database lock poisoned".into())))?
        .list_users()
        .map_err(Into::into)
}

#[tauri::command(rename_all = "camelCase")]
pub fn create_user(
    state: State<'_, AppState>,
    session_token: String,
    input: CreateUserInput,
) -> CommandResult<UserSummary> {
    let principal = authenticate(&state, &session_token).map_err(CommandError::from)?;
    require(&principal, Permission::ManageUsers).map_err(CommandError::from)?;
    let name = validation::required_text(&input.display_name, "Nome", 2, 120)
        .map_err(CommandError::from)?;
    let username = validation::username(&input.username).map_err(CommandError::from)?;
    validation::password(&input.password).map_err(CommandError::from)?;
    if matches!(input.role, crate::domain::models::Role::Owner) {
        return Err(AppError::Forbidden.into());
    }
    if matches!(input.role, crate::domain::models::Role::Psychologist)
        && input
            .professional_registration
            .as_deref()
            .unwrap_or_default()
            .trim()
            .is_empty()
    {
        return Err(
            AppError::Validation("Informe o registro profissional do psicólogo.".into()).into(),
        );
    }
    let hash = password::hash_password(&input.password).map_err(CommandError::from)?;
    let db = state
        .database
        .lock()
        .map_err(|_| CommandError::from(AppError::Internal("database lock poisoned".into())))?;
    let user = db
        .insert_user(
            &name,
            &username,
            &hash,
            &input.role,
            input.professional_registration.as_deref(),
        )
        .map_err(CommandError::from)?;
    audit::record(
        &db,
        Some(&principal),
        "user.created",
        "user",
        Some(&user.id),
        "success",
        json!({"role":user.role.as_str()}),
    )
    .map_err(CommandError::from)?;
    Ok(user)
}

#[tauri::command(rename_all = "camelCase")]
pub fn update_user_status(
    state: State<'_, AppState>,
    session_token: String,
    user_id: String,
    input: UpdateUserStatusInput,
) -> CommandResult<UserSummary> {
    let principal = authenticate(&state, &session_token).map_err(CommandError::from)?;
    require(&principal, Permission::ManageUsers).map_err(CommandError::from)?;
    if user_id == principal.user_id {
        return Err(AppError::Validation("Você não pode desativar a própria conta.".into()).into());
    }
    if !matches!(input.status.as_str(), "active" | "inactive" | "locked") {
        return Err(AppError::Validation("Status de usuário inválido.".into()).into());
    }
    let db = state
        .database
        .lock()
        .map_err(|_| CommandError::from(AppError::Internal("database lock poisoned".into())))?;
    let user = db
        .update_user_status(&user_id, &input.status)
        .map_err(CommandError::from)?;
    state
        .sessions
        .revoke_user(&user_id)
        .map_err(CommandError::from)?;
    audit::record(
        &db,
        Some(&principal),
        "user.status_updated",
        "user",
        Some(&user_id),
        "success",
        json!({"status":input.status}),
    )
    .map_err(CommandError::from)?;
    Ok(user)
}
