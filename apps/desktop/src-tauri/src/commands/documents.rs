use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
};

use aes_gcm::{aead::Aead, Aes256Gcm, KeyInit, Nonce};
use rand::{rngs::OsRng, RngCore};
use serde_json::json;
use sha2::{Digest, Sha256};
use tauri::{Manager, State};
use uuid::Uuid;

use crate::{
    application::{
        audit,
        authorization::{require, Permission},
        validation,
    },
    commands::authenticate,
    domain::models::{Document, GenerateDocumentInput, RegisterDocumentInput, Role},
    error::{AppError, CommandError, CommandResult},
    state::AppState,
};

#[tauri::command(rename_all = "camelCase")]
pub fn list_documents(
    state: State<'_, AppState>,
    session_token: String,
    patient_id: Option<String>,
) -> CommandResult<Vec<Document>> {
    let principal = authenticate(&state, &session_token).map_err(CommandError::from)?;
    require(&principal, Permission::ManageDocuments).map_err(CommandError::from)?;
    let db = state
        .database
        .lock()
        .map_err(|_| CommandError::from(AppError::Internal("database lock poisoned".into())))?;
    if principal.role == Role::Psychologist {
        db.list_documents_for_professional(&principal.user_id, patient_id.as_deref())
            .map_err(Into::into)
    } else {
        db.list_documents(patient_id.as_deref()).map_err(Into::into)
    }
}

#[tauri::command(rename_all = "camelCase")]
pub fn generate_document(
    state: State<'_, AppState>,
    session_token: String,
    mut input: GenerateDocumentInput,
) -> CommandResult<Document> {
    let principal = authenticate(&state, &session_token).map_err(CommandError::from)?;
    require(&principal, Permission::ManageDocuments).map_err(CommandError::from)?;
    input.title =
        validation::required_text(&input.title, "Título", 2, 200).map_err(CommandError::from)?;
    let content = validation::required_text(&input.content, "Conteúdo", 1, 1_000_000)
        .map_err(CommandError::from)?;
    if !matches!(
        input.document_type.as_str(),
        "declaration" | "receipt" | "report" | "consent" | "other"
    ) {
        return Err(AppError::Validation("Tipo de documento inválido.".into()).into());
    }
    if input.template_version < 1 {
        return Err(AppError::Validation("Versão do template inválida.".into()).into());
    }
    if principal.role == Role::Psychologist {
        let patient_id = input
            .patient_id
            .as_deref()
            .ok_or_else(|| CommandError::from(AppError::Forbidden))?;
        let db = state
            .database
            .lock()
            .map_err(|_| CommandError::from(AppError::Internal("database lock poisoned".into())))?;
        if !db
            .professional_can_access_patient(&principal.user_id, patient_id)
            .map_err(CommandError::from)?
        {
            return Err(AppError::Forbidden.into());
        }
    }

    let file_name = format!("{}.psd", Uuid::new_v4());
    let document_dir = state.data_dir.join("documents");
    fs::create_dir_all(&document_dir)
        .map_err(AppError::from)
        .map_err(CommandError::from)?;
    let destination = document_dir.join(&file_name);
    let mut key_hasher = Sha256::new();
    key_hasher.update(b"PsicoDesk documents v1\0");
    key_hasher.update(state.database_key.as_slice());
    let document_key = key_hasher.finalize();
    let cipher = Aes256Gcm::new_from_slice(&document_key).map_err(|_| {
        CommandError::from(AppError::Security("Chave de documento inválida.".into()))
    })?;
    let mut nonce_bytes = [0u8; 12];
    OsRng.fill_bytes(&mut nonce_bytes);
    let ciphertext = cipher
        .encrypt(Nonce::from_slice(&nonce_bytes), content.as_bytes())
        .map_err(|_| {
            CommandError::from(AppError::Security(
                "Não foi possível cifrar o documento.".into(),
            ))
        })?;
    let mut payload = b"PSD1".to_vec();
    payload.extend_from_slice(&nonce_bytes);
    payload.extend_from_slice(&ciphertext);
    let temporary = destination.with_extension("tmp");
    fs::write(&temporary, payload)
        .map_err(AppError::from)
        .map_err(CommandError::from)?;
    fs::rename(&temporary, &destination)
        .map_err(AppError::from)
        .map_err(CommandError::from)?;
    let checksum = format!("sha256:{}", hex::encode(Sha256::digest(content.as_bytes())));
    let metadata = RegisterDocumentInput {
        patient_id: input.patient_id,
        title: input.title,
        document_type: input.document_type,
        template_version: input.template_version,
        encrypted_path: file_name,
        checksum,
    };
    let db = state
        .database
        .lock()
        .map_err(|_| CommandError::from(AppError::Internal("database lock poisoned".into())))?;
    let document = match db.insert_document(&metadata, &principal.user_id) {
        Ok(document) => document,
        Err(error) => {
            let _ = fs::remove_file(&destination);
            return Err(error.into());
        }
    };
    audit::record(
        &db,
        Some(&principal),
        "document.generated",
        "document",
        Some(&document.id),
        "success",
        json!({"type":document.document_type}),
    )
    .map_err(CommandError::from)?;
    Ok(document)
}

