use std::fs;

use aes_gcm::{aead::Aead, Aes256Gcm, KeyInit, Nonce};
use rand::{rngs::OsRng, RngCore};
use serde_json::json;
use sha2::{Digest, Sha256};
use tauri::State;
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
    let encrypted = fs::read(
        state
            .data_dir
            .join("documents")
            .join(&document.encrypted_path),
    )
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
    let exports = state.data_dir.join("exports");
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
        "{}-{}.txt",
        if safe_title.is_empty() {
            "documento"
        } else {
            &safe_title
        },
        document.id
    );
    let destination = exports.join(file_name);
    let temporary = destination.with_extension("tmp");
    fs::write(&temporary, plaintext)
        .map_err(AppError::from)
        .map_err(CommandError::from)?;
    fs::rename(&temporary, &destination)
        .map_err(AppError::from)
        .map_err(CommandError::from)?;
    audit::record(
        &db,
        Some(&principal),
        "document.exported",
        "document",
        Some(&document.id),
        "success",
        json!({"managedDirectory":"exports"}),
    )
    .map_err(CommandError::from)?;
    Ok(destination.to_string_lossy().into_owned())
}
