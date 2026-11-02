use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::json;
use sha2::{Digest, Sha256};
use tauri::State;
use url::Url;
use uuid::Uuid;

use crate::{
    application::{
        audit,
        authorization::{require, Permission},
    },
    commands::authenticate,
    error::{AppError, CommandError, CommandResult},
    security::key_store,
    state::AppState,
    sync::{
        self,
        models::{
            StartSyncInput, SyncConfig, SyncDeviceIdentity, SyncStatus, UpdateSyncConfigInput,
        },
        DbContext, RuntimeCredentials, SyncRuntime,
    },
};

#[tauri::command(rename_all = "camelCase")]
pub fn get_sync_device_identity(
    state: State<'_, AppState>,
    session_token: String,
) -> CommandResult<SyncDeviceIdentity> {
    let principal = authenticate(&state, &session_token).map_err(CommandError::from)?;
    require(&principal, Permission::ManageSettings).map_err(CommandError::from)?;
    let key = sync::load_signing_key(&state.data_dir.join("sync-signing-key.dpapi"))
        .map_err(AppError::from)
        .map_err(CommandError::from)?;
    let (signing_public_key, signing_key_fingerprint) = sync::public_identity(&key);
    Ok(SyncDeviceIdentity {
        signing_public_key,
        signing_key_fingerprint,
    })
}

#[tauri::command(rename_all = "camelCase")]
pub fn get_sync_config(
    state: State<'_, AppState>,
    session_token: String,
) -> CommandResult<Option<SyncConfig>> {
    let principal = authenticate(&state, &session_token).map_err(CommandError::from)?;
    require(&principal, Permission::ManageSettings).map_err(CommandError::from)?;
    let database = state
        .database
        .lock()
        .map_err(|_| CommandError::from(AppError::Internal("database lock poisoned".into())))?;
    sync::get_config(&database.connection)
        .map_err(AppError::from)
        .map_err(CommandError::from)
}

#[tauri::command(rename_all = "camelCase")]
pub fn update_sync_config(
    state: State<'_, AppState>,
    runtime: State<'_, SyncRuntime>,
    session_token: String,
    input: UpdateSyncConfigInput,
) -> CommandResult<SyncConfig> {
    let principal = authenticate(&state, &session_token).map_err(CommandError::from)?;
    require(&principal, Permission::ManageSettings).map_err(CommandError::from)?;
    let device_secret = input.device_secret.clone();
    let config = validate_config(input).map_err(CommandError::from)?;
    if let Some(secret) = device_secret {
        if secret.trim().len() < 32 || secret.len() > 512 {
            return Err(AppError::Validation("Segredo do dispositivo inválido.".into()).into());
        }
        key_store::store_secret(
            &state.data_dir.join("sync-device-secret.dpapi"),
            secret.as_bytes(),
        )
        .map_err(CommandError::from)?;
    } else if !state.data_dir.join("sync-device-secret.dpapi").is_file() {
        return Err(AppError::Validation(
            "Informe o segredo do dispositivo no primeiro pareamento.".into(),
        )
        .into());
    }
    runtime.stop();
    let database = state
        .database
        .lock()
        .map_err(|_| CommandError::from(AppError::Internal("database lock poisoned".into())))?;
    sync::save_config(&database.connection, &config)
        .map_err(AppError::from)
        .map_err(CommandError::from)?;
    audit::record(
        &database,
        Some(&principal),
        "sync.config_updated",
        "sync_config",
        Some(&config.device_id),
        "success",
        json!({"enabled": config.enabled, "endpointOrigin": endpoint_origin(&config.endpoint)}),
    )
    .map_err(CommandError::from)?;
    Ok(config)
}

#[tauri::command(rename_all = "camelCase")]
pub fn get_sync_status(
    state: State<'_, AppState>,
    runtime: State<'_, SyncRuntime>,
    session_token: String,
) -> CommandResult<SyncStatus> {
    let principal = authenticate(&state, &session_token).map_err(CommandError::from)?;
    require(&principal, Permission::ManageSettings).map_err(CommandError::from)?;
    Ok(runtime.status(&DbContext::from_state(&state)))
}

