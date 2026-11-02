use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex, RwLock,
    },
    time::Duration,
};

use chrono::{Duration as ChronoDuration, Utc};
use futures_util::StreamExt;
use rand::Rng;
use tokio::time::{sleep, timeout};
use tokio_tungstenite::{connect_async, tungstenite::client::IntoClientRequest};
use tracing::{info, warn};
use url::Url;
use uuid::Uuid;
use zeroize::Zeroizing;

use super::{
    client::SyncClient,
    crypto,
    models::{
        BatchEnvelope, PayloadResponse, PullResponse, PushResponse, SyncConfig, SyncStatus,
        TransferItem, SYNC_SCHEMA_VERSION,
    },
    repository::{self, DbContext},
    SyncError,
};

#[derive(Clone)]
pub struct RuntimeCredentials {
    device_secret: Zeroizing<String>,
    encryption_key: Zeroizing<Vec<u8>>,
}

impl RuntimeCredentials {
    pub fn new(device_secret: String, encryption_key: Vec<u8>) -> Result<Self, SyncError> {
        if device_secret.trim().len() < 32 {
            return Err(SyncError::InvalidConfig(
                "O segredo do dispositivo é inválido.".into(),
            ));
        }
        Ok(Self {
            device_secret: Zeroizing::new(device_secret),
            encryption_key: Zeroizing::new(encryption_key),
        })
    }
}

#[derive(Clone)]
struct WorkerContext {
    config: SyncConfig,
    database: DbContext,
    signing_key_path: PathBuf,
    credentials: RuntimeCredentials,
    token_cache: Arc<tokio::sync::Mutex<Option<CachedToken>>>,
}

struct CachedToken {
    value: Zeroizing<String>,
    expires_at: chrono::DateTime<Utc>,
}

struct SyncRuntimeInner {
    running: AtomicBool,
    status: RwLock<SyncStatus>,
    context: Mutex<Option<WorkerContext>>,
    sync_lock: tokio::sync::Mutex<()>,
}

#[derive(Clone)]
pub struct SyncRuntime {
    inner: Arc<SyncRuntimeInner>,
}

impl Default for SyncRuntime {
    fn default() -> Self {
        Self {
            inner: Arc::new(SyncRuntimeInner {
                running: AtomicBool::new(false),
                status: RwLock::new(SyncStatus::default()),
                context: Mutex::new(None),
                sync_lock: tokio::sync::Mutex::new(()),
            }),
        }
    }
}

impl SyncRuntime {
    pub fn status(&self, database: &DbContext) -> SyncStatus {
        let mut status = self
            .inner
            .status
            .read()
            .map(|value| value.clone())
            .unwrap_or_default();
        status.running = self.inner.running.load(Ordering::Acquire);
        if let Ok(connection) = database.open() {
            status.pending_items = repository::pending_count(&connection).unwrap_or(0);
            status.conflicts = repository::conflict_count(&connection).unwrap_or(0);
            if let Ok(config) = repository::get_config(&connection) {
                status.configured = config.is_some();
                status.enabled = config.is_some_and(|value| value.enabled);
            }
        }
        status
    }

    pub fn start(
        &self,
        config: SyncConfig,
        database: DbContext,
        signing_key_path: PathBuf,
        credentials: RuntimeCredentials,
    ) -> Result<(), SyncError> {
        if !config.enabled {
            return Err(SyncError::InvalidConfig(
                "Ative a sincronização antes de iniciar.".into(),
            ));
        }
        if self
            .inner
            .running
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .is_err()
        {
            return Ok(());
        }
        let context = WorkerContext {
            config,
            database,
            signing_key_path,
            credentials,
            token_cache: Arc::new(tokio::sync::Mutex::new(None)),
        };
        *self
            .inner
            .context
            .lock()
            .map_err(|_| SyncError::State("sync context lock poisoned".into()))? =
            Some(context.clone());
        self.update_status(|status| {
            status.running = true;
            status.last_error = None;
        });

        let periodic_runtime = self.clone();
        let periodic_context = context.clone();
        tauri::async_runtime::spawn(async move {
            periodic_runtime.periodic_loop(periodic_context).await;
        });
        let websocket_runtime = self.clone();
        tauri::async_runtime::spawn(async move {
            websocket_runtime.websocket_loop(context).await;
        });
        Ok(())
    }

