use std::{
    fs::{self, File, OpenOptions},
    io::{BufReader, BufWriter, Read, Write},
    path::{Path, PathBuf},
    time::Duration,
};

use aes_gcm::{
    aead::{AeadInPlace, KeyInit},
    Aes256Gcm, Nonce, Tag,
};
use argon2::{Algorithm, Argon2, Params, Version};
use chrono::Utc;
use rand::{rngs::OsRng, RngCore};
use rusqlite::{backup::Backup, params, Connection};
use serde::Serialize;
use sha2::{Digest, Sha256};
use zeroize::Zeroizing;

use crate::{error::AppError, infrastructure::database::Database, security::document_crypto};

const MAGIC: &[u8; 8] = b"PSDBAK03";
const VERSION: u16 = 3;
const SALT_LEN: usize = 16;
const NONCE_PREFIX_LEN: usize = 8;
const TAG_LEN: usize = 16;
const CHUNK_SIZE: usize = 1024 * 1024;
const KDF_MEMORY_KIB: u32 = 65_536;
const KDF_ITERATIONS: u32 = 3;
const KDF_LANES: u32 = 1;
const HEADER_LEN: usize = 8 + 2 + 4 + 4 + 4 + 4 + 8 + SALT_LEN + NONCE_PREFIX_LEN;
const MAX_CONTAINER_BYTES: u64 = 64 * 1024 * 1024 * 1024;
const MAX_DOCUMENT_BYTES: u64 = 256 * 1024 * 1024;
type DerivedKeys = (Zeroizing<Vec<u8>>, Zeroizing<Vec<u8>>, Zeroizing<Vec<u8>>);
type DecryptedKeys = (Zeroizing<Vec<u8>>, Zeroizing<Vec<u8>>);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PortableBackupInfo {
    pub id: String,
    pub created_at: String,
    pub size_bytes: u64,
    pub directory: String,
}

struct Header {
    plaintext_len: u64,
    salt: [u8; SALT_LEN],
    nonce_prefix: [u8; NONCE_PREFIX_LEN],
}

struct TempFile(PathBuf);

impl Drop for TempFile {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.0);
    }
}

struct TempDirectory {
    parent: PathBuf,
    path: PathBuf,
}

impl TempDirectory {
    fn create(parent: &Path, label: &str) -> Result<Self, AppError> {
        fs::create_dir_all(parent)?;
        let path = unique_temp_directory(parent, label);
        fs::create_dir(&path)?;
        Ok(Self {
            parent: parent.to_owned(),
            path,
        })
    }

    fn disarm(mut self) -> PathBuf {
        std::mem::take(&mut self.path)
    }
}

impl Drop for TempDirectory {
    fn drop(&mut self) {
        let _ = remove_managed_directory(&self.parent, &self.path);
    }
}

pub fn export(
    database: &Database,
    source_local_key: &[u8],
    documents_dir: &Path,
    backup_dir: &Path,
    passphrase: &str,
) -> Result<PortableBackupInfo, AppError> {
    validate_passphrase(passphrase)?;
    let backup_dir = prepare_directory(backup_dir)?;
    let id = new_backup_id();
    let final_path = backup_dir.join(&id);
    let stage = TempFile(unique_temp_path(&backup_dir, "stage"));
    let output = TempFile(unique_temp_path(&backup_dir, "write"));

    let mut salt = [0u8; SALT_LEN];
    OsRng.fill_bytes(&mut salt);
    let (database_key, envelope_key, document_key) = derive_keys(passphrase, &salt)?;
    create_portable_database(
        database,
        source_local_key,
        document_key.as_slice(),
        documents_dir,
        &stage.0,
        database_key.as_slice(),
    )?;
    encrypt_file(&stage.0, &output.0, envelope_key.as_slice(), salt)?;
    if final_path.exists() {
        return Err(AppError::Conflict(
            "Já existe um backup com este identificador.".into(),
        ));
    }
    fs::rename(&output.0, &final_path)?;
    let metadata = fs::metadata(&final_path)?;
    Ok(PortableBackupInfo {
        id,
        created_at: Utc::now().to_rfc3339(),
        size_bytes: metadata.len(),
        directory: backup_dir.to_string_lossy().into_owned(),
    })
}

