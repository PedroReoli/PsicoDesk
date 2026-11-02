use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const SYNC_SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncConfig {
    pub endpoint: String,
    pub clinic_id: String,
    pub device_id: String,
    pub target_device_id: String,
    pub peer_signing_public_key: String,
    pub peer_signing_key_fingerprint: String,
    pub key_id: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSyncConfigInput {
    pub endpoint: String,
    pub clinic_id: String,
    pub device_id: String,
    pub target_device_id: String,
    pub peer_signing_public_key: String,
    pub peer_signing_key_fingerprint: String,
    pub key_id: String,
    pub device_secret: Option<String>,
    pub enabled: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartSyncInput {
    pub encryption_key_base64: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceTokenResponse {
    pub access_token: String,
    pub expires_in: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DevicePeer {
    pub device_id: String,
    pub signing_public_key: String,
    pub signing_key_fingerprint: String,
}

#[derive(Debug, Deserialize)]
pub struct DevicePeerList {
    pub peers: Vec<DevicePeer>,
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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncDeviceIdentity {
    pub signing_public_key: String,
    pub signing_key_fingerprint: String,
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
    pub origin_device_id: String,
    pub target_device_id: String,
    pub created_at: String,
    pub expires_at: String,
    pub content_hash: String,
    pub signature: String,
    pub signer_public_key: String,
    pub encryption: EncryptionMetadata,
    pub payload_base64: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EncryptionMetadata {
    pub algorithm: String,
    pub key_id: String,
    pub nonce: String,
}

impl BatchEnvelope {
    pub fn signing_bytes(&self) -> Vec<u8> {
        format!(
            "psicodesk-batch-v1\n{}\n{}\n{}\n{}\n{}\n{}\n{}\n{}\n{}\n{}\n{}",
            self.schema_version,
            self.batch_id,
            self.origin_device_id,
            self.target_device_id,
            self.created_at,
            self.expires_at,
            self.content_hash.to_lowercase(),
            self.encryption.algorithm,
            self.encryption.key_id,
            self.encryption.nonce,
            self.payload_base64
        )
        .into_bytes()
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PushResponse {
    pub delivery_cursor: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PullResponse {
    pub items: Vec<BatchMetadata>,
    pub next_cursor: String,
    pub has_more: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchMetadata {
    pub schema_version: u32,
    pub batch_id: String,
    pub origin_device_id: String,
    pub target_device_id: String,
    pub created_at: String,
    pub expires_at: String,
    pub content_hash: String,
    pub signer_public_key: String,
    pub signature: String,
    pub encryption: EncryptionMetadata,
    pub delivery_cursor: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PayloadResponse {
    pub payload_base64: String,
    pub content_hash: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RealtimeTicket {
    pub ticket: String,
    #[serde(rename = "expiresAt")]
    pub _expires_at: String,
}

impl BatchMetadata {
    pub fn with_payload(self, payload: PayloadResponse) -> Result<BatchEnvelope, super::SyncError> {
        if !self
            .content_hash
            .eq_ignore_ascii_case(&payload.content_hash)
        {
            return Err(super::SyncError::InvalidBatch(
                "hash do payload diverge dos metadados".into(),
            ));
        }
        Ok(BatchEnvelope {
            schema_version: self.schema_version,
            batch_id: self.batch_id,
            origin_device_id: self.origin_device_id,
            target_device_id: self.target_device_id,
            created_at: self.created_at,
            expires_at: self.expires_at,
            content_hash: self.content_hash,
            signature: self.signature,
            signer_public_key: self.signer_public_key,
            encryption: self.encryption,
            payload_base64: payload.payload_base64,
        })
    }
}