#[tauri::command(rename_all = "camelCase")]
pub fn start_sync(
    state: State<'_, AppState>,
    runtime: State<'_, SyncRuntime>,
    session_token: String,
    input: StartSyncInput,
) -> CommandResult<SyncStatus> {
    let principal = authenticate(&state, &session_token).map_err(CommandError::from)?;
    require(&principal, Permission::ManageSettings).map_err(CommandError::from)?;
    let config = {
        let database = state
            .database
            .lock()
            .map_err(|_| CommandError::from(AppError::Internal("database lock poisoned".into())))?;
        sync::get_config(&database.connection)
            .map_err(AppError::from)
            .map_err(CommandError::from)?
            .ok_or_else(|| {
                CommandError::from(AppError::Validation(
                    "Configure a sincronização antes de iniciar.".into(),
                ))
            })?
    };
    let encryption_key = sync::decode_encryption_key(&input.encryption_key_base64)
        .map_err(AppError::from)
        .map_err(CommandError::from)?;
    let device_secret = key_store::load_secret(&state.data_dir.join("sync-device-secret.dpapi"))
        .map_err(CommandError::from)?;
    let device_secret = String::from_utf8(device_secret)
        .map_err(|_| CommandError::from(AppError::Security("Segredo local inválido.".into())))?;
    let credentials = RuntimeCredentials::new(device_secret, encryption_key)
        .map_err(AppError::from)
        .map_err(CommandError::from)?;
    let database = DbContext::from_state(&state);
    runtime
        .start(
            config,
            database.clone(),
            state.data_dir.join("sync-signing-key.dpapi"),
            credentials,
        )
        .map_err(AppError::from)
        .map_err(CommandError::from)?;
    if let Ok(database_guard) = state.database.lock() {
        let _ = audit::record(
            &database_guard,
            Some(&principal),
            "sync.started",
            "sync_runtime",
            None,
            "success",
            json!({}),
        );
    }
    Ok(runtime.status(&database))
}

#[tauri::command(rename_all = "camelCase")]
pub fn stop_sync(
    state: State<'_, AppState>,
    runtime: State<'_, SyncRuntime>,
    session_token: String,
) -> CommandResult<SyncStatus> {
    let principal = authenticate(&state, &session_token).map_err(CommandError::from)?;
    require(&principal, Permission::ManageSettings).map_err(CommandError::from)?;
    runtime.stop();
    if let Ok(database) = state.database.lock() {
        let _ = audit::record(
            &database,
            Some(&principal),
            "sync.stopped",
            "sync_runtime",
            None,
            "success",
            json!({}),
        );
    }
    Ok(runtime.status(&DbContext::from_state(&state)))
}

#[tauri::command(rename_all = "camelCase")]
pub async fn sync_now(
    state: State<'_, AppState>,
    runtime: State<'_, SyncRuntime>,
    session_token: String,
) -> CommandResult<SyncStatus> {
    let principal = authenticate(&state, &session_token).map_err(CommandError::from)?;
    require(&principal, Permission::ManageSettings).map_err(CommandError::from)?;
    let database = DbContext::from_state(&state);
    let runtime = runtime.inner().clone();
    runtime
        .sync_now()
        .await
        .map_err(AppError::from)
        .map_err(CommandError::from)?;
    if let Ok(database_guard) = state.database.lock() {
        let _ = audit::record(
            &database_guard,
            Some(&principal),
            "sync.completed",
            "sync_runtime",
            None,
            "success",
            json!({}),
        );
    }
    Ok(runtime.status(&database))
}

