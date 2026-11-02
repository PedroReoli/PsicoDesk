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
    trusted_public_key: &str,
) -> Result<(), SyncError> {
    if envelope.signer_public_key != trusted_public_key {
        return Err(SyncError::InvalidBatch(
            "identidade do assinante não confiável".into(),
        ));
    }
    if envelope.content_hash != hash_ciphertext(&envelope.payload_ciphertext)? {
        return Err(SyncError::InvalidBatch(
            "hash do conteúdo não corresponde ao lote".into(),
        ));
    }
    let expected = STANDARD
        .decode(trusted_public_key)
        .map_err(|_| SyncError::InvalidConfig("chave pública confiável inválida".into()))?;
    let expected: [u8; 32] = expected
        .try_into()
        .map_err(|_| SyncError::InvalidConfig("chave pública confiável inválida".into()))?;
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
        let mut envelope = BatchEnvelope {
            schema_version: SYNC_SCHEMA_VERSION,
            batch_id: "batch-1".into(),
            origin_id: "device-a".into(),
            target_id: "clinic-a".into(),
            created_at: Utc::now().to_rfc3339(),
            expires_at: (Utc::now() + Duration::minutes(10)).to_rfc3339(),
            content_hash: hash_ciphertext(&ciphertext).expect("hash"),
            signature: String::new(),
            signer_public_key: String::new(),
            nonce,
            payload_ciphertext: ciphertext,
        };
        sign_envelope(&mut envelope, &signing);
        let trusted = STANDARD.encode(signing.verifying_key().to_bytes());
        verify_envelope(&envelope, &trusted).expect("valid envelope");
        envelope.payload_ciphertext.push('x');
        assert!(verify_envelope(&envelope, &trusted).is_err());
    }
}