    pub fn stop(&self) {
        self.inner.running.store(false, Ordering::Release);
        if let Ok(mut context) = self.inner.context.lock() {
            context.take();
        }
        self.update_status(|status| {
            status.running = false;
            status.websocket_connected = false;
        });
    }

    pub async fn sync_now(&self) -> Result<(), SyncError> {
        let context = self
            .inner
            .context
            .lock()
            .map_err(|_| SyncError::State("sync context lock poisoned".into()))?
            .clone()
            .ok_or_else(|| {
                SyncError::InvalidConfig("Inicie a sincronização antes de sincronizar.".into())
            })?;
        self.run_serialized(&context).await
    }

    async fn periodic_loop(&self, context: WorkerContext) {
        while self.inner.running.load(Ordering::Acquire) {
            if let Err(error) = self.run_serialized(&context).await {
                self.record_failure(&error);
                warn!(module = "sync", "ciclo de sincronização falhou");
            }
            sleep(Duration::from_secs(60)).await;
        }
    }

    async fn websocket_loop(&self, context: WorkerContext) {
        let mut attempt = 0u32;
        while self.inner.running.load(Ordering::Acquire) {
            let ticket = match SyncClient::new() {
                Ok(client) => match access_token(&context, &client, false).await {
                    Ok(token) => match client.realtime_ticket(&context.config, &token).await {
                        Err(SyncError::HttpStatus(401)) => {
                            match access_token(&context, &client, true).await {
                                Ok(token) => client.realtime_ticket(&context.config, &token).await,
                                Err(error) => Err(error),
                            }
                        }
                        result => result,
                    },
                    Err(error) => Err(error),
                },
                Err(error) => Err(error),
            };
            match ticket.and_then(|ticket| websocket_request(&context, &ticket.ticket)) {
                Ok(request) => match connect_async(request).await {
                    Ok((mut stream, _)) => {
                        attempt = 0;
                        self.update_status(|status| status.websocket_connected = true);
                        info!(module = "sync", "canal de sinalização conectado");
                        while self.inner.running.load(Ordering::Acquire) {
                            match timeout(Duration::from_secs(45), stream.next()).await {
                                Ok(Some(Ok(message))) if message.is_text() => {
                                    if is_sync_signal(message.to_text().unwrap_or_default()) {
                                        if let Err(error) = self.run_serialized(&context).await {
                                            self.record_failure(&error);
                                        }
                                    }
                                }
                                Ok(Some(Ok(_))) => {}
                                Ok(Some(Err(_))) | Ok(None) => break,
                                Err(_) => continue,
                            }
                        }
                    }
                    Err(_) => {
                        warn!(module = "sync", "canal de sinalização indisponível");
                    }
                },
                Err(error) => self.record_failure(&error),
            }
            self.update_status(|status| status.websocket_connected = false);
            if !self.inner.running.load(Ordering::Acquire) {
                break;
            }
            attempt = attempt.saturating_add(1).min(6);
            sleep(reconnect_delay(attempt)).await;
        }
    }

    async fn run_serialized(&self, context: &WorkerContext) -> Result<(), SyncError> {
        let _guard = self.inner.sync_lock.lock().await;
        run_once(context).await?;
        self.update_status(|status| {
            status.last_sync_at = Some(Utc::now().to_rfc3339());
            status.last_error = None;
        });
        Ok(())
    }

    fn record_failure(&self, error: &SyncError) {
        let message = match error {
            SyncError::HttpStatus(401 | 403) => {
                "A autorização da sincronização expirou.".to_string()
            }
            SyncError::Http(_) | SyncError::HttpStatus(_) | SyncError::WebSocket(_) => {
                "O serviço de sincronização está indisponível.".to_string()
            }
            SyncError::InvalidBatch(_) => "Um lote remoto inválido foi rejeitado.".to_string(),
            _ => "Não foi possível concluir a sincronização.".to_string(),
        };
        self.update_status(|status| status.last_error = Some(message));
    }

    fn update_status(&self, update: impl FnOnce(&mut SyncStatus)) {
        if let Ok(mut status) = self.inner.status.write() {
            update(&mut status);
        }
    }
}