pub fn list(backup_dir: &Path) -> Result<Vec<PortableBackupInfo>, AppError> {
    if !backup_dir.exists() {
        return Ok(Vec::new());
    }
    let backup_dir = prepare_directory(backup_dir)?;
    let mut entries = Vec::new();
    for entry in fs::read_dir(&backup_dir)? {
        let entry = entry?;
        let id = entry.file_name().to_string_lossy().into_owned();
        if !valid_backup_id(&id) {
            continue;
        }
        let metadata = fs::symlink_metadata(entry.path())?;
        if metadata.file_type().is_symlink() || !metadata.is_file() {
            continue;
        }
        entries.push(PortableBackupInfo {
            id,
            created_at: metadata
                .modified()
                .ok()
                .map(chrono::DateTime::<Utc>::from)
                .unwrap_or_else(Utc::now)
                .to_rfc3339(),
            size_bytes: metadata.len(),
            directory: backup_dir.to_string_lossy().into_owned(),
        });
    }
    entries.sort_by(|left, right| right.id.cmp(&left.id));
    Ok(entries)
}

pub fn restore(
    database: &mut Database,
    destination_local_key: &[u8],
    documents_dir: &Path,
    backup_dir: &Path,
    backup_id: &str,
    passphrase: &str,
) -> Result<(), AppError> {
    validate_passphrase(passphrase)?;
    if !valid_backup_id(backup_id) {
        return Err(AppError::Validation(
            "Identificador de backup portátil inválido.".into(),
        ));
    }
    let backup_dir = prepare_directory(backup_dir)?;
    let source_path = backup_dir.join(backup_id);
    ensure_regular_child(&backup_dir, &source_path)?;
    let stage = TempFile(unique_temp_path(&backup_dir, "restore"));
    let (database_key, document_key) = decrypt_file(&source_path, &stage.0, passphrase)?;
    let source = open_encrypted(&stage.0, database_key.as_slice())?;
    verify_integrity(&source)?;
    let staged_documents = extract_documents(
        &source,
        document_key.as_slice(),
        destination_local_key,
        documents_dir,
    )?;
    source.execute_batch("DROP TABLE _portable_files; DROP TABLE _portable_manifest;")?;
    verify_integrity(&source)?;
    install_database_and_documents(database, &source, documents_dir, staged_documents)
}

fn create_portable_database(
    database: &Database,
    source_local_key: &[u8],
    portable_document_key: &[u8],
    documents_dir: &Path,
    path: &Path,
    key: &[u8],
) -> Result<(), AppError> {
    let mut destination = open_encrypted_create_new(path, key)?;
    let backup = Backup::new(&database.connection, &mut destination)?;
    backup.run_to_completion(16, Duration::from_millis(10), None)?;
    drop(backup);
    add_documents(
        &destination,
        source_local_key,
        portable_document_key,
        documents_dir,
    )?;
    verify_integrity(&destination)
}

fn add_documents(
    connection: &Connection,
    source_local_key: &[u8],
    portable_document_key: &[u8],
    documents_dir: &Path,
) -> Result<(), AppError> {
    connection.execute_batch(
        "DROP TABLE IF EXISTS _portable_files;
         DROP TABLE IF EXISTS _portable_manifest;
         CREATE TABLE _portable_manifest(
           path TEXT PRIMARY KEY,
           size_bytes INTEGER NOT NULL CHECK(size_bytes >= 0),
           sha256 TEXT NOT NULL CHECK(length(sha256) = 64)
         );
         CREATE TABLE _portable_files(
           path TEXT PRIMARY KEY REFERENCES _portable_manifest(path) ON DELETE CASCADE,
           content BLOB NOT NULL
         );",
    )?;
    if !documents_dir.exists() {
        return Ok(());
    }
    let directory_metadata = fs::symlink_metadata(documents_dir)?;
    if directory_metadata.file_type().is_symlink() || !directory_metadata.is_dir() {
        return Err(AppError::Validation(
            "Diretório de documentos inválido para o backup.".into(),
        ));
    }
    for entry in fs::read_dir(documents_dir)? {
        let entry = entry?;
        let metadata = fs::symlink_metadata(entry.path())?;
        let file_name = entry.file_name().to_string_lossy().into_owned();
        if metadata.file_type().is_symlink()
            || !metadata.is_file()
            || !valid_document_name(&file_name)
            || metadata.len() > MAX_DOCUMENT_BYTES
        {
            return Err(AppError::Validation(
                "A pasta de documentos contém um item inseguro ou incompatível.".into(),
            ));
        }
        let content = fs::read(entry.path())?;
        if content.len() as u64 != metadata.len() {
            return Err(AppError::Validation(
                "Um documento mudou durante a criação do backup.".into(),
            ));
        }
        let plaintext = document_crypto::decrypt(&content, source_local_key)?;
        let portable_content = document_crypto::encrypt(&plaintext, portable_document_key)?;
        let checksum = hex::encode(Sha256::digest(&portable_content));
        connection.execute(
            "INSERT INTO _portable_manifest(path,size_bytes,sha256) VALUES (?1,?2,?3)",
            params![file_name, portable_content.len() as i64, checksum],
        )?;
        connection.execute(
            "INSERT INTO _portable_files(path,content) VALUES (?1,?2)",
            params![file_name, portable_content],
        )?;
    }
    Ok(())
}

