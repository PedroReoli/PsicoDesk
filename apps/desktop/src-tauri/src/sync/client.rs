use std::time::Duration;

use rand::Rng;
use reqwest::{RequestBuilder, Response, StatusCode};
use tokio::time::sleep;

use super::{
    models::{BatchEnvelope, PullResponse, PushResponse, SyncConfig},
    SyncError,
};

#[derive(Clone)]
pub struct SyncClient {
    http: reqwest::Client,
}

impl SyncClient {
    pub fn new() -> Result<Self, SyncError> {
        let http = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(5))
            .timeout(Duration::from_secs(10))
            .user_agent("PsicoDesk/0.1 sync")
            .build()?;
        Ok(Self { http })
    }

    pub async fn push_batch(
        &self,
        config: &SyncConfig,
        access_token: &str,
        envelope: &BatchEnvelope,
    ) -> Result<PushResponse, SyncError> {
        let request = self
            .http
            .post(endpoint(config, "/v1/batches"))
            .bearer_auth(access_token)
            .header("Idempotency-Key", &envelope.batch_id)
            .json(envelope);
        let response = send_with_retry(request, true).await?;
        response.json().await.map_err(Into::into)
    }

    pub async fn pull_batches(
        &self,
        config: &SyncConfig,
        access_token: &str,
        cursor: Option<&str>,
    ) -> Result<PullResponse, SyncError> {
        let mut query = vec![
            ("clinicId", config.clinic_id.as_str()),
            ("deviceId", config.device_id.as_str()),
        ];
        if let Some(cursor) = cursor {
            query.push(("cursor", cursor));
        }
        let request = self
            .http
            .get(endpoint(config, "/v1/batches"))
            .bearer_auth(access_token)
            .query(&query);
        let response = send_with_retry(request, true).await?;
        response.json().await.map_err(Into::into)
    }

    pub async fn acknowledge(
        &self,
        config: &SyncConfig,
        access_token: &str,
        batch_id: &str,
    ) -> Result<(), SyncError> {
        let request = self
            .http
            .post(endpoint(config, &format!("/v1/batches/{batch_id}/ack")))
            .bearer_auth(access_token)
            .header("Idempotency-Key", format!("ack-{batch_id}"))
            .json(&serde_json::json!({ "deviceId": config.device_id }));
        send_with_retry(request, true).await?;
        Ok(())
    }
}

fn endpoint(config: &SyncConfig, path: &str) -> String {
    format!("{}{}", config.endpoint.trim_end_matches('/'), path)
}

async fn send_with_retry(request: RequestBuilder, idempotent: bool) -> Result<Response, SyncError> {
    const MAX_ATTEMPTS: u32 = 3;
    for attempt in 1..=MAX_ATTEMPTS {
        let response = request
            .try_clone()
            .ok_or_else(|| SyncError::State("request cannot be retried safely".into()))?
            .send()
            .await;
        match response {
            Ok(response) if response.status().is_success() => return Ok(response),
            Ok(response) => {
                let status = response.status();
                if !idempotent || !is_transient_status(status) || attempt == MAX_ATTEMPTS {
                    return Err(SyncError::HttpStatus(status.as_u16()));
                }
                let retry_after = response
                    .headers()
                    .get("retry-after")
                    .and_then(|value| value.to_str().ok())
                    .and_then(|value| value.parse::<u64>().ok());
                sleep(retry_delay(attempt, retry_after)).await;
            }
            Err(error) => {
                let retryable = error.is_timeout() || error.is_connect();
                if !idempotent || !retryable || attempt == MAX_ATTEMPTS {
                    return Err(SyncError::Http(error));
                }
                sleep(retry_delay(attempt, None)).await;
            }
        }
    }
    Err(SyncError::State("retry loop exhausted".into()))
}

fn is_transient_status(status: StatusCode) -> bool {
    matches!(status.as_u16(), 429 | 502 | 503 | 504)
}

fn retry_delay(attempt: u32, retry_after: Option<u64>) -> Duration {
    if let Some(seconds) = retry_after {
        return Duration::from_secs(seconds.clamp(1, 30));
    }
    let jitter = rand::thread_rng().gen_range(0..=250);
    Duration::from_millis((250_u64 * 2_u64.pow(attempt - 1)).min(4_000) + jitter)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn retries_only_transient_http_statuses() {
        assert!(is_transient_status(StatusCode::TOO_MANY_REQUESTS));
        assert!(is_transient_status(StatusCode::SERVICE_UNAVAILABLE));
        assert!(!is_transient_status(StatusCode::BAD_REQUEST));
        assert!(!is_transient_status(StatusCode::UNAUTHORIZED));
    }
}
