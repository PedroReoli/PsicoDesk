use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const SYNC_SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncConfig {
    pub endpoint: String,
    pub clinic_id: String,
    pub device_id: String,
    pub trusted_server_public_key: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSyncConfigInput {
    pub endpoint: String,
    pub clinic_id: String,
    pub device_id: String,
    pub trusted_server_public_key: String,
    pub enabled: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartSyncInput {
    pub access_token: String,
    pub encryption_key_base64: String,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SyncStatus {
    pub configured: bool,
    pub enabled: bool,
    pub running: bool,
    pub websocket_connected: bool,
    pub pending_items: u64,
    pub conflicts: u64,
    pub last_sync_at: Option<String>,
    pub last_error: Option<String>,
}

#[derive(Debug, Clone)]
pub struct QueueItem {
    pub queue_id: String,
    pub entity_type: String,
    pub entity_id: String,
    pub revision: i64,
    pub operation: String,
    pub payload: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferItem {
    pub entity_type: String,
    pub entity_id: String,
    pub revision: i64,
    pub operation: String,
    pub payload: Value,
}

impl From<&QueueItem> for TransferItem {
    fn from(value: &QueueItem) -> Self {
        Self {
            entity_type: value.entity_type.clone(),
            entity_id: value.entity_id.clone(),
            revision: value.revision,
            operation: value.operation.clone(),
            payload: value.payload.clone(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchEnvelope {
    pub schema_version: u32,
    pub batch_id: String,
    pub origin_id: String,
    pub target_id: String,
    pub created_at: String,
    pub expires_at: String,
    pub content_hash: String,
    pub signature: String,
    pub signer_public_key: String,
    pub nonce: String,
    pub payload_ciphertext: String,
}

impl BatchEnvelope {
    pub fn signing_bytes(&self) -> Vec<u8> {
        format!(
            "{}\n{}\n{}\n{}\n{}\n{}\n{}\n{}\n{}",
            self.schema_version,
            self.batch_id,
            self.origin_id,
            self.target_id,
            self.created_at,
            self.expires_at,
            self.content_hash,
            self.nonce,
            self.payload_ciphertext
        )
        .into_bytes()
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PushResponse {
    pub cursor: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PullResponse {
    pub batches: Vec<BatchEnvelope>,
    pub cursor: String,
}