fn validate_config(input: UpdateSyncConfigInput) -> Result<SyncConfig, AppError> {
    let endpoint = input.endpoint.trim().trim_end_matches('/').to_string();
    let parsed = Url::parse(&endpoint)
        .map_err(|_| AppError::Validation("Endpoint de sincronização inválido.".into()))?;
    if parsed.scheme() != "https"
        || parsed.host_str().is_none()
        || !parsed.username().is_empty()
        || parsed.password().is_some()
        || parsed.query().is_some()
        || parsed.fragment().is_some()
    {
        return Err(AppError::Validation(
            "O endpoint deve ser uma origem HTTPS sem credenciais, query ou fragmento.".into(),
        ));
    }
    let clinic_id = validate_uuid(&input.clinic_id, "clínica")?;
    let device_id = validate_uuid(&input.device_id, "dispositivo")?;
    let target_device_id = validate_uuid(&input.target_device_id, "dispositivo pareado")?;
    if device_id == target_device_id {
        return Err(AppError::Validation(
            "O dispositivo pareado deve ser diferente deste dispositivo.".into(),
        ));
    }
    let public_key = input.peer_signing_public_key.trim().to_string();
    let decoded = STANDARD.decode(&public_key).map_err(|_| {
        AppError::Validation("Chave pública do dispositivo pareado inválida.".into())
    })?;
    if decoded.len() != 32 {
        return Err(AppError::Validation(
            "Chave pública do dispositivo pareado inválida.".into(),
        ));
    }
    let fingerprint = input.peer_signing_key_fingerprint.trim().to_lowercase();
    let key_id = input.key_id.trim().to_string();
    if key_id.len() < 3 || key_id.len() > 120 {
        return Err(AppError::Validation(
            "Identificador da chave de sincronização inválido.".into(),
        ));
    }
    let calculated = hex::encode(Sha256::digest(&decoded));
    if fingerprint.len() != 64
        || !fingerprint.bytes().all(|value| value.is_ascii_hexdigit())
        || fingerprint != calculated
    {
        return Err(AppError::Validation(
            "Fingerprint do dispositivo pareado inválido.".into(),
        ));
    }
    Ok(SyncConfig {
        endpoint,
        clinic_id,
        device_id,
        target_device_id,
        peer_signing_public_key: public_key,
        peer_signing_key_fingerprint: fingerprint,
        key_id,
        enabled: input.enabled,
    })
}

fn validate_uuid(value: &str, label: &str) -> Result<String, AppError> {
    let value = value.trim();
    Uuid::parse_str(value)
        .map(|parsed| parsed.to_string())
        .map_err(|_| AppError::Validation(format!("Identificador de {label} inválido.")))
}

fn endpoint_origin(endpoint: &str) -> Option<String> {
    Url::parse(endpoint).ok().and_then(|url| {
        url.host_str()
            .map(|host| format!("{}://{host}", url.scheme()))
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn configuration_rejects_insecure_endpoint() {
        let key = [1u8; 32];
        let input = UpdateSyncConfigInput {
            endpoint: "http://example.com".into(),
            clinic_id: "0f927a23-df4a-4eb2-8c9d-b8cd03c54ccb".into(),
            device_id: "ee4e9f12-0a1f-4e59-aac6-44277b5786e9".into(),
            target_device_id: "18cc9817-dbd6-4fc0-89a4-eda41c00e098".into(),
            peer_signing_public_key: STANDARD.encode(key),
            peer_signing_key_fingerprint: hex::encode(Sha256::digest(key)),
            key_id: "clinic-key:v1".into(),
            device_secret: Some("s".repeat(32)),
            enabled: true,
        };
        assert!(validate_config(input).is_err());
    }

    #[test]
    fn configuration_accepts_https_without_secrets() {
        let key = [1u8; 32];
        let input = UpdateSyncConfigInput {
            endpoint: "https://sync.example.com".into(),
            clinic_id: "0f927a23-df4a-4eb2-8c9d-b8cd03c54ccb".into(),
            device_id: "ee4e9f12-0a1f-4e59-aac6-44277b5786e9".into(),
            target_device_id: "18cc9817-dbd6-4fc0-89a4-eda41c00e098".into(),
            peer_signing_public_key: STANDARD.encode(key),
            peer_signing_key_fingerprint: hex::encode(Sha256::digest(key)),
            key_id: "clinic-key:v1".into(),
            device_secret: Some("s".repeat(32)),
            enabled: true,
        };
        let config = validate_config(input).expect("valid config");
        assert_eq!(config.endpoint, "https://sync.example.com");
    }
}
