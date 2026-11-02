use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
};

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
    security::document_crypto,
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
    let payload = document_crypto::encrypt(content.as_bytes(), state.database_key.as_slice())
        .map_err(CommandError::from)?;
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
    let plaintext = document_crypto::decrypt(&encrypted, state.database_key.as_slice())
        .map_err(CommandError::from)?;
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
    let destination_name = destination
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("documento.txt")
        .to_string();
    audited_export(
        &destination,
        &plaintext,
        || {
            audit::record(
                &db,
                Some(&principal),
                "document.export_requested",
                "document",
                Some(&document.id),
                "success",
                json!({"phase":"intent","destination":destination_name}),
            )
        },
        || {
            audit::record(
                &db,
                Some(&principal),
                "document.exported",
                "document",
                Some(&document.id),
                "success",
                json!({"managedDirectory":"Documents/PsicoDesk/Documentos"}),
            )
        },
        |_| {
            audit::record(
                &db,
                Some(&principal),
                "document.export_failed",
                "document",
                Some(&document.id),
                "failure",
                json!({"phase":"publication"}),
            )
        },
    )
    .map_err(CommandError::from)?;
    Ok(destination.to_string_lossy().into_owned())
}

fn audited_export(
    destination: &Path,
    plaintext: &[u8],
    record_intent: impl FnOnce() -> Result<(), AppError>,
    record_success: impl FnOnce() -> Result<(), AppError>,
    record_failure: impl FnOnce(&AppError) -> Result<(), AppError>,
) -> Result<(), AppError> {
    record_intent()?;
    if let Err(error) = persist_export(destination, plaintext) {
        let _ = record_failure(&error);
        return Err(error);
    }
    record_success()
}

fn persist_export(destination: &Path, plaintext: &[u8]) -> Result<(), AppError> {
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
    fn failed_intent_prevents_plaintext_publication() {
        let directory = tempfile::tempdir().expect("dir");
        let destination = directory.path().join("export.txt");
        let result = audited_export(
            &destination,
            b"conteudo sensivel",
            || Err(AppError::Internal("audit unavailable".into())),
            || Ok(()),
            |_| Ok(()),
        );
        assert!(result.is_err());
        assert!(!destination.exists());
        assert_eq!(fs::read_dir(directory.path()).expect("list").count(), 0);
    }

    #[test]
    fn publication_failure_keeps_durable_intent_and_no_temporary_plaintext() {
        use std::cell::Cell;
        let directory = tempfile::tempdir().expect("dir");
        let destination = directory.path().join("export.txt");
        fs::write(&destination, b"nao sobrescrever").expect("existing");
        let intent = Cell::new(false);
        let failure = Cell::new(false);
        let result = audited_export(
            &destination,
            b"conteudo sensivel",
            || {
                intent.set(true);
                Ok(())
            },
            || Ok(()),
            |_| {
                failure.set(true);
                Ok(())
            },
        );
        assert!(result.is_err());
        assert!(intent.get());
        assert!(failure.get());
        assert_eq!(
            fs::read(&destination).expect("existing"),
            b"nao sobrescrever"
        );
        assert_eq!(fs::read_dir(directory.path()).expect("list").count(), 1);
    }

    #[test]
    fn failed_completion_still_has_prior_intent_for_published_plaintext() {
        use std::cell::Cell;
        let directory = tempfile::tempdir().expect("dir");
        let destination = directory.path().join("export.txt");
        let intent = Cell::new(false);
        let result = audited_export(
            &destination,
            b"conteudo sensivel",
            || {
                intent.set(true);
                Ok(())
            },
            || Err(AppError::Internal("completion audit unavailable".into())),
            |_| Ok(()),
        );
        assert!(result.is_err());
        assert!(intent.get());
        assert_eq!(
            fs::read(&destination).expect("published"),
            b"conteudo sensivel"
        );
    }
}
