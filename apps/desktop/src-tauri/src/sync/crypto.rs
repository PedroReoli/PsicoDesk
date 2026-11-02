use std::path::Path;

use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use base64::{engine::general_purpose::STANDARD, Engine};
use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
use rand::{rngs::OsRng, RngCore};
use sha2::{Digest, Sha256};

use crate::security::key_store;

use super::{models::BatchEnvelope, SyncError};

pub fn decode_encryption_key(encoded: &str) -> Result<Vec<u8>, SyncError> {
    let decoded = STANDARD
        .decode(encoded.trim())
        .map_err(|_| SyncError::InvalidConfig("A chave de sincronização é inválida.".into()))?;
    if decoded.len() != 32 {
        return Err(SyncError::InvalidConfig(
            "A chave de sincronização deve possuir 32 bytes.".into(),
        ));
    }
    Ok(decoded)
}

pub fn load_signing_key(path: &Path) -> Result<SigningKey, SyncError> {
    let bytes = key_store::load_or_create(path).map_err(SyncError::App)?;
    let bytes: [u8; 32] = bytes
        .try_into()
        .map_err(|_| SyncError::Crypto("chave de assinatura com tamanho inválido".into()))?;
    Ok(SigningKey::from_bytes(&bytes))
}

pub fn public_identity(key: &SigningKey) -> (String, String) {
    let bytes = key.verifying_key().to_bytes();
    (STANDARD.encode(bytes), hex::encode(Sha256::digest(bytes)))
}

pub fn encrypt(plaintext: &[u8], key: &[u8]) -> Result<(String, String), SyncError> {
    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|_| SyncError::Crypto("chave de criptografia inválida".into()))?;
    let mut nonce_bytes = [0u8; 12];
    OsRng.fill_bytes(&mut nonce_bytes);
    let ciphertext = cipher
        .encrypt(Nonce::from_slice(&nonce_bytes), plaintext)
        .map_err(|_| SyncError::Crypto("falha ao cifrar lote".into()))?;
    Ok((STANDARD.encode(nonce_bytes), STANDARD.encode(ciphertext)))
}

pub fn decrypt(nonce: &str, ciphertext: &str, key: &[u8]) -> Result<Vec<u8>, SyncError> {
    let nonce = STANDARD
        .decode(nonce)
        .map_err(|_| SyncError::InvalidBatch("nonce inválido".into()))?;
    let ciphertext = STANDARD
        .decode(ciphertext)
        .map_err(|_| SyncError::InvalidBatch("payload cifrado inválido".into()))?;
    if nonce.len() != 12 {
        return Err(SyncError::InvalidBatch("nonce com tamanho inválido".into()));
    }
    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|_| SyncError::Crypto("chave de criptografia inválida".into()))?;
    cipher
        .decrypt(Nonce::from_slice(&nonce), ciphertext.as_ref())
        .map_err(|_| SyncError::InvalidBatch("não foi possível decifrar o lote".into()))
}

pub fn hash_ciphertext(encoded: &str) -> Result<String, SyncError> {
    let ciphertext = STANDARD
        .decode(encoded)
        .map_err(|_| SyncError::InvalidBatch("payload cifrado inválido".into()))?;
    Ok(hex::encode(Sha256::digest(ciphertext)))
}

pub fn sign_envelope(envelope: &mut BatchEnvelope, key: &SigningKey) {
    envelope.signer_public_key = STANDARD.encode(key.verifying_key().to_bytes());
    envelope.signature = STANDARD.encode(key.sign(&envelope.signing_bytes()).to_bytes());
}

pub fn verify_envelope(
    envelope: &BatchEnvelope,
    peer_public_key: &str,
    peer_fingerprint: &str,
) -> Result<(), SyncError> {
    if envelope.signer_public_key != peer_public_key {
        return Err(SyncError::InvalidBatch(
            "identidade do assinante não confiável".into(),
        ));
    }
    if !envelope
        .content_hash
        .eq_ignore_ascii_case(&hash_ciphertext(&envelope.payload_base64)?)
    {
        return Err(SyncError::InvalidBatch(
            "hash do conteúdo não corresponde ao lote".into(),
        ));
    }
    let expected = STANDARD
        .decode(peer_public_key)
        .map_err(|_| SyncError::InvalidConfig("chave pública confiável inválida".into()))?;
    let expected: [u8; 32] = expected
        .try_into()
        .map_err(|_| SyncError::InvalidConfig("chave pública confiável inválida".into()))?;
    let actual_fingerprint = hex::encode(Sha256::digest(expected));
    if !actual_fingerprint.eq_ignore_ascii_case(peer_fingerprint) {
        return Err(SyncError::InvalidBatch(
            "fingerprint do dispositivo pareado não corresponde".into(),
        ));
    }
    let signature = STANDARD
        .decode(&envelope.signature)
        .map_err(|_| SyncError::InvalidBatch("assinatura inválida".into()))?;
    let signature = Signature::from_slice(&signature)
        .map_err(|_| SyncError::InvalidBatch("assinatura inválida".into()))?;
    let verifying_key = VerifyingKey::from_bytes(&expected)
        .map_err(|_| SyncError::InvalidConfig("chave pública confiável inválida".into()))?;
    verifying_key
        .verify(&envelope.signing_bytes(), &signature)
        .map_err(|_| SyncError::InvalidBatch("assinatura não confiável".into()))
}