fn extract_documents(
    connection: &Connection,
    portable_document_key: &[u8],
    destination_local_key: &[u8],
    documents_dir: &Path,
) -> Result<TempDirectory, AppError> {
    let parent = documents_dir
        .parent()
        .ok_or_else(|| AppError::Validation("Diretório de documentos inválido.".into()))?;
    fs::create_dir_all(parent)?;
    if documents_dir.exists() {
        let metadata = fs::symlink_metadata(documents_dir)?;
        if metadata.file_type().is_symlink() || !metadata.is_dir() {
            return Err(AppError::Validation(
                "Diretório atual de documentos inválido.".into(),
            ));
        }
    }
    let manifest_count: i64 =
        connection.query_row("SELECT COUNT(*) FROM _portable_manifest", [], |row| {
            row.get(0)
        })?;
    let file_count: i64 =
        connection.query_row("SELECT COUNT(*) FROM _portable_files", [], |row| row.get(0))?;
    if manifest_count < 0 || manifest_count != file_count {
        return Err(invalid_backup());
    }
    let stage = TempDirectory::create(parent, "documents-stage")?;
    let mut statement = connection.prepare(
        "SELECT m.path,m.size_bytes,m.sha256,f.content
         FROM _portable_manifest m JOIN _portable_files f ON f.path=m.path
         ORDER BY m.path",
    )?;
    let mut rows = statement.query([])?;
    let mut extracted = 0i64;
    while let Some(row) = rows.next()? {
        let file_name: String = row.get(0)?;
        let size_bytes: i64 = row.get(1)?;
        let checksum: String = row.get(2)?;
        let content: Vec<u8> = row.get(3)?;
        if !valid_document_name(&file_name)
            || size_bytes < 0
            || size_bytes as u64 > MAX_DOCUMENT_BYTES
            || content.len() as i64 != size_bytes
            || checksum.len() != 64
            || hex::encode(Sha256::digest(&content)) != checksum
        {
            return Err(invalid_backup());
        }
        let plaintext = document_crypto::decrypt(&content, portable_document_key)?;
        let local_content = document_crypto::encrypt(&plaintext, destination_local_key)?;
        let destination = stage.path.join(&file_name);
        if destination.parent() != Some(stage.path.as_path()) {
            return Err(invalid_backup());
        }
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(destination)?;
        file.write_all(&local_content)?;
        file.sync_all()?;
        extracted += 1;
    }
    if extracted != manifest_count {
        return Err(invalid_backup());
    }
    Ok(stage)
}

fn install_database_and_documents(
    database: &mut Database,
    source: &Connection,
    documents_dir: &Path,
    staged_documents: TempDirectory,
) -> Result<(), AppError> {
    let parent = documents_dir
        .parent()
        .ok_or_else(|| AppError::Validation("Diretório de documentos inválido.".into()))?;
    let safety_path = unique_temp_directory(parent, "documents-safety");
    let had_documents = documents_dir.exists();
    if had_documents {
        fs::rename(documents_dir, &safety_path)?;
    }
    let staged_path = staged_documents.disarm();
    if let Err(error) = fs::rename(&staged_path, documents_dir) {
        if had_documents {
            let _ = fs::rename(&safety_path, documents_dir);
        }
        let _ = remove_managed_directory(parent, &staged_path);
        return Err(AppError::Io(error));
    }

    let database_result = (|| {
        let backup = Backup::new(source, &mut database.connection)?;
        backup.run_to_completion(16, Duration::from_millis(10), None)?;
        Ok::<(), AppError>(())
    })();
    if let Err(database_error) = database_result {
        let failed_path = unique_temp_directory(parent, "documents-failed");
        let moved_failed = fs::rename(documents_dir, &failed_path).is_ok();
        let restored = !had_documents || fs::rename(&safety_path, documents_dir).is_ok();
        if moved_failed {
            let _ = remove_managed_directory(parent, &failed_path);
        }
        if !restored {
            return Err(AppError::Internal(
                "database restore failed and document rollback failed".into(),
            ));
        }
        return Err(database_error);
    }
    if had_documents {
        if let Err(cleanup_error) = remove_managed_directory(parent, &safety_path) {
            let failed_path = unique_temp_directory(parent, "documents-failed");
            if fs::rename(documents_dir, &failed_path).is_err()
                || fs::rename(&safety_path, documents_dir).is_err()
            {
                return Err(AppError::Internal(
                    "document safety cleanup and rollback failed".into(),
                ));
            }
            remove_managed_directory(parent, &failed_path)?;
            return Err(cleanup_error);
        }
    }
    Ok(())
}

