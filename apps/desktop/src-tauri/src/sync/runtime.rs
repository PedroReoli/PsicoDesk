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
    models::{BatchEnvelope, SyncConfig, SyncStatus, TransferItem, SYNC_SCHEMA_VERSION},
    repository::{self, DbContext},
    SyncError,
};

#[derive(Clone)]
pub struct RuntimeCredentials {
    access_token: Zeroizing<String>,
    encryption_key: Zeroizing<Vec<u8>>,
}

impl RuntimeCredentials {
    pub fn new(access_token: String, encryption_key: Vec<u8>) -> Result<Self, SyncError> {
        if access_token.trim().len() < 16 {
            return Err(SyncError::InvalidConfig(
                "O token de sincronização é inválido.".into(),
            ));
        }
        Ok(Self {
            access_token: Zeroizing::new(access_token),
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
            match websocket_request(&context) {
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
    let connection = context.database.open()?;
    let queue = repository::load_pending(&connection, 100)?;
    let queue_ids: Vec<String> = queue.iter().map(|item| item.queue_id.clone()).collect();
    if !queue.is_empty() {
        repository::mark_sending(&connection, &queue_ids)?;
    }
    drop(connection);

    if !queue.is_empty() {
        let envelope = build_envelope(context, &queue)?;
        match client
            .push_batch(
                &context.config,
                context.credentials.access_token.as_str(),
                &envelope,
            )
            .await
        {
            Ok(response) => {
                let connection = context.database.open()?;
                repository::mark_sent(&connection, &queue_ids, &response.cursor)?;
            }
            Err(error) => {
                let connection = context.database.open()?;
                repository::mark_failed(&connection, &queue_ids)?;
                return Err(error);
            }
        }
    }

    let connection = context.database.open()?;
    let previous_cursor = repository::cursor(&connection, "pull")?;
    drop(connection);
    let response = client
        .pull_batches(
            &context.config,
            context.credentials.access_token.as_str(),
            previous_cursor.as_deref(),
        )
        .await?;
    let batch_count = response.batches.len();
    for (index, envelope) in response.batches.into_iter().enumerate() {
        let items = decode_envelope(context, &envelope)?;
        let cursor = if index + 1 == batch_count {
            response.cursor.as_str()
        } else {
            previous_cursor.as_deref().unwrap_or("")
        };
        let mut connection = context.database.open()?;
        repository::apply_batch(
            &mut connection,
            &envelope.batch_id,
            &envelope.content_hash,
            cursor,
            items,
        )?;
        drop(connection);
        client
            .acknowledge(
                &context.config,
                context.credentials.access_token.as_str(),
                &envelope.batch_id,
            )
            .await?;
    }
    Ok(())
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
        origin_id: context.config.device_id.clone(),
        target_id: context.config.clinic_id.clone(),
        created_at: now.to_rfc3339(),
        expires_at: (now + ChronoDuration::minutes(10)).to_rfc3339(),
        content_hash: crypto::hash_ciphertext(&payload_ciphertext)?,
        signature: String::new(),
        signer_public_key: String::new(),
        nonce,
        payload_ciphertext,
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
    if envelope.target_id != context.config.clinic_id {
        return Err(SyncError::InvalidBatch(
            "lote destinado a outra clínica".into(),
        ));
    }
    let expires_at = chrono::DateTime::parse_from_rfc3339(&envelope.expires_at)
        .map_err(|_| SyncError::InvalidBatch("expiração inválida".into()))?;
    if expires_at < Utc::now() {
        return Err(SyncError::InvalidBatch("lote expirado".into()));
    }
    crypto::verify_envelope(envelope, &context.config.trusted_server_public_key)?;
    let plaintext = crypto::decrypt(
        &envelope.nonce,
        &envelope.payload_ciphertext,
        context.credentials.encryption_key.as_slice(),
    )?;
    serde_json::from_slice(&plaintext).map_err(Into::into)
}

fn websocket_request(
    context: &WorkerContext,
) -> Result<tokio_tungstenite::tungstenite::http::Request<()>, SyncError> {
    let mut url = Url::parse(&context.config.endpoint)
        .map_err(|_| SyncError::InvalidConfig("Endpoint de sincronização inválido.".into()))?;
    url.set_scheme(if url.scheme() == "https" { "wss" } else { "ws" })
        .map_err(|_| SyncError::InvalidConfig("Endpoint de sincronização inválido.".into()))?;
    url.set_path("/v1/signal");
    url.set_query(Some(&format!(
        "clinicId={}&deviceId={}",
        context.config.clinic_id, context.config.device_id
    )));
    let mut request = url
        .as_str()
        .into_client_request()
        .map_err(SyncError::WebSocket)?;
    let authorization = format!("Bearer {}", context.credentials.access_token.as_str())
        .parse()
        .map_err(|_| SyncError::InvalidConfig("Token de sincronização inválido.".into()))?;
    request.headers_mut().insert("authorization", authorization);
    Ok(request)
}

fn is_sync_signal(message: &str) -> bool {
    serde_json::from_str::<serde_json::Value>(message)
        .ok()
        .and_then(|value| {
            value
                .get("event")
                .and_then(|event| event.as_str())
                .map(str::to_owned)
        })
        .is_some_and(|event| event == "syncAvailable")
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
        assert!(is_sync_signal(r#"{"event":"syncAvailable"}"#));
        assert!(!is_sync_signal(r#"{"event":"connected"}"#));
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