#[cfg(test)]
mod tests {
    use chrono::{Duration, Utc};

    use super::*;
    use crate::sync::models::{BatchEnvelope, SYNC_SCHEMA_VERSION};

    #[test]
    fn encrypted_payload_round_trips() {
        let key = [7u8; 32];
        let (nonce, ciphertext) = encrypt(b"dados protegidos", &key).expect("encrypt");
        let plaintext = decrypt(&nonce, &ciphertext, &key).expect("decrypt");
        assert_eq!(plaintext, b"dados protegidos");
    }

    #[test]
    fn signature_and_hash_reject_tampering() {
        let signing = SigningKey::from_bytes(&[9u8; 32]);
        let (nonce, ciphertext) = encrypt(b"[]", &[3u8; 32]).expect("encrypt");
        let public_key = STANDARD.encode(signing.verifying_key().to_bytes());
        let mut envelope = BatchEnvelope {
            schema_version: SYNC_SCHEMA_VERSION,
            batch_id: "0f927a23-df4a-4eb2-8c9d-b8cd03c54ccb".into(),
            origin_device_id: "ee4e9f12-0a1f-4e59-aac6-44277b5786e9".into(),
            target_device_id: "18cc9817-dbd6-4fc0-89a4-eda41c00e098".into(),
            created_at: Utc::now().to_rfc3339(),
            expires_at: (Utc::now() + Duration::minutes(10)).to_rfc3339(),
            content_hash: hash_ciphertext(&ciphertext).expect("hash"),
            signature: String::new(),
            signer_public_key: String::new(),
            encryption: crate::sync::models::EncryptionMetadata {
                algorithm: "aes-256-gcm".into(),
                key_id: "clinic-key:v1".into(),
                nonce,
            },
            payload_base64: ciphertext,
        };
        sign_envelope(&mut envelope, &signing);
        let fingerprint = hex::encode(Sha256::digest(signing.verifying_key().to_bytes()));
        verify_envelope(&envelope, &public_key, &fingerprint).expect("valid envelope");
        envelope.payload_base64.push('x');
        assert!(verify_envelope(&envelope, &public_key, &fingerprint).is_err());
    }

    #[test]
    fn signing_bytes_match_typescript_cross_language_vector() {
        let envelope = BatchEnvelope {
            schema_version: 1,
            batch_id: "0f927a23-df4a-4eb2-8c9d-b8cd03c54ccb".into(),
            origin_device_id: "0f927a23-df4a-4eb2-8c9d-b8cd03c54ccb".into(),
            target_device_id: "ee4e9f12-0a1f-4e59-aac6-44277b5786e9".into(),
            created_at: "2026-11-02T12:00:00Z".into(),
            expires_at: "2026-11-02T12:10:00Z".into(),
            content_hash: "A".repeat(64),
            signer_public_key: format!("{}=", "A".repeat(43)),
            signature: format!("{}==", "A".repeat(86)),
            encryption: crate::sync::models::EncryptionMetadata {
                algorithm: "aes-256-gcm".into(),
                key_id: "clinic-key:v1".into(),
                nonce: "YWJjZGVmZ2hpamts".into(),
            },
            payload_base64: "dGVzdGU=".into(),
        };
        assert_eq!(
            String::from_utf8(envelope.signing_bytes()).expect("utf8"),
            [
                "psicodesk-batch-v1",
                "1",
                "0f927a23-df4a-4eb2-8c9d-b8cd03c54ccb",
                "0f927a23-df4a-4eb2-8c9d-b8cd03c54ccb",
                "ee4e9f12-0a1f-4e59-aac6-44277b5786e9",
                "2026-11-02T12:00:00Z",
                "2026-11-02T12:10:00Z",
                &"a".repeat(64),
                "aes-256-gcm",
                "clinic-key:v1",
                "YWJjZGVmZ2hpamts",
                "dGVzdGU=",
            ]
            .join("\n")
        );
    }

    #[test]
    fn public_identity_fingerprint_is_sha256_of_public_key_bytes() {
        let key = SigningKey::from_bytes(&[7u8; 32]);
        let (public_key, fingerprint) = public_identity(&key);
        let decoded = STANDARD.decode(public_key).expect("base64");
        assert_eq!(fingerprint, hex::encode(Sha256::digest(decoded)));
    }
}