async fn run_once(context: &WorkerContext) -> Result<(), SyncError> {
    let client = SyncClient::new()?;
    validate_paired_peer(context, &client).await?;
    let connection = context.database.open()?;
    let existing_outbox = repository::load_outbox(&connection)?;
    let (queue_ids, envelope) = if let Some((envelope, ids)) = existing_outbox {
        (ids, Some(envelope))
    } else {
        let queue = repository::load_pending(&connection, 100)?;
        let ids: Vec<String> = queue.iter().map(|item| item.queue_id.clone()).collect();
        if queue.is_empty() {
            (ids, None)
        } else {
            let envelope = build_envelope(context, &queue)?;
            repository::mark_sending(&connection, &ids)?;
            repository::save_outbox(&connection, &envelope, &ids)?;
            (ids, Some(envelope))
        }
    };
    drop(connection);

    if let Some(envelope) = envelope {
        match push_with_refresh(context, &client, &envelope).await {
            Ok(response) => {
                let connection = context.database.open()?;
                repository::mark_sent(&connection, &queue_ids, &response.delivery_cursor)?;
                repository::clear_outbox(&connection, &envelope.batch_id)?;
            }
            Err(error) => {
                let connection = context.database.open()?;
                repository::mark_failed(&connection, &queue_ids)?;
                return Err(error);
            }
        }
    }

    let connection = context.database.open()?;
    let mut cursor = repository::cursor(&connection, "pull")?.unwrap_or_else(|| "0".into());
    drop(connection);
    loop {
        let response = pull_with_refresh(context, &client, &cursor).await?;
        let page_was_empty = response.items.is_empty();
        for metadata in response.items {
            let payload = payload_with_refresh(context, &client, &metadata.batch_id).await?;
            let delivery_cursor = metadata.delivery_cursor.clone();
            let envelope = metadata.with_payload(payload)?;
            let items = match decode_envelope(context, &envelope) {
                Ok(items) => items,
                Err(error) => {
                    let _ = acknowledge_with_refresh(
                        context,
                        &client,
                        &envelope,
                        "rejected",
                        &envelope.created_at,
                    )
                    .await;
                    return Err(error);
                }
            };
            let mut connection = context.database.open()?;
            repository::apply_batch(
                &mut connection,
                &envelope.batch_id,
                &envelope.content_hash,
                items,
            )?;
            let imported_at = repository::batch_applied_at(&connection, &envelope.batch_id)?
                .ok_or_else(|| SyncError::State("lote aplicado sem registro idempotente".into()))?;
            drop(connection);
            acknowledge_with_refresh(context, &client, &envelope, "applied", &imported_at).await?;
            let connection = context.database.open()?;
            repository::advance_pull_cursor(&connection, &delivery_cursor)?;
        }
        if page_was_empty {
            let connection = context.database.open()?;
            repository::advance_pull_cursor(&connection, &response.next_cursor)?;
        }
        if !response.has_more {
            break;
        }
        if response.next_cursor == cursor {
            return Err(SyncError::InvalidBatch(
                "paginação remota não avançou".into(),
            ));
        }
        cursor = response.next_cursor;
    }
    Ok(())
}

async fn access_token(
    context: &WorkerContext,
    client: &SyncClient,
    force_refresh: bool,
) -> Result<String, SyncError> {
    let mut cache = context.token_cache.lock().await;
    if !force_refresh {
        if let Some(token) = cache.as_ref() {
            if token.expires_at > Utc::now() + ChronoDuration::seconds(60) {
                return Ok(token.value.to_string());
            }
        }
    }
    let issued = client
        .authenticate(&context.config, context.credentials.device_secret.as_str())
        .await?;
    if issued.access_token.trim().is_empty() || issued.expires_in <= 0 {
        return Err(SyncError::InvalidConfig(
            "Resposta de autenticação do dispositivo inválida.".into(),
        ));
    }
    let value = issued.access_token;
    *cache = Some(CachedToken {
        value: Zeroizing::new(value.clone()),
        expires_at: Utc::now() + ChronoDuration::seconds(issued.expires_in),
    });
    Ok(value)
}