fn valid_document_name(value: &str) -> bool {
    let Some(stem) = value.strip_suffix(".psd") else {
        return false;
    };
    uuid::Uuid::parse_str(stem).is_ok() && value.len() == 40
}

fn encrypt_file(
    source: &Path,
    destination: &Path,
    key: &[u8],
    salt: [u8; SALT_LEN],
) -> Result<(), AppError> {
    let plaintext_len = fs::metadata(source)?.len();
    let mut nonce_prefix = [0u8; NONCE_PREFIX_LEN];
    OsRng.fill_bytes(&mut nonce_prefix);
    let header = Header {
        plaintext_len,
        salt,
        nonce_prefix,
    };
    let header_bytes = encode_header(&header);
    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|_| AppError::Security("Não foi possível preparar a criptografia.".into()))?;
    let mut input = BufReader::new(File::open(source)?);
    let file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(destination)?;
    let mut output = BufWriter::new(file);
    output.write_all(&header_bytes)?;
    let mut counter = 0u32;
    let mut remaining = plaintext_len;
    while remaining > 0 {
        let length = usize::try_from(remaining.min(CHUNK_SIZE as u64))
            .map_err(|_| AppError::Validation("Backup portátil grande demais.".into()))?;
        let mut chunk = vec![0u8; length];
        input.read_exact(&mut chunk)?;
        let nonce_bytes = chunk_nonce(&header.nonce_prefix, counter);
        let aad = chunk_aad(&header_bytes, counter, length as u32);
        let tag = cipher
            .encrypt_in_place_detached(Nonce::from_slice(&nonce_bytes), &aad, &mut chunk)
            .map_err(|_| AppError::Security("Não foi possível criptografar o backup.".into()))?;
        output.write_all(&(length as u32).to_be_bytes())?;
        output.write_all(&chunk)?;
        output.write_all(tag.as_slice())?;
        remaining -= length as u64;
        counter = counter
            .checked_add(1)
            .ok_or_else(|| AppError::Validation("Backup portátil grande demais.".into()))?;
    }
    output.flush()?;
    output.get_ref().sync_all()?;
    Ok(())
}

