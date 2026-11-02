use chrono::{Duration, Utc};
use serde_json::json;
use tauri::State;

use crate::{
    application::{audit, authorization::Principal, validation},
    domain::models::{BootstrapAdminInput, LoginInput, SessionDto},
    error::{AppError, CommandResult},
    security::password,
    state::AppState,
};

#[tauri::command]
pub fn needs_bootstrap(state: State<'_, AppState>) -> CommandResult<bool> {
    let db = state.database.lock().map_err(|_| {
        crate::error::CommandError::from(AppError::Internal("database lock poisoned".into()))
    })?;
    db.has_users()
        .map(|has_users| !has_users)
        .map_err(Into::into)
}

#[tauri::command]
pub fn bootstrap_admin(
    state: State<'_, AppState>,
    input: BootstrapAdminInput,
) -> CommandResult<SessionDto> {
    let display_name = validation::required_text(&input.display_name, "Nome", 2, 120)
        .map_err(crate::error::CommandError::from)?;
    let username =
        validation::username(&input.username).map_err(crate::error::CommandError::from)?;
    validation::password(&input.password).map_err(crate::error::CommandError::from)?;
    let hash =
        password::hash_password(&input.password).map_err(crate::error::CommandError::from)?;
    let db = state.database.lock().map_err(|_| {
        crate::error::CommandError::from(AppError::Internal("database lock poisoned".into()))
    })?;
    if db.has_users().map_err(crate::error::CommandError::from)? {
        return Err(AppError::Conflict("A configuração inicial já foi concluída.".into()).into());
    }
    let user = db
        .insert_user(
            &display_name,
            &username,
            &hash,
            &crate::domain::models::Role::Owner,
            None,
        )
        .map_err(crate::error::CommandError::from)?;
    let principal = Principal {
        user_id: user.id.clone(),
        display_name: user.display_name.clone(),
        role: user.role.clone(),
    };
    audit::record(
        &db,
        Some(&principal),
        "bootstrap.completed",
        "user",
        Some(&user.id),
        "success",
        json!({}),
    )
    .map_err(crate::error::CommandError::from)?;
    let idle_timeout_minutes = db
        .session_idle_timeout_minutes()
        .map_err(crate::error::CommandError::from)?;
    state
        .sessions
        .create(principal, user, idle_timeout_minutes)
        .map_err(Into::into)
}

#[tauri::command]
pub fn login(state: State<'_, AppState>, input: LoginInput) -> CommandResult<SessionDto> {
    let username =
        validation::username(&input.username).map_err(crate::error::CommandError::from)?;
    let db = state.database.lock().map_err(|_| {
        crate::error::CommandError::from(AppError::Internal("database lock poisoned".into()))
    })?;
    let credential = db
        .find_user_credential(&username)
        .map_err(crate::error::CommandError::from)?
        .ok_or_else(|| crate::error::CommandError::from(AppError::InvalidCredentials))?;
    if credential.user.status != "active" {
        return Err(AppError::InvalidCredentials.into());
    }
    if credential
        .locked_until
        .as_deref()
        .and_then(|value| chrono::DateTime::parse_from_rfc3339(value).ok())
        .is_some_and(|until| until.with_timezone(&Utc) > Utc::now())
    {
        return Err(AppError::InvalidCredentials.into());
    }
    if !password::verify_password(&input.password, &credential.password_hash) {
        let attempts = credential.failed_login_attempts + 1;
        let locked_until =
            (attempts >= 5).then(|| (Utc::now() + Duration::minutes(15)).to_rfc3339());
        db.record_login_failure(&credential.user.id, attempts, locked_until.as_deref())
            .map_err(crate::error::CommandError::from)?;
        audit::record(
            &db,
            None,
            "auth.login",
            "user",
            Some(&credential.user.id),
            "denied",
            json!({"reason":"invalid_credentials"}),
        )
        .map_err(crate::error::CommandError::from)?;
        return Err(AppError::InvalidCredentials.into());
    }
    db.clear_login_failures(&credential.user.id)
        .map_err(crate::error::CommandError::from)?;
    let principal = Principal {
        user_id: credential.user.id.clone(),
        display_name: credential.user.display_name.clone(),
        role: credential.user.role.clone(),
    };
    audit::record(
        &db,
        Some(&principal),
        "auth.login",
        "user",
        Some(&credential.user.id),
        "success",
        json!({}),
    )
    .map_err(crate::error::CommandError::from)?;
    let idle_timeout_minutes = db
        .session_idle_timeout_minutes()
        .map_err(crate::error::CommandError::from)?;
    state
        .sessions
        .create(principal, credential.user, idle_timeout_minutes)
        .map_err(Into::into)
}

#[tauri::command(rename_all = "camelCase")]
pub fn logout(state: State<'_, AppState>, session_token: String) -> CommandResult<()> {
    let principal = state
        .sessions
        .principal(&session_token)
        .map_err(crate::error::CommandError::from)?;
    state
        .sessions
        .revoke(&session_token)
        .map_err(crate::error::CommandError::from)?;
    let db = state.database.lock().map_err(|_| {
        crate::error::CommandError::from(AppError::Internal("database lock poisoned".into()))
    })?;
    audit::record(
        &db,
        Some(&principal),
        "auth.logout",
        "user",
        Some(&principal.user_id),
        "success",
        json!({}),
    )
    .map_err(Into::into)
}

#[tauri::command(rename_all = "camelCase")]
pub fn get_session(state: State<'_, AppState>, session_token: String) -> CommandResult<SessionDto> {
    let principal = state
        .sessions
        .principal(&session_token)
        .map_err(crate::error::CommandError::from)?;
    let db = state.database.lock().map_err(|_| {
        crate::error::CommandError::from(AppError::Internal("database lock poisoned".into()))
    })?;
    let user = db
        .list_users()
        .map_err(crate::error::CommandError::from)?
        .into_iter()
        .find(|user| user.id == principal.user_id)
        .ok_or_else(|| crate::error::CommandError::from(AppError::InvalidSession))?;
    state
        .sessions
        .describe(&session_token, user)
        .map_err(Into::into)
}