#[tauri::command(rename_all = "camelCase")]
pub fn export_document(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    session_token: String,
    document_id: String,
) -> CommandResult<String> {
    let principal = authenticate(&state, &session_token).map_err(CommandError::from)?;
    require(&principal, Permission::ManageDocuments).map_err(CommandError::from)?;
    let db = state
        .database
        .lock()
        .map_err(|_| CommandError::from(AppError::Internal("database lock poisoned".into())))?;
    let document = db
        .list_documents(None)
        .map_err(CommandError::from)?
        .into_iter()
        .find(|item| item.id == document_id)
        .ok_or_else(|| CommandError::from(AppError::NotFound))?;
    if principal.role == Role::Psychologist {
        let patient_id = document
            .patient_id
            .as_deref()
            .ok_or_else(|| CommandError::from(AppError::Forbidden))?;
        if !db
            .professional_can_access_patient(&principal.user_id, patient_id)
            .map_err(CommandError::from)?
        {
            return Err(AppError::Forbidden.into());
        }
    }
    let encrypted_path =
        safe_document_path(&state.data_dir.join("documents"), &document.encrypted_path)
            .map_err(CommandError::from)?;
    let encrypted = fs::read(encrypted_path)
        .map_err(AppError::from)
        .map_err(CommandError::from)?;
    if encrypted.len() < 16 || &encrypted[..4] != b"PSD1" {
        return Err(AppError::Security("Documento protegido inválido.".into()).into());
    }
    let mut key_hasher = Sha256::new();
    key_hasher.update(b"PsicoDesk documents v1\0");
    key_hasher.update(state.database_key.as_slice());
    let cipher = Aes256Gcm::new_from_slice(&key_hasher.finalize()).map_err(|_| {
        CommandError::from(AppError::Security("Chave de documento inválida.".into()))
    })?;
    let plaintext = cipher
        .decrypt(Nonce::from_slice(&encrypted[4..16]), &encrypted[16..])
        .map_err(|_| {
            CommandError::from(AppError::Security(
                "Documento não pôde ser autenticado.".into(),
            ))
        })?;
    let exports = app
        .path()
        .document_dir()
        .map_err(|error| CommandError::from(AppError::Internal(error.to_string())))?
        .join("PsicoDesk")
        .join("Documentos");
    fs::create_dir_all(&exports)
        .map_err(AppError::from)
        .map_err(CommandError::from)?;
    let safe_title: String = document
        .title
        .chars()
        .map(|character| {
            if character.is_alphanumeric() || matches!(character, '-' | '_') {
                character
            } else {
                '_'
            }
        })
        .take(80)
        .collect();
    let file_name = format!(
        "{}-{}-{}.txt",
        if safe_title.is_empty() {
            "documento"
        } else {
            &safe_title
        },
        document.id,
        Uuid::new_v4()
    );
    let destination = exports.join(file_name);
    persist_export(&destination, &plaintext, || {
        audit::record(
            &db,
            Some(&principal),
            "document.exported",
            "document",
            Some(&document.id),
            "success",
            json!({"managedDirectory":"Documents/PsicoDesk/Documentos"}),
        )
    })
    .map_err(CommandError::from)?;
    Ok(destination.to_string_lossy().into_owned())
}

fn persist_export(
    destination: &Path,
    plaintext: &[u8],
    audit_export: impl FnOnce() -> Result<(), AppError>,
) -> Result<(), AppError> {
    let temporary = destination.with_extension(format!("{}.tmp", Uuid::new_v4()));
    let result = (|| {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)?;
        file.write_all(plaintext)?;
        file.sync_all()?;
        drop(file);
        fs::hard_link(&temporary, destination)?;
        if let Err(error) = fs::remove_file(&temporary) {
            let _ = fs::remove_file(destination);
            return Err(error.into());
        }
        if let Err(error) = audit_export() {
            let _ = fs::remove_file(destination);
            return Err(error);
        }
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

fn safe_document_path(directory: &Path, stored_name: &str) -> Result<PathBuf, AppError> {
    let path = Path::new(stored_name);
    if path.components().count() != 1
        || path.extension().and_then(|value| value.to_str()) != Some("psd")
    {
        return Err(AppError::Security("Caminho de documento inválido.".into()));
    }
    let stem = path
        .file_stem()
        .and_then(|value| value.to_str())
        .ok_or_else(|| AppError::Security("Caminho de documento inválido.".into()))?;
    Uuid::parse_str(stem)
        .map_err(|_| AppError::Security("Caminho de documento inválido.".into()))?;
    let canonical_directory = directory.canonicalize()?;
    let candidate = directory.join(path);
    let metadata = fs::symlink_metadata(&candidate)?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(AppError::Security(
            "Documento deve ser um arquivo regular.".into(),
        ));
    }
    let canonical = candidate.canonicalize()?;
    if canonical.parent() != Some(canonical_directory.as_path()) {
        return Err(AppError::Security(
            "Documento fora do diretório gerenciado.".into(),
        ));
    }
    Ok(canonical)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn managed_document_path_rejects_traversal() {
        let directory = tempfile::tempdir().expect("dir");
        assert!(safe_document_path(directory.path(), "../arquivo.psd").is_err());
        assert!(safe_document_path(directory.path(), "nao-uuid.psd").is_err());
    }

    #[test]
    fn failed_audit_removes_plaintext_and_temporary_file() {
        let directory = tempfile::tempdir().expect("dir");
        let destination = directory.path().join("export.txt");
        let result = persist_export(&destination, b"conteudo sensivel", || {
            Err(AppError::Internal("audit unavailable".into()))
        });
        assert!(result.is_err());
        assert!(!destination.exists());
        assert_eq!(fs::read_dir(directory.path()).expect("list").count(), 0);
    }
}