fn decrypt_file(
    source: &Path,
    destination: &Path,
    passphrase: &str,
) -> Result<DecryptedKeys, AppError> {
    let metadata = fs::symlink_metadata(source)?;
    if metadata.file_type().is_symlink()
        || !metadata.is_file()
        || metadata.len() > MAX_CONTAINER_BYTES
    {
        return Err(AppError::Validation(
            "Arquivo de backup portátil inválido.".into(),
        ));
    }
    let mut input = BufReader::new(File::open(source)?);
    let mut header_bytes = [0u8; HEADER_LEN];
    input
        .read_exact(&mut header_bytes)
        .map_err(|_| invalid_backup())?;
    let header = decode_header(&header_bytes)?;
    let (database_key, envelope_key, document_key) = derive_keys(passphrase, &header.salt)?;
    let cipher =
        Aes256Gcm::new_from_slice(envelope_key.as_slice()).map_err(|_| invalid_backup())?;
    let file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(destination)?;
    let mut output = BufWriter::new(file);
    let mut counter = 0u32;
    let mut remaining = header.plaintext_len;
    while remaining > 0 {
        let expected =
            usize::try_from(remaining.min(CHUNK_SIZE as u64)).map_err(|_| invalid_backup())?;
        let mut length_bytes = [0u8; 4];
        input
            .read_exact(&mut length_bytes)
            .map_err(|_| invalid_backup())?;
        let length = u32::from_be_bytes(length_bytes) as usize;
        if length != expected || length > CHUNK_SIZE {
            return Err(invalid_backup());
        }
        let mut chunk = vec![0u8; length];
        let mut tag_bytes = [0u8; TAG_LEN];
        input.read_exact(&mut chunk).map_err(|_| invalid_backup())?;
        input
            .read_exact(&mut tag_bytes)
            .map_err(|_| invalid_backup())?;
        let nonce_bytes = chunk_nonce(&header.nonce_prefix, counter);
        let aad = chunk_aad(&header_bytes, counter, length as u32);
        cipher
            .decrypt_in_place_detached(
                Nonce::from_slice(&nonce_bytes),
                &aad,
                &mut chunk,
                Tag::from_slice(&tag_bytes),
            )
            .map_err(|_| invalid_backup())?;
        output.write_all(&chunk)?;
        remaining -= length as u64;
        counter = counter.checked_add(1).ok_or_else(invalid_backup)?;
    }
    let mut trailing = [0u8; 1];
    if input.read(&mut trailing)? != 0 {
        return Err(invalid_backup());
    }
    output.flush()?;
    output.get_ref().sync_all()?;
    Ok((database_key, document_key))
}

fn encode_header(header: &Header) -> [u8; HEADER_LEN] {
    let mut bytes = [0u8; HEADER_LEN];
    let mut offset = 0;
    for value in [
        MAGIC.as_slice(),
        &VERSION.to_be_bytes(),
        &KDF_MEMORY_KIB.to_be_bytes(),
        &KDF_ITERATIONS.to_be_bytes(),
        &KDF_LANES.to_be_bytes(),
        &(CHUNK_SIZE as u32).to_be_bytes(),
        &header.plaintext_len.to_be_bytes(),
        &header.salt,
        &header.nonce_prefix,
    ] {
        bytes[offset..offset + value.len()].copy_from_slice(value);
        offset += value.len();
    }
    bytes
}

fn decode_header(bytes: &[u8; HEADER_LEN]) -> Result<Header, AppError> {
    if &bytes[..8] != MAGIC
        || u16::from_be_bytes(bytes[8..10].try_into().unwrap()) != VERSION
        || u32::from_be_bytes(bytes[10..14].try_into().unwrap()) != KDF_MEMORY_KIB
        || u32::from_be_bytes(bytes[14..18].try_into().unwrap()) != KDF_ITERATIONS
        || u32::from_be_bytes(bytes[18..22].try_into().unwrap()) != KDF_LANES
        || u32::from_be_bytes(bytes[22..26].try_into().unwrap()) != CHUNK_SIZE as u32
    {
        return Err(invalid_backup());
    }
    let plaintext_len = u64::from_be_bytes(bytes[26..34].try_into().unwrap());
    if plaintext_len == 0 || plaintext_len > MAX_CONTAINER_BYTES {
        return Err(invalid_backup());
    }
    Ok(Header {
        plaintext_len,
        salt: bytes[34..50].try_into().unwrap(),
        nonce_prefix: bytes[50..58].try_into().unwrap(),
    })
}

fn derive_keys(passphrase: &str, salt: &[u8]) -> Result<DerivedKeys, AppError> {
    let params = Params::new(KDF_MEMORY_KIB, KDF_ITERATIONS, KDF_LANES, Some(32))
        .map_err(|_| AppError::Security("Parâmetros de proteção inválidos.".into()))?;
    let argon = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let mut master = Zeroizing::new(vec![0u8; 32]);
    argon
        .hash_password_into(passphrase.as_bytes(), salt, master.as_mut_slice())
        .map_err(|_| AppError::Security("Não foi possível derivar a chave do backup.".into()))?;
    let database_key = Zeroizing::new(
        Sha256::new()
            .chain_update(b"PsicoDesk portable backup database key v1")
            .chain_update(master.as_slice())
            .finalize()
            .to_vec(),
    );
    let envelope_key = Zeroizing::new(
        Sha256::new()
            .chain_update(b"PsicoDesk portable backup envelope key v1")
            .chain_update(master.as_slice())
            .finalize()
            .to_vec(),
    );
    let document_key = Zeroizing::new(
        Sha256::new()
            .chain_update(b"PsicoDesk portable backup document key v1")
            .chain_update(master.as_slice())
            .finalize()
            .to_vec(),
    );
    Ok((database_key, envelope_key, document_key))
}