async fn validate_paired_peer(
    context: &WorkerContext,
    client: &SyncClient,
) -> Result<(), SyncError> {
    let mut token = access_token(context, client, false).await?;
    let peers = match client.peers(&context.config, &token).await {
        Err(SyncError::HttpStatus(401)) => {
            token = access_token(context, client, true).await?;
            client.peers(&context.config, &token).await?
        }
        result => result?,
    };
    let valid = peers.peers.iter().any(|peer| {
        peer.device_id == context.config.target_device_id
            && peer.signing_public_key == context.config.peer_signing_public_key
            && peer
                .signing_key_fingerprint
                .eq_ignore_ascii_case(&context.config.peer_signing_key_fingerprint)
    });
    if !valid {
        return Err(SyncError::InvalidConfig(
            "O dispositivo pareado não consta no diretório autenticado.".into(),
        ));
    }
    Ok(())
}

async fn push_with_refresh(
    context: &WorkerContext,
    client: &SyncClient,
    envelope: &BatchEnvelope,
) -> Result<PushResponse, SyncError> {
    let token = access_token(context, client, false).await?;
    match client.push_batch(&context.config, &token, envelope).await {
        Err(SyncError::HttpStatus(401)) => {
            let token = access_token(context, client, true).await?;
            client.push_batch(&context.config, &token, envelope).await
        }
        result => result,
    }
}

async fn pull_with_refresh(
    context: &WorkerContext,
    client: &SyncClient,
    cursor: &str,
) -> Result<PullResponse, SyncError> {
    let token = access_token(context, client, false).await?;
    match client
        .pull_batches(&context.config, &token, Some(cursor))
        .await
    {
        Err(SyncError::HttpStatus(401)) => {
            let token = access_token(context, client, true).await?;
            client
                .pull_batches(&context.config, &token, Some(cursor))
                .await
        }
        result => result,
    }
}

async fn payload_with_refresh(
    context: &WorkerContext,
    client: &SyncClient,
    batch_id: &str,
) -> Result<PayloadResponse, SyncError> {
    let token = access_token(context, client, false).await?;
    match client
        .fetch_payload(&context.config, &token, batch_id)
        .await
    {
        Err(SyncError::HttpStatus(401)) => {
            let token = access_token(context, client, true).await?;
            client
                .fetch_payload(&context.config, &token, batch_id)
                .await
        }
        result => result,
    }
}

async fn acknowledge_with_refresh(
    context: &WorkerContext,
    client: &SyncClient,
    envelope: &BatchEnvelope,
    status: &str,
    imported_at: &str,
) -> Result<(), SyncError> {
    let token = access_token(context, client, false).await?;
    match client
        .acknowledge(&context.config, &token, envelope, status, imported_at)
        .await
    {
        Err(SyncError::HttpStatus(401)) => {
            let token = access_token(context, client, true).await?;
            client
                .acknowledge(&context.config, &token, envelope, status, imported_at)
                .await
        }
        result => result,
    }
}

fn build_envelope(
    context: &WorkerContext,
    queue: &[super::models::QueueItem],
) -> Result<BatchEnvelope, SyncError> {
    let payload: Vec<TransferItem> = queue.iter().map(TransferItem::from).collect();
    let serialized = serde_json::to_vec(&payload)?;
    let (nonce, payload_ciphertext) =
        crypto::encrypt(&serialized, context.credentials.encryption_key.as_slice())?;
    let now = Utc::now();
    let mut envelope = BatchEnvelope {
        schema_version: SYNC_SCHEMA_VERSION,
        batch_id: Uuid::new_v4().to_string(),
        origin_device_id: context.config.device_id.clone(),
        target_device_id: context.config.target_device_id.clone(),
        created_at: now.to_rfc3339(),
        expires_at: (now + ChronoDuration::minutes(10)).to_rfc3339(),
        content_hash: crypto::hash_ciphertext(&payload_ciphertext)?,
        signature: String::new(),
        signer_public_key: String::new(),
        encryption: super::models::EncryptionMetadata {
            algorithm: "aes-256-gcm".into(),
            key_id: context.config.key_id.clone(),
            nonce,
        },
        payload_base64: payload_ciphertext,
    };
    let signing_key = crypto::load_signing_key(&context.signing_key_path)?;
    crypto::sign_envelope(&mut envelope, &signing_key);
    Ok(envelope)
}

