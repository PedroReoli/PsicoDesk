use std::time::Duration;

use rand::Rng;
use reqwest::{RequestBuilder, Response, StatusCode};
use tokio::time::sleep;

use super::{
    models::{
        BatchEnvelope, DevicePeerList, DeviceTokenResponse, PayloadResponse, PullResponse,
        PushResponse, RealtimeTicket, SyncConfig,
    },
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

    pub async fn authenticate(
        &self,
        config: &SyncConfig,
        device_secret: &str,
    ) -> Result<DeviceTokenResponse, SyncError> {
        let request = self
            .http
            .post(endpoint(config, "/v1/auth/token"))
            .json(&serde_json::json!({
                "clinicId": config.clinic_id,
                "deviceId": config.device_id,
                "deviceSecret": device_secret,
            }));
        send_with_retry(request, false)
            .await?
            .json()
            .await
            .map_err(Into::into)
    }

    pub async fn peers(
        &self,
        config: &SyncConfig,
        access_token: &str,
    ) -> Result<DevicePeerList, SyncError> {
        let request = self
            .http
            .get(endpoint(config, "/v1/devices/peers"))
            .bearer_auth(access_token);
        send_with_retry(request, true)
            .await?
            .json()
            .await
            .map_err(Into::into)
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
        let mut query = vec![("limit", "50")];
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

    pub async fn fetch_payload(
        &self,
        config: &SyncConfig,
        access_token: &str,
        batch_id: &str,
    ) -> Result<PayloadResponse, SyncError> {
        let request = self
            .http
            .get(endpoint(config, &format!("/v1/batches/{batch_id}/payload")))
            .bearer_auth(access_token);
        send_with_retry(request, true)
            .await?
            .json()
            .await
            .map_err(Into::into)
    }

    pub async fn acknowledge(
        &self,
        config: &SyncConfig,
        access_token: &str,
        envelope: &BatchEnvelope,
        status: &str,
        imported_at: &str,
    ) -> Result<(), SyncError> {
        let batch_id = &envelope.batch_id;
        let request = self
            .http
            .post(endpoint(config, &format!("/v1/batches/{batch_id}/ack")))
            .bearer_auth(access_token)
            .json(&serde_json::json!({
                "status": status,
                "importedAt": imported_at,
                "resultHash": envelope.content_hash,
            }));
        send_with_retry(request, true).await?;
        Ok(())
    }

    pub async fn realtime_ticket(
        &self,
        config: &SyncConfig,
        access_token: &str,
    ) -> Result<RealtimeTicket, SyncError> {
        let request = self
            .http
            .post(endpoint(config, "/v1/realtime/ticket"))
            .bearer_auth(access_token);
        send_with_retry(request, false)
            .await?
            .json()
            .await
            .map_err(Into::into)
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
    use std::{
        io::{Read, Write},
        net::TcpListener,
        sync::{Arc, Mutex},
        thread,
    };

    use super::*;
    use crate::sync::models::EncryptionMetadata;
    use chrono::{Duration as ChronoDuration, Utc};

    #[test]
    fn retries_only_transient_http_statuses() {
        assert!(is_transient_status(StatusCode::TOO_MANY_REQUESTS));
        assert!(is_transient_status(StatusCode::SERVICE_UNAVAILABLE));
        assert!(!is_transient_status(StatusCode::BAD_REQUEST));
        assert!(!is_transient_status(StatusCode::UNAUTHORIZED));
    }

    fn fake_server(responses: Vec<&'static str>) -> (String, Arc<Mutex<Vec<String>>>) {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind");
        let address = listener.local_addr().expect("address");
        let requests = Arc::new(Mutex::new(Vec::new()));
        let captured = requests.clone();
        thread::spawn(move || {
            for body in responses {
                let (mut stream, _) = listener.accept().expect("accept");
                let mut bytes = Vec::new();
                let mut buffer = [0u8; 4096];
                loop {
                    let read = stream.read(&mut buffer).expect("read");
                    if read == 0 {
                        break;
                    }
                    bytes.extend_from_slice(&buffer[..read]);
                    if let Some(header_end) = bytes.windows(4).position(|item| item == b"\r\n\r\n")
                    {
                        let headers = String::from_utf8_lossy(&bytes[..header_end]);
                        let content_length = headers
                            .lines()
                            .find_map(|line| {
                                line.to_ascii_lowercase()
                                    .strip_prefix("content-length:")
                                    .and_then(|value| value.trim().parse::<usize>().ok())
                            })
                            .unwrap_or(0);
                        if bytes.len() >= header_end + 4 + content_length {
                            break;
                        }
                    }
                }
                captured
                    .lock()
                    .expect("capture")
                    .push(String::from_utf8_lossy(&bytes).into_owned());
                let response = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    body.len(), body
                );
                stream.write_all(response.as_bytes()).expect("write");
            }
        });
        (format!("http://{address}"), requests)
    }

    fn config(endpoint: String) -> SyncConfig {
        SyncConfig {
            endpoint,
            clinic_id: "0f927a23-df4a-4eb2-8c9d-b8cd03c54ccb".into(),
            device_id: "ee4e9f12-0a1f-4e59-aac6-44277b5786e9".into(),
            target_device_id: "18cc9817-dbd6-4fc0-89a4-eda41c00e098".into(),
            peer_signing_public_key: "unused".into(),
            peer_signing_key_fingerprint: "0".repeat(64),
            key_id: "clinic-key:v1".into(),
            enabled: true,
        }
    }

    #[tokio::test]
    async fn http_contract_matches_batch_and_realtime_routes() {
        let (endpoint, requests) = fake_server(vec![
            r#"{"accessToken":"token-abcdefghijklmnopqrstuvwxyz","expiresIn":900}"#,
            r#"{"deliveryCursor":"7"}"#,
            r#"{"items":[],"nextCursor":"7","hasMore":false}"#,
            r#"{"payloadBase64":"dGVzdGU=","contentHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}"#,
            r#"{}"#,
            r#"{"ticket":"abcdefghijklmnopqrstuvwxyz123456","expiresAt":"2026-11-02T12:10:00Z"}"#,
        ]);
        let config = config(endpoint);
        let now = Utc::now();
        let envelope = BatchEnvelope {
            schema_version: 1,
            batch_id: "6b43390a-9089-45ad-920b-a9d1af4d70c9".into(),
            origin_device_id: config.device_id.clone(),
            target_device_id: config.target_device_id.clone(),
            created_at: now.to_rfc3339(),
            expires_at: (now + ChronoDuration::minutes(10)).to_rfc3339(),
            content_hash: "a".repeat(64),
            signer_public_key: format!("{}=", "A".repeat(43)),
            signature: format!("{}==", "A".repeat(86)),
            encryption: EncryptionMetadata {
                algorithm: "aes-256-gcm".into(),
                key_id: "clinic-key:v1".into(),
                nonce: "YWJjZGVmZ2hpamts".into(),
            },
            payload_base64: "dGVzdGU=".into(),
        };
        let client = SyncClient::new().expect("client");
        let issued = client
            .authenticate(&config, &"s".repeat(32))
            .await
            .expect("token");
        let pushed = client
            .push_batch(&config, &issued.access_token, &envelope)
            .await
            .expect("push");
        assert_eq!(pushed.delivery_cursor, "7");
        let listed = client
            .pull_batches(&config, "token-abcdefghijklmnopqrstuvwxyz", Some("0"))
            .await
            .expect("list");
        assert_eq!(listed.next_cursor, "7");
        let payload = client
            .fetch_payload(
                &config,
                "token-abcdefghijklmnopqrstuvwxyz",
                &envelope.batch_id,
            )
            .await
            .expect("payload");
        assert_eq!(payload.payload_base64, "dGVzdGU=");
        client
            .acknowledge(
                &config,
                "token-abcdefghijklmnopqrstuvwxyz",
                &envelope,
                "applied",
                "2026-11-02T12:05:00Z",
            )
            .await
            .expect("ack");
        let ticket = client
            .realtime_ticket(&config, "token-abcdefghijklmnopqrstuvwxyz")
            .await
            .expect("ticket");
        assert_eq!(ticket.ticket, "abcdefghijklmnopqrstuvwxyz123456");

        let requests = requests.lock().expect("requests");
        assert!(requests[0].starts_with("POST /v1/auth/token HTTP/1.1"));
        assert!(requests[0].contains("\"deviceSecret\""));
        assert!(requests[1].starts_with("POST /v1/batches HTTP/1.1"));
        assert!(requests[1].contains("idempotency-key: 6b43390a-9089-45ad-920b-a9d1af4d70c9"));
        assert!(requests[1].contains("\"originDeviceId\""));
        assert!(requests[1].contains("\"payloadBase64\""));
        assert!(requests[2].starts_with("GET /v1/batches?limit=50&cursor=0 HTTP/1.1"));
        assert!(!requests[2].contains("clinicId"));
        assert!(requests[3]
            .starts_with("GET /v1/batches/6b43390a-9089-45ad-920b-a9d1af4d70c9/payload HTTP/1.1"));
        assert!(requests[4]
            .starts_with("POST /v1/batches/6b43390a-9089-45ad-920b-a9d1af4d70c9/ack HTTP/1.1"));
        assert!(requests[4].contains("\"status\":\"applied\""));
        assert!(requests[4].contains("\"importedAt\""));
        assert!(requests[4].contains("\"resultHash\""));
        assert!(requests[5].starts_with("POST /v1/realtime/ticket HTTP/1.1"));
    }
}
