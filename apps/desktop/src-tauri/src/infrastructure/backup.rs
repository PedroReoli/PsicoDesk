use std::{
    fs,
    path::{Path, PathBuf},
    time::Duration,
};

use chrono::Utc;
use rusqlite::{backup::Backup, Connection};

use crate::{domain::models::BackupInfo, error::AppError, infrastructure::database::Database};

pub fn create(database: &Database, key: &[u8], backup_dir: &Path) -> Result<BackupInfo, AppError> {
    fs::create_dir_all(backup_dir)?;
    let id = format!("backup-{}.db", Utc::now().format("%Y%m%dT%H%M%SZ"));
    let path = backup_dir.join(&id);
    let mut destination = open_encrypted(&path, key)?;
    let backup = Backup::new(&database.connection, &mut destination)?;
    backup.run_to_completion(16, Duration::from_millis(10), None)?;
    drop(backup);
    let integrity: String =
        destination.query_row("PRAGMA integrity_check", [], |row| row.get(0))?;
    if integrity != "ok" {
        return Err(AppError::Internal("backup integrity check failed".into()));
    }
    let metadata = fs::metadata(&path)?;
    Ok(BackupInfo {
        id,
        created_at: Utc::now().to_rfc3339(),
        size_bytes: metadata.len(),
    })
}

pub fn list(backup_dir: &Path) -> Result<Vec<BackupInfo>, AppError> {
    if !backup_dir.exists() {
        return Ok(Vec::new());
    }
    let mut backups = Vec::new();
    for entry in fs::read_dir(backup_dir)? {
        let entry = entry?;
        let file_name = entry.file_name().to_string_lossy().to_string();
        if !valid_backup_id(&file_name) {
            continue;
        }
        let metadata = entry.metadata()?;
        let created_at = metadata
            .modified()
            .ok()
            .map(chrono::DateTime::<Utc>::from)
            .unwrap_or_else(Utc::now)
            .to_rfc3339();
        backups.push(BackupInfo {
            id: file_name,
            created_at,
            size_bytes: metadata.len(),
        });
    }
    backups.sort_by(|left, right| right.id.cmp(&left.id));
    Ok(backups)
}

pub fn restore(
    database: &mut Database,
    key: &[u8],
    backup_dir: &Path,
    backup_id: &str,
) -> Result<(), AppError> {
    if !valid_backup_id(backup_id) {
        return Err(AppError::Validation(
            "Identificador de backup inválido.".into(),
        ));
    }
    let source_path = backup_dir.join(backup_id);
    ensure_child(backup_dir, &source_path)?;
    if !source_path.is_file() {
        return Err(AppError::NotFound);
    }
    let source = open_encrypted(&source_path, key)?;
    let integrity: String = source.query_row("PRAGMA integrity_check", [], |row| row.get(0))?;
    if integrity != "ok" {
        return Err(AppError::Validation("O backup está corrompido.".into()));
    }
    let backup = Backup::new(&source, &mut database.connection)?;
    backup.run_to_completion(16, Duration::from_millis(10), None)?;
    Ok(())
}

fn open_encrypted(path: &Path, key: &[u8]) -> Result<Connection, AppError> {
    let connection = Connection::open(path)?;
    connection.pragma_update(None, "key", format!("x'{}'", hex::encode(key)))?;
    connection.pragma_update(None, "cipher_memory_security", "ON")?;
    connection.pragma_update(None, "foreign_keys", "ON")?;
    Ok(connection)
}

fn valid_backup_id(value: &str) -> bool {
    value.len() == 26
        && value.starts_with("backup-")
        && value.ends_with("Z.db")
        && value[7..23].chars().enumerate().all(|(index, character)| {
            if index == 8 {
                character == 'T'
            } else if index == 15 {
                character == 'Z'
            } else {
                character.is_ascii_digit()
            }
        })
}

fn ensure_child(parent: &Path, candidate: &Path) -> Result<(), AppError> {
    let parent = parent.canonicalize()?;
    let candidate_parent: PathBuf = candidate
        .parent()
        .ok_or_else(|| AppError::Validation("Caminho inválido.".into()))?
        .canonicalize()?;
    if candidate_parent != parent {
        return Err(AppError::Forbidden);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::valid_backup_id;

    #[test]
    fn backup_id_rejects_traversal() {
        assert!(valid_backup_id("backup-20261102T120000Z.db"));
        assert!(!valid_backup_id("../backup-20261102T120000Z.db"));
        assert!(!valid_backup_id("backup-manual.db"));
    }
}
