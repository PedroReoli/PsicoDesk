mod client;
mod crypto;
pub mod models;
mod repository;
mod runtime;

use crate::{error::AppError, state::AppState};
use thiserror::Error;

pub use crypto::decode_encryption_key;
pub use repository::{get_config, save_config, DbContext};
pub use runtime::{RuntimeCredentials, SyncRuntime};

#[derive(Debug, Error)]
pub enum SyncError {
    #[error("invalid sync configuration: {0}")]
    InvalidConfig(String),
    #[error("invalid sync batch: {0}")]
    InvalidBatch(String),
    #[error("sync cryptography failure: {0}")]
    Crypto(String),
    #[error("sync runtime state failure: {0}")]
    State(String),
    #[error("remote service returned HTTP {0}")]
    HttpStatus(u16),
    #[error("remote service request failed")]
    Http(#[from] reqwest::Error),
    #[error("websocket transport failed")]
    WebSocket(#[from] tokio_tungstenite::tungstenite::Error),
    #[error("sync persistence failed")]
    Database(#[from] rusqlite::Error),
    #[error("sync payload serialization failed")]
    Json(#[from] serde_json::Error),
    #[error("local application failure")]
    App(#[from] AppError),
}

impl From<SyncError> for AppError {
    fn from(value: SyncError) -> Self {
        match value {
            SyncError::InvalidConfig(detail) => AppError::Validation(detail),
            SyncError::InvalidBatch(detail) => AppError::Conflict(detail),
            SyncError::Crypto(detail) => AppError::Security(detail),
            SyncError::App(error) => error,
            other => AppError::Internal(other.to_string()),
        }
    }
}

pub fn initialize(state: &AppState) -> Result<(), SyncError> {
    repository::initialize_schema(state)
}
