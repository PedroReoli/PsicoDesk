use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use rand::{rngs::OsRng, RngCore};
use sha2::{Digest, Sha256};
use zeroize::Zeroizing;

use crate::error::AppError;

const MAGIC: &[u8; 4] = b"PSD1";
const NONCE_LEN: usize = 12;
const HEADER_LEN: usize = MAGIC.len() + NONCE_LEN;

pub fn encrypt(plaintext: &[u8], local_key: &[u8]) -> Result<Vec<u8>, AppError> {
    let key = derive_document_key(local_key);
    let cipher = Aes256Gcm::new_from_slice(key.as_slice())
        .map_err(|_| AppError::Security("Chave de documento inválida.".into()))?;
    let mut nonce = [0u8; NONCE_LEN];
    OsRng.fill_bytes(&mut nonce);
    let ciphertext = cipher
        .encrypt(Nonce::from_slice(&nonce), plaintext)
        .map_err(|_| AppError::Security("Não foi possível cifrar o documento.".into()))?;
    let mut payload = Vec::with_capacity(HEADER_LEN + ciphertext.len());
    payload.extend_from_slice(MAGIC);
    payload.extend_from_slice(&nonce);
    payload.extend_from_slice(&ciphertext);
    Ok(payload)
}

pub fn decrypt(payload: &[u8], local_key: &[u8]) -> Result<Zeroizing<Vec<u8>>, AppError> {
    if payload.len() < HEADER_LEN + 16 || &payload[..MAGIC.len()] != MAGIC {
        return Err(AppError::Security("Documento protegido inválido.".into()));
    }
    let key = derive_document_key(local_key);
    let cipher = Aes256Gcm::new_from_slice(key.as_slice())
        .map_err(|_| AppError::Security("Chave de documento inválida.".into()))?;
    cipher
        .decrypt(
            Nonce::from_slice(&payload[MAGIC.len()..HEADER_LEN]),
            &payload[HEADER_LEN..],
        )
        .map(Zeroizing::new)
        .map_err(|_| AppError::Security("Documento não pôde ser autenticado.".into()))
}

fn derive_document_key(local_key: &[u8]) -> Zeroizing<Vec<u8>> {
    Zeroizing::new(
        Sha256::new()
            .chain_update(b"PsicoDesk documents v1\0")
            .chain_update(local_key)
            .finalize()
            .to_vec(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn document_payload_is_bound_to_its_local_key() {
        let encrypted = encrypt(b"conteudo clinico", &[1u8; 32]).expect("encrypt");
        assert_eq!(
            decrypt(&encrypted, &[1u8; 32]).expect("decrypt").as_slice(),
            b"conteudo clinico"
        );
        assert!(decrypt(&encrypted, &[2u8; 32]).is_err());
    }
}