fn open_encrypted_create_new(path: &Path, key: &[u8]) -> Result<Connection, AppError> {
    OpenOptions::new().write(true).create_new(true).open(path)?;
    open_encrypted(path, key)
}

fn open_encrypted(path: &Path, key: &[u8]) -> Result<Connection, AppError> {
    let connection = Connection::open(path)?;
    connection.pragma_update(None, "key", format!("x'{}'", hex::encode(key)))?;
    connection.pragma_update(None, "cipher_memory_security", "ON")?;
    connection.pragma_update(None, "foreign_keys", "ON")?;
    Ok(connection)
}

fn verify_integrity(connection: &Connection) -> Result<(), AppError> {
    let integrity: String = connection.query_row("PRAGMA integrity_check", [], |row| row.get(0))?;
    if integrity == "ok" {
        Ok(())
    } else {
        Err(invalid_backup())
    }
}

fn validate_passphrase(value: &str) -> Result<(), AppError> {
    if value.chars().count() < 16 || value.chars().count() > 256 {
        return Err(AppError::Validation(
            "A frase secreta deve ter entre 16 e 256 caracteres.".into(),
        ));
    }
    Ok(())
}

fn prepare_directory(path: &Path) -> Result<PathBuf, AppError> {
    fs::create_dir_all(path)?;
    let metadata = fs::symlink_metadata(path)?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err(AppError::Validation(
            "Diretório de backups portátil inválido.".into(),
        ));
    }
    path.canonicalize().map_err(AppError::from)
}

fn ensure_regular_child(parent: &Path, path: &Path) -> Result<(), AppError> {
    if path.parent() != Some(parent) {
        return Err(AppError::Forbidden);
    }
    let metadata = fs::symlink_metadata(path).map_err(|error| {
        if error.kind() == std::io::ErrorKind::NotFound {
            AppError::NotFound
        } else {
            AppError::Io(error)
        }
    })?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(AppError::Validation(
            "Arquivo de backup portátil inválido.".into(),
        ));
    }
    Ok(())
}

fn new_backup_id() -> String {
    let mut random = [0u8; 4];
    OsRng.fill_bytes(&mut random);
    format!(
        "portable-{}-{}.psdbak",
        Utc::now().format("%Y%m%dT%H%M%SZ"),
        hex::encode(random)
    )
}

fn unique_temp_path(directory: &Path, label: &str) -> PathBuf {
    let mut random = [0u8; 8];
    OsRng.fill_bytes(&mut random);
    directory.join(format!(".{label}-{}.tmp", hex::encode(random)))
}

fn unique_temp_directory(directory: &Path, label: &str) -> PathBuf {
    let mut random = [0u8; 8];
    OsRng.fill_bytes(&mut random);
    directory.join(format!(".{label}-{}.tmpdir", hex::encode(random)))
}

fn remove_managed_directory(parent: &Path, path: &Path) -> Result<(), AppError> {
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| AppError::Validation("Diretório temporário inválido.".into()))?;
    if path.parent() != Some(parent)
        || !name.starts_with(".documents-")
        || !name.ends_with(".tmpdir")
    {
        return Err(AppError::Forbidden);
    }
    if !path.exists() {
        return Ok(());
    }
    let metadata = fs::symlink_metadata(path)?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err(AppError::Validation(
            "Diretório temporário inválido.".into(),
        ));
    }
    fs::remove_dir_all(path)?;
    Ok(())
}

fn valid_backup_id(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() == 41
        && value.starts_with("portable-")
        && value.ends_with(".psdbak")
        && bytes[9..25].iter().enumerate().all(|(index, byte)| {
            if index == 8 {
                *byte == b'T'
            } else if index == 15 {
                *byte == b'Z'
            } else {
                byte.is_ascii_digit()
            }
        })
        && bytes[25] == b'-'
        && bytes[26..34].iter().all(u8::is_ascii_hexdigit)
}

fn chunk_nonce(prefix: &[u8; NONCE_PREFIX_LEN], counter: u32) -> [u8; 12] {
    let mut nonce = [0u8; 12];
    nonce[..8].copy_from_slice(prefix);
    nonce[8..].copy_from_slice(&counter.to_be_bytes());
    nonce
}