fn decode_envelope(
    context: &WorkerContext,
    envelope: &BatchEnvelope,
) -> Result<Vec<TransferItem>, SyncError> {
    if envelope.schema_version != SYNC_SCHEMA_VERSION {
        return Err(SyncError::InvalidBatch(
            "versão de lote incompatível".into(),
        ));
    }
    if Uuid::parse_str(&envelope.batch_id).is_err() {
        return Err(SyncError::InvalidBatch(
            "identificador de lote inválido".into(),
        ));
    }
    if envelope.target_device_id != context.config.device_id {
        return Err(SyncError::InvalidBatch(
            "lote destinado a outro dispositivo".into(),
        ));
    }
    if envelope.origin_device_id != context.config.target_device_id {
        return Err(SyncError::InvalidBatch(
            "lote originado por dispositivo não pareado".into(),
        ));
    }
    let expires_at = chrono::DateTime::parse_from_rfc3339(&envelope.expires_at)
        .map_err(|_| SyncError::InvalidBatch("expiração inválida".into()))?;
    if expires_at < Utc::now() {
        return Err(SyncError::InvalidBatch("lote expirado".into()));
    }
    if envelope.encryption.algorithm != "aes-256-gcm" {
        return Err(SyncError::InvalidBatch(
            "algoritmo de criptografia incompatível".into(),
        ));
    }
    if envelope.encryption.key_id != context.config.key_id {
        return Err(SyncError::InvalidBatch(
            "identificador da chave de sincronização incompatível".into(),
        ));
    }
    crypto::verify_envelope(
        envelope,
        &context.config.peer_signing_public_key,
        &context.config.peer_signing_key_fingerprint,
    )?;
    let plaintext = crypto::decrypt(
        &envelope.encryption.nonce,
        &envelope.payload_base64,
        context.credentials.encryption_key.as_slice(),
    )?;
    serde_json::from_slice(&plaintext).map_err(Into::into)
}

fn websocket_request(
    context: &WorkerContext,
    ticket: &str,
) -> Result<tokio_tungstenite::tungstenite::http::Request<()>, SyncError> {
    let mut url = Url::parse(&context.config.endpoint)
        .map_err(|_| SyncError::InvalidConfig("Endpoint de sincronização inválido.".into()))?;
    url.set_scheme(if url.scheme() == "https" { "wss" } else { "ws" })
        .map_err(|_| SyncError::InvalidConfig("Endpoint de sincronização inválido.".into()))?;
    url.set_path("/v1/realtime");
    url.query_pairs_mut().clear().append_pair("ticket", ticket);
    let request = url
        .as_str()
        .into_client_request()
        .map_err(SyncError::WebSocket)?;
    Ok(request)
}

fn is_sync_signal(message: &str) -> bool {
    serde_json::from_str::<serde_json::Value>(message)
        .ok()
        .and_then(|value| {
            value
                .get("type")
                .and_then(|event| event.as_str())
                .map(str::to_owned)
        })
        .is_some_and(|event| event == "batch.available")
}

fn reconnect_delay(attempt: u32) -> Duration {
    let base = (1_u64 << attempt.min(5)).min(30);
    let jitter = rand::thread_rng().gen_range(0..=500);
    Duration::from_millis(base * 1_000 + jitter)
}

#[cfg(test)]
mod tests {
    use base64::{engine::general_purpose::STANDARD, Engine};

    use super::*;

    #[test]
    fn signal_requires_expected_event() {
        assert!(is_sync_signal(
            r#"{"type":"batch.available","batchId":"0f927a23-df4a-4eb2-8c9d-b8cd03c54ccb"}"#
        ));
        assert!(!is_sync_signal(r#"{"type":"device.presence"}"#));
        assert!(!is_sync_signal("not-json"));
    }

    #[test]
    fn websocket_backoff_is_bounded() {
        assert!(reconnect_delay(20) <= Duration::from_millis(30_500));
    }

    #[test]
    fn public_key_is_base64_encoded() {
        let key = [4u8; 32];
        assert_eq!(STANDARD.decode(STANDARD.encode(key)).expect("decode"), key);
    }
}
