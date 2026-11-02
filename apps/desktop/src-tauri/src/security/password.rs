use argon2::{
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use rand::rngs::OsRng;

use crate::error::AppError;

pub fn hash_password(password: &str) -> Result<String, AppError> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|value| value.to_string())
        .map_err(|_| AppError::Security("Não foi possível proteger a senha.".into()))
}

pub fn verify_password(password: &str, encoded: &str) -> bool {
    let Ok(hash) = PasswordHash::new(encoded) else {
        return false;
    };
    Argon2::default()
        .verify_password(password.as_bytes(), &hash)
        .is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn password_roundtrip_rejects_wrong_value() {
        let hash = hash_password("UmaSenhaForte123").expect("hash");
        assert!(verify_password("UmaSenhaForte123", &hash));
        assert!(!verify_password("OutraSenhaForte123", &hash));
        assert!(!hash.contains("UmaSenhaForte123"));
    }
}