fn chunk_aad(header: &[u8; HEADER_LEN], counter: u32, length: u32) -> Vec<u8> {
    let mut aad = Vec::with_capacity(HEADER_LEN + 8);
    aad.extend_from_slice(header);
    aad.extend_from_slice(&counter.to_be_bytes());
    aad.extend_from_slice(&length.to_be_bytes());
    aad
}

fn invalid_backup() -> AppError {
    AppError::Validation("Frase secreta incorreta ou backup portátil inválido.".into())
}

#[cfg(test)]
mod tests {
    use std::io::{Read, Seek, SeekFrom, Write};
    use tempfile::tempdir;

    use super::*;

    #[test]
    fn generated_backup_id_is_accepted_and_traversal_is_rejected() {
        assert!(valid_backup_id(&new_backup_id()));
        assert!(!valid_backup_id(
            "../portable-20261102T120000Z-00112233.psdbak"
        ));
    }

    #[test]
    fn roundtrip_uses_different_database_keys_and_multiple_chunks() {
        let root = tempdir().expect("tempdir");
        let source = Database::open(&root.path().join("source.db"), &[7u8; 32]).expect("source");
        let large = "x".repeat(CHUNK_SIZE + 32_768);
        source.connection.execute("INSERT INTO app_settings(key,value_json,updated_at) VALUES ('portable_test',?1,'2026-01-01T00:00:00Z')", [&large]).expect("fixture");
        let source_documents = root.path().join("source-root").join("documents");
        fs::create_dir_all(&source_documents).expect("source documents");
        let document_name = "00000000-0000-4000-8000-000000000001.psd";
        let source_key = [7u8; 32];
        let destination_key = [9u8; 32];
        let plaintext = b"conteudo clinico confidencial";
        fs::write(
            source_documents.join(document_name),
            document_crypto::encrypt(plaintext, &source_key).expect("encrypt source document"),
        )
        .expect("document");
        let info = export(
            &source,
            &source_key,
            &source_documents,
            &root.path().join("managed"),
            "frase-secreta-bem-forte-123",
        )
        .expect("export");
        let mut target =
            Database::open(&root.path().join("target.db"), &[9u8; 32]).expect("target");
        let target_documents = root.path().join("different-root").join("documents");
        fs::create_dir_all(&target_documents).expect("target documents");
        let stale_name = "00000000-0000-4000-8000-000000000099.psd";
        fs::write(target_documents.join(stale_name), b"stale").expect("stale");
        restore(
            &mut target,
            &destination_key,
            &target_documents,
            &root.path().join("managed"),
            &info.id,
            "frase-secreta-bem-forte-123",
        )
        .expect("restore");
        let restored: String = target
            .connection
            .query_row(
                "SELECT value_json FROM app_settings WHERE key='portable_test'",
                [],
                |row| row.get(0),
            )
            .expect("value");
        assert_eq!(restored.len(), large.len());
        let restored_document =
            fs::read(target_documents.join(document_name)).expect("restored document");
        assert_eq!(
            document_crypto::decrypt(&restored_document, &destination_key)
                .expect("decrypt with destination key")
                .as_slice(),
            plaintext
        );
        assert!(document_crypto::decrypt(&restored_document, &source_key).is_err());
        assert!(
            !target_documents.join(stale_name).exists(),
            "restore replaces the document set, removing stale destination files"
        );
        let leftovers = fs::read_dir(target_documents.parent().expect("parent"))
            .expect("list parent")
            .filter_map(Result::ok)
            .filter(|entry| {
                entry
                    .file_name()
                    .to_string_lossy()
                    .starts_with(".documents-")
            })
            .count();
        assert_eq!(
            leftovers, 0,
            "successful restore removes safety directories"
        );
    }

