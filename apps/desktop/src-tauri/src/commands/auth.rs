use chrono::{Duration, Utc};
use rand::{rngs::OsRng, RngCore};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::sync::OnceLock;
use tauri::State;

use crate::{
    application::{audit, authorization::Principal, validation},
    domain::models::{BootstrapAdminInput, LoginInput, SessionDto},
    error::{AppError, CommandResult},
    security::password,
    state::AppState,
};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryCodeDto {
    code: String,
    expires_at: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoverPasswordInput {
    username: String,
    recovery_code: String,
    new_password: String,
}

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

#[tauri::command(rename_all = "camelCase")]
pub fn generate_password_recovery_code(
    state: State<'_, AppState>,
    session_token: String,
) -> CommandResult<RecoveryCodeDto> {
    let principal = state
        .sessions
        .principal(&session_token)
        .map_err(crate::error::CommandError::from)?;
    if principal.role != crate::domain::models::Role::Owner {
        return Err(AppError::Forbidden.into());
    }
    let mut random = [0u8; 24];
    OsRng.fill_bytes(&mut random);
    let compact = hex::encode_upper(random);
    let code = compact
        .as_bytes()
        .chunks(8)
        .map(|chunk| std::str::from_utf8(chunk).unwrap_or_default())
        .collect::<Vec<_>>()
        .join("-");
    let hash = password::hash_password(&compact).map_err(crate::error::CommandError::from)?;
    let expires_at = (Utc::now() + Duration::days(180)).to_rfc3339();
    let db = state.database.lock().map_err(|_| {
        crate::error::CommandError::from(AppError::Internal("database lock poisoned".into()))
    })?;
    db.replace_recovery_code(&principal.user_id, &hash, &expires_at)
        .map_err(crate::error::CommandError::from)?;
    audit::record(
        &db,
        Some(&principal),
        "auth.recovery_code_rotated",
        "user",
        Some(&principal.user_id),
        "success",
        json!({"expiresAt":expires_at}),
    )
    .map_err(crate::error::CommandError::from)?;
    Ok(RecoveryCodeDto { code, expires_at })
}

#[tauri::command]
pub fn recover_password(
    state: State<'_, AppState>,
    input: RecoverPasswordInput,
) -> CommandResult<()> {
    let username = validation::username(&input.username)
        .map_err(|_| crate::error::CommandError::from(AppError::InvalidCredentials))?;
    validation::password(&input.new_password).map_err(crate::error::CommandError::from)?;
    let recovery_code = normalize_recovery_code(&input.recovery_code)
        .ok_or_else(|| crate::error::CommandError::from(AppError::InvalidCredentials))?;
    let mut db = state.database.lock().map_err(|_| {
        crate::error::CommandError::from(AppError::Internal("database lock poisoned".into()))
    })?;
    let credential = db
        .find_recovery_credential(&username)
        .map_err(crate::error::CommandError::from)?;
    let Some(credential) = credential else {
        let _ = password::verify_password(&recovery_code, dummy_recovery_hash());
        return Err(AppError::InvalidCredentials.into());
    };
    let now = Utc::now();
    let available = credential.role == crate::domain::models::Role::Owner
        && credential.status == "active"
        && chrono::DateTime::parse_from_rfc3339(&credential.expires_at)
            .ok()
            .is_some_and(|expires| expires.with_timezone(&Utc) > now)
        && !credential
            .locked_until
            .as_deref()
            .and_then(|value| chrono::DateTime::parse_from_rfc3339(value).ok())
            .is_some_and(|until| until.with_timezone(&Utc) > now);
    let matches = password::verify_password(&recovery_code, &credential.code_hash);
    if !available || !matches {
        let attempts = credential.failed_attempts.saturating_add(1);
        let locked_until = (attempts >= 5).then(|| (now + Duration::minutes(30)).to_rfc3339());
        db.record_recovery_failure(&credential.user_id, attempts, locked_until.as_deref())
            .map_err(crate::error::CommandError::from)?;
        audit::record(
            &db,
            None,
            "auth.password_recovery",
            "user",
            Some(&credential.user_id),
            "denied",
            json!({"reason":"invalid_recovery_credentials"}),
        )
        .map_err(crate::error::CommandError::from)?;
        return Err(AppError::InvalidCredentials.into());
    }
    let new_hash =
        password::hash_password(&input.new_password).map_err(crate::error::CommandError::from)?;
    db.consume_recovery_code(&credential.user_id, &new_hash)
        .map_err(crate::error::CommandError::from)?;
    audit::record(
        &db,
        None,
        "auth.password_recovery",
        "user",
        Some(&credential.user_id),
        "success",
        json!({}),
    )
    .map_err(crate::error::CommandError::from)?;
    state
        .sessions
        .revoke_user(&credential.user_id)
        .map_err(crate::error::CommandError::from)?;
    Ok(())
}

fn normalize_recovery_code(value: &str) -> Option<String> {
    let compact = value
        .chars()
        .filter(|character| *character != '-' && !character.is_whitespace())
        .collect::<String>()
        .to_ascii_uppercase();
    (compact.len() == 48 && compact.bytes().all(|byte| byte.is_ascii_hexdigit())).then_some(compact)
}

fn dummy_recovery_hash() -> &'static str {
    static HASH: OnceLock<String> = OnceLock::new();
    HASH.get_or_init(|| {
        password::hash_password("000000000000000000000000000000000000000000000000")
            .unwrap_or_else(|_| "$argon2id$v=19$m=19456,t=2,p=1$ZmFrZXNhbHQ$ZmFrZWhhc2g".into())
    })
}

#[cfg(test)]
mod recovery_tests {
    use super::normalize_recovery_code;

    #[test]
    fn recovery_code_normalization_accepts_groups_without_weakening_format() {
        let compact = "00112233445566778899AABBCCDDEEFF0011223344556677";
        let grouped = "00112233-44556677-8899aabb-ccddeeff-00112233-44556677";
        assert_eq!(normalize_recovery_code(grouped).as_deref(), Some(compact));
        assert!(normalize_recovery_code("../../not-a-code").is_none());
    }
}