    #[test]
    fn missing_document_payload_is_rejected_before_database_or_documents_change() {
        let root = tempdir().expect("tempdir");
        let target = Database::open(&root.path().join("target.db"), &[3u8; 32]).expect("target");
        target.connection.execute("INSERT INTO app_settings(key,value_json,updated_at) VALUES ('target_marker','\"target\"','2026-01-01T00:00:00Z')", []).expect("marker");
        let target_documents = root.path().join("documents");
        fs::create_dir_all(&target_documents).expect("documents");
        let target_file = "00000000-0000-4000-8000-000000000003.psd";
        fs::write(target_documents.join(target_file), b"keep-me").expect("document");

        let archive = Connection::open_in_memory().expect("archive");
        archive.execute_batch(
            "CREATE TABLE _portable_manifest(path TEXT PRIMARY KEY,size_bytes INTEGER NOT NULL,sha256 TEXT NOT NULL);
             CREATE TABLE _portable_files(path TEXT PRIMARY KEY,content BLOB NOT NULL);
             INSERT INTO _portable_manifest(path,size_bytes,sha256) VALUES ('00000000-0000-4000-8000-000000000004.psd',4,'0000000000000000000000000000000000000000000000000000000000000000');",
        ).expect("corrupt manifest");

        assert!(extract_documents(&archive, &[4u8; 32], &[5u8; 32], &target_documents).is_err());
        let count: i64 = target
            .connection
            .query_row(
                "SELECT COUNT(*) FROM app_settings WHERE key='target_marker'",
                [],
                |row| row.get(0),
            )
            .expect("count");
        assert_eq!(count, 1);
        assert_eq!(
            fs::read(target_documents.join(target_file)).expect("unchanged"),
            b"keep-me"
        );
    }

    #[test]
    fn wrong_passphrase_and_corrupted_middle_chunk_do_not_modify_target() {
        let root = tempdir().expect("tempdir");
        let source = Database::open(&root.path().join("source.db"), &[1u8; 32]).expect("source");
        source.connection.execute("INSERT INTO app_settings(key,value_json,updated_at) VALUES ('source_marker','\"source\"','2026-01-01T00:00:00Z')", []).expect("fixture");
        let info = export(
            &source,
            &[1u8; 32],
            &root.path().join("source-documents"),
            &root.path().join("managed"),
            "frase-secreta-bem-forte-123",
        )
        .expect("export");
        let mut target =
            Database::open(&root.path().join("target.db"), &[2u8; 32]).expect("target");
        target.connection.execute("INSERT INTO app_settings(key,value_json,updated_at) VALUES ('target_marker','\"target\"','2026-01-01T00:00:00Z')", []).expect("marker");
        let target_documents = root.path().join("target-documents");
        fs::create_dir_all(&target_documents).expect("target documents");
        let target_file = "00000000-0000-4000-8000-000000000002.psd";
        fs::write(target_documents.join(target_file), b"keep-me").expect("target document");
        assert!(restore(
            &mut target,
            &[2u8; 32],
            &target_documents,
            &root.path().join("managed"),
            &info.id,
            "frase-secreta-totalmente-errada"
        )
        .is_err());
        let count: i64 = target
            .connection
            .query_row(
                "SELECT COUNT(*) FROM app_settings WHERE key='target_marker'",
                [],
                |row| row.get(0),
            )
            .expect("count");
        assert_eq!(count, 1);
        assert_eq!(
            fs::read(target_documents.join(target_file)).expect("unchanged"),
            b"keep-me"
        );

        let path = root.path().join("managed").join(&info.id);
        let mut file = OpenOptions::new()
            .read(true)
            .write(true)
            .open(path)
            .expect("open");
        file.seek(SeekFrom::Start((HEADER_LEN + 4 + 100) as u64))
            .expect("seek");
        let mut byte = [0u8; 1];
        file.read_exact(&mut byte).expect("read");
        file.seek(SeekFrom::Current(-1)).expect("rewind");
        byte[0] ^= 0x80;
        file.write_all(&byte).expect("corrupt");
        file.sync_all().expect("sync");
        assert!(restore(
            &mut target,
            &[2u8; 32],
            &target_documents,
            &root.path().join("managed"),
            &info.id,
            "frase-secreta-bem-forte-123"
        )
        .is_err());
        let count: i64 = target
            .connection
            .query_row(
                "SELECT COUNT(*) FROM app_settings WHERE key='target_marker'",
                [],
                |row| row.get(0),
            )
            .expect("count");
        assert_eq!(count, 1);
        assert_eq!(
            fs::read(target_documents.join(target_file)).expect("unchanged"),
            b"keep-me"
        );

        assert!(restore(
            &mut target,
            &[2u8; 32],
            &target_documents,
            &root.path().join("managed"),
            "portable-20261102T120000Z-00112233.psdbak",
            "frase-secreta-bem-forte-123"
        )
        .is_err());
        assert_eq!(
            fs::read(target_documents.join(target_file)).expect("still unchanged"),
            b"keep-me"
        );
    }
}
