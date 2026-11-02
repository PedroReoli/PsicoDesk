use std::path::PathBuf;

use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde_json::Value;
use uuid::Uuid;
use zeroize::Zeroizing;

use crate::state::AppState;

use super::{
    models::{QueueItem, SyncConfig, TransferItem},
    SyncError,
};

#[derive(Clone)]
pub struct DbContext {
    path: PathBuf,
    key: Zeroizing<Vec<u8>>,
}

impl DbContext {
    pub fn from_state(state: &AppState) -> Self {
        Self {
            path: state.data_dir.join("psicodesk.db"),
            key: Zeroizing::new(state.database_key.as_slice().to_vec()),
        }
    }

    pub fn open(&self) -> Result<Connection, SyncError> {
        let connection = Connection::open(&self.path)?;
        let key_literal = format!("x'{}'", hex::encode(self.key.as_slice()));
        connection.pragma_update(None, "key", key_literal)?;
        connection.pragma_update(None, "cipher_memory_security", "ON")?;
        connection.pragma_update(None, "foreign_keys", "ON")?;
        connection.pragma_update(None, "journal_mode", "WAL")?;
        connection.pragma_update(None, "synchronous", "FULL")?;
        Ok(connection)
    }
}

pub fn initialize_schema(state: &AppState) -> Result<(), SyncError> {
    state
        .database
        .lock()
        .map_err(|_| SyncError::State("database lock poisoned".into()))?
        .connection
        .execute_batch(include_str!("../../migrations/0002_sync.sql"))?;
    Ok(())
}

pub fn get_config(connection: &Connection) -> Result<Option<SyncConfig>, SyncError> {
    connection
        .query_row(
            "SELECT endpoint, clinic_id, device_id, trusted_server_public_key, enabled FROM sync_config WHERE id = 1",
            [],
            |row| {
                Ok(SyncConfig {
                    endpoint: row.get(0)?,
                    clinic_id: row.get(1)?,
                    device_id: row.get(2)?,
                    trusted_server_public_key: row.get(3)?,
                    enabled: row.get::<_, i64>(4)? == 1,
                })
            },
        )
        .optional()
        .map_err(Into::into)
}

pub fn save_config(connection: &Connection, config: &SyncConfig) -> Result<(), SyncError> {
    connection.execute(
        "INSERT INTO sync_config(id, endpoint, clinic_id, device_id, trusted_server_public_key, enabled, updated_at)
         VALUES (1, ?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(id) DO UPDATE SET endpoint=excluded.endpoint, clinic_id=excluded.clinic_id,
         device_id=excluded.device_id, trusted_server_public_key=excluded.trusted_server_public_key,
         enabled=excluded.enabled, updated_at=excluded.updated_at",
        params![
            config.endpoint,
            config.clinic_id,
            config.device_id,
            config.trusted_server_public_key,
            i64::from(config.enabled),
            Utc::now().to_rfc3339()
        ],
    )?;
    Ok(())
}

pub fn pending_count(connection: &Connection) -> Result<u64, SyncError> {
    let count: i64 = connection.query_row(
        "SELECT COUNT(*) FROM sync_queue WHERE status IN ('pending', 'failed')",
        [],
        |row| row.get(0),
    )?;
    Ok(count.max(0) as u64)
}

pub fn conflict_count(connection: &Connection) -> Result<u64, SyncError> {
    let count: i64 = connection.query_row(
        "SELECT COUNT(*) FROM sync_conflicts WHERE status = 'pending'",
        [],
        |row| row.get(0),
    )?;
    Ok(count.max(0) as u64)
}

pub fn load_pending(connection: &Connection, limit: usize) -> Result<Vec<QueueItem>, SyncError> {
    let mut statement = connection.prepare(
        "SELECT id, entity_type, entity_id, revision, operation, payload_json
         FROM sync_queue
         WHERE status IN ('pending', 'failed')
           AND (next_attempt_at IS NULL OR next_attempt_at <= ?1)
         ORDER BY created_at ASC LIMIT ?2",
    )?;
    let rows = statement.query_map(params![Utc::now().to_rfc3339(), limit as i64], |row| {
        let payload: String = row.get(5)?;
        Ok((
            row.get(0)?,
            row.get(1)?,
            row.get(2)?,
            row.get(3)?,
            row.get(4)?,
            payload,
        ))
    })?;
    rows.map(|row| {
        let (queue_id, entity_type, entity_id, revision, operation, payload) = row?;
        Ok(QueueItem {
            queue_id,
            entity_type,
            entity_id,
            revision,
            operation,
            payload: serde_json::from_str(&payload)?,
        })
    })
    .collect()
}

pub fn mark_sending(connection: &Connection, ids: &[String]) -> Result<(), SyncError> {
    for id in ids {
        connection.execute(
            "UPDATE sync_queue SET status='sending', updated_at=?2 WHERE id=?1",
            params![id, Utc::now().to_rfc3339()],
        )?;
    }
    Ok(())
}

pub fn mark_sent(connection: &Connection, ids: &[String], cursor: &str) -> Result<(), SyncError> {
    let now = Utc::now().to_rfc3339();
    for id in ids {
        connection.execute(
            "UPDATE sync_queue SET status='sent', updated_at=?2 WHERE id=?1",
            params![id, now],
        )?;
    }
    set_cursor(connection, "push", cursor)?;
    Ok(())
}

pub fn mark_failed(connection: &Connection, ids: &[String]) -> Result<(), SyncError> {
    let now = Utc::now();
    for id in ids {
        connection.execute(
            "UPDATE sync_queue SET status='failed', attempts=attempts+1,
             next_attempt_at=?2, updated_at=?3 WHERE id=?1",
            params![
                id,
                (now + chrono::Duration::minutes(2)).to_rfc3339(),
                now.to_rfc3339()
            ],
        )?;
    }
    Ok(())
}

pub fn cursor(connection: &Connection, direction: &str) -> Result<Option<String>, SyncError> {
    connection
        .query_row(
            "SELECT cursor_value FROM sync_cursors WHERE direction=?1",
            [direction],
            |row| row.get(0),
        )
        .optional()
        .map_err(Into::into)
}

fn set_cursor(connection: &Connection, direction: &str, value: &str) -> Result<(), SyncError> {
    connection.execute(
        "INSERT INTO sync_cursors(direction,cursor_value,updated_at) VALUES (?1,?2,?3)
         ON CONFLICT(direction) DO UPDATE SET cursor_value=excluded.cursor_value,updated_at=excluded.updated_at",
        params![direction, value, Utc::now().to_rfc3339()],
    )?;
    Ok(())
}

pub fn batch_seen(connection: &Connection, batch_id: &str) -> Result<bool, SyncError> {
    let count: i64 = connection.query_row(
        "SELECT COUNT(*) FROM sync_seen_batches WHERE batch_id=?1",
        [batch_id],
        |row| row.get(0),
    )?;
    Ok(count > 0)
}

pub fn apply_batch(
    connection: &mut Connection,
    batch_id: &str,
    content_hash: &str,
    cursor_value: &str,
    mut items: Vec<TransferItem>,
) -> Result<(), SyncError> {
    if batch_seen(connection, batch_id)? {
        set_cursor(connection, "pull", cursor_value)?;
        return Ok(());
    }

    items.sort_by_key(|item| entity_order(&item.entity_type));
    let transaction = connection.transaction()?;
    transaction.execute(
        "UPDATE sync_runtime_flags SET applying_remote=1 WHERE id=1",
        [],
    )?;

    for item in &items {
        transaction.execute(
            "INSERT INTO sync_staging(id,batch_id,entity_type,entity_id,revision,operation,payload_json,staged_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
            params![
                Uuid::new_v4().to_string(),
                batch_id,
                item.entity_type,
                item.entity_id,
                item.revision,
                item.operation,
                item.payload.to_string(),
                Utc::now().to_rfc3339()
            ],
        )?;
        apply_item(&transaction, batch_id, item)?;
    }

    transaction.execute("DELETE FROM sync_staging WHERE batch_id=?1", [batch_id])?;
    transaction.execute(
        "INSERT INTO sync_seen_batches(batch_id,content_hash,applied_at) VALUES (?1,?2,?3)",
        params![batch_id, content_hash, Utc::now().to_rfc3339()],
    )?;
    transaction.execute(
        "INSERT INTO sync_cursors(direction,cursor_value,updated_at) VALUES ('pull',?1,?2)
         ON CONFLICT(direction) DO UPDATE SET cursor_value=excluded.cursor_value,updated_at=excluded.updated_at",
        params![cursor_value, Utc::now().to_rfc3339()],
    )?;
    transaction.execute(
        "UPDATE sync_runtime_flags SET applying_remote=0 WHERE id=1",
        [],
    )?;
    transaction.execute(
        "INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,result,metadata_json,created_at)
         VALUES (?1,NULL,'sync.batch_applied','sync_batch',?2,'success',?3,?4)",
        params![
            Uuid::new_v4().to_string(),
            batch_id,
            serde_json::json!({"items": items.len()}).to_string(),
            Utc::now().to_rfc3339()
        ],
    )?;
    transaction.commit()?;
    Ok(())
}

fn entity_order(entity_type: &str) -> u8 {
    match entity_type {
        "patient" => 0,
        "appointment" => 1,
        "clinicalRecord" | "charge" | "document" => 2,
        "payment" => 3,
        _ => 9,
    }
}

fn apply_item(
    transaction: &Transaction<'_>,
    batch_id: &str,
    item: &TransferItem,
) -> Result<(), SyncError> {
    if item.operation == "delete" {
        return record_conflict(
            transaction,
            batch_id,
            item,
            None,
            "deletion_requires_review",
        );
    }
    match item.entity_type.as_str() {
        "patient" => apply_patient(transaction, batch_id, item),
        "appointment" => apply_appointment(transaction, batch_id, item),
        "clinicalRecord" => apply_clinical_record(transaction, batch_id, item),
        "charge" => apply_charge(transaction, batch_id, item),
        "payment" => apply_payment(transaction, batch_id, item),
        "document" => apply_document(transaction, batch_id, item),
        _ => record_conflict(transaction, batch_id, item, None, "unsupported_entity_type"),
    }
}

fn apply_patient(
    tx: &Transaction<'_>,
    batch_id: &str,
    item: &TransferItem,
) -> Result<(), SyncError> {
    let local: Option<i64> = tx
        .query_row(
            "SELECT version FROM patients WHERE id=?1",
            [&item.entity_id],
            |row| row.get(0),
        )
        .optional()?;
    if local.is_some_and(|version| version >= item.revision) {
        return record_conflict(tx, batch_id, item, local, "concurrent_or_stale_revision");
    }
    tx.execute(
        "INSERT INTO patients(id,full_name,social_name,birth_date,cpf_ciphertext,email_ciphertext,phone_ciphertext,guardian_name,guardian_phone_ciphertext,notes_ciphertext,status,created_at,updated_at,version)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)
         ON CONFLICT(id) DO UPDATE SET full_name=excluded.full_name,social_name=excluded.social_name,birth_date=excluded.birth_date,cpf_ciphertext=excluded.cpf_ciphertext,email_ciphertext=excluded.email_ciphertext,phone_ciphertext=excluded.phone_ciphertext,guardian_name=excluded.guardian_name,guardian_phone_ciphertext=excluded.guardian_phone_ciphertext,notes_ciphertext=excluded.notes_ciphertext,status=excluded.status,updated_at=excluded.updated_at,version=excluded.version",
        params![
            item.entity_id,
            required_str(&item.payload, "fullName")?,
            optional_str(&item.payload, "socialName"),
            optional_str(&item.payload, "birthDate"),
            optional_str(&item.payload, "cpfCiphertext"),
            optional_str(&item.payload, "emailCiphertext"),
            optional_str(&item.payload, "phoneCiphertext"),
            optional_str(&item.payload, "guardianName"),
            optional_str(&item.payload, "guardianPhoneCiphertext"),
            optional_str(&item.payload, "notesCiphertext"),
            required_str(&item.payload, "status")?,
            required_str(&item.payload, "createdAt")?,
            required_str(&item.payload, "updatedAt")?,
            item.revision
        ],
    )?;
    Ok(())
}

fn apply_appointment(
    tx: &Transaction<'_>,
    batch_id: &str,
    item: &TransferItem,
) -> Result<(), SyncError> {
    let local: Option<i64> = tx
        .query_row(
            "SELECT version FROM appointments WHERE id=?1",
            [&item.entity_id],
            |row| row.get(0),
        )
        .optional()?;
    if local.is_some_and(|version| version >= item.revision) {
        return record_conflict(tx, batch_id, item, local, "concurrent_or_stale_revision");
    }
    tx.execute(
        "INSERT INTO appointments(id,patient_id,professional_id,starts_at,ends_at,status,kind,recurrence_id,cancellation_reason,created_by,created_at,updated_at,version)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)
         ON CONFLICT(id) DO UPDATE SET starts_at=excluded.starts_at,ends_at=excluded.ends_at,status=excluded.status,kind=excluded.kind,recurrence_id=excluded.recurrence_id,cancellation_reason=excluded.cancellation_reason,updated_at=excluded.updated_at,version=excluded.version",
        params![item.entity_id,required_str(&item.payload,"patientId")?,required_str(&item.payload,"professionalId")?,required_str(&item.payload,"startsAt")?,required_str(&item.payload,"endsAt")?,required_str(&item.payload,"status")?,required_str(&item.payload,"kind")?,optional_str(&item.payload,"recurrenceId"),optional_str(&item.payload,"cancellationReason"),required_str(&item.payload,"createdBy")?,required_str(&item.payload,"createdAt")?,required_str(&item.payload,"updatedAt")?,item.revision],
    )?;
    Ok(())
}

fn apply_clinical_record(
    tx: &Transaction<'_>,
    batch_id: &str,
    item: &TransferItem,
) -> Result<(), SyncError> {
    let local_hash: Option<String> = tx
        .query_row(
            "SELECT content_hash FROM clinical_records WHERE id=?1",
            [&item.entity_id],
            |row| row.get(0),
        )
        .optional()?;
    if let Some(local_hash) = local_hash {
        if local_hash == required_str(&item.payload, "contentHash")? {
            return Ok(());
        }
        return record_conflict(
            tx,
            batch_id,
            item,
            Some(1),
            "immutable_clinical_record_conflict",
        );
    }
    tx.execute(
        "INSERT INTO clinical_records(id,patient_id,author_id,appointment_id,body_ciphertext,amendment_of,content_hash,created_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
        params![item.entity_id,required_str(&item.payload,"patientId")?,required_str(&item.payload,"authorId")?,optional_str(&item.payload,"appointmentId"),required_str(&item.payload,"bodyCiphertext")?,optional_str(&item.payload,"amendmentOf"),required_str(&item.payload,"contentHash")?,required_str(&item.payload,"createdAt")?],
    )?;
    Ok(())
}

fn apply_charge(
    tx: &Transaction<'_>,
    batch_id: &str,
    item: &TransferItem,
) -> Result<(), SyncError> {
    if exists(tx, "charges", &item.entity_id)? {
        return record_conflict(tx, batch_id, item, Some(1), "existing_financial_record");
    }
    tx.execute("INSERT INTO charges(id,patient_id,description,amount_minor,due_date,status,created_by,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)", params![item.entity_id,required_str(&item.payload,"patientId")?,required_str(&item.payload,"description")?,required_i64(&item.payload,"amountMinor")?,required_str(&item.payload,"dueDate")?,required_str(&item.payload,"status")?,required_str(&item.payload,"createdBy")?,required_str(&item.payload,"createdAt")?,required_str(&item.payload,"updatedAt")?])?;
    Ok(())
}

fn apply_payment(
    tx: &Transaction<'_>,
    _batch_id: &str,
    item: &TransferItem,
) -> Result<(), SyncError> {
    if exists(tx, "payments", &item.entity_id)? {
        return Ok(());
    }
    tx.execute("INSERT INTO payments(id,charge_id,amount_minor,method,paid_at,created_by,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7)", params![item.entity_id,required_str(&item.payload,"chargeId")?,required_i64(&item.payload,"amountMinor")?,required_str(&item.payload,"method")?,required_str(&item.payload,"paidAt")?,required_str(&item.payload,"createdBy")?,required_str(&item.payload,"createdAt")?])?;
    Ok(())
}

fn apply_document(
    tx: &Transaction<'_>,
    batch_id: &str,
    item: &TransferItem,
) -> Result<(), SyncError> {
    if exists(tx, "documents", &item.entity_id)? {
        return record_conflict(
            tx,
            batch_id,
            item,
            Some(item.revision),
            "existing_document_record",
        );
    }
    tx.execute("INSERT INTO documents(id,patient_id,title,document_type,template_version,encrypted_path,checksum,created_by,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)", params![item.entity_id,optional_str(&item.payload,"patientId"),required_str(&item.payload,"title")?,required_str(&item.payload,"documentType")?,item.revision,required_str(&item.payload,"encryptedPath")?,required_str(&item.payload,"checksum")?,required_str(&item.payload,"createdBy")?,required_str(&item.payload,"createdAt")?])?;
    Ok(())
}

fn exists(tx: &Transaction<'_>, table: &str, id: &str) -> Result<bool, SyncError> {
    let sql = match table {
        "charges" => "SELECT COUNT(*) FROM charges WHERE id=?1",
        "payments" => "SELECT COUNT(*) FROM payments WHERE id=?1",
        "documents" => "SELECT COUNT(*) FROM documents WHERE id=?1",
        _ => return Err(SyncError::State("unsupported existence check".into())),
    };
    let count: i64 = tx.query_row(sql, [id], |row| row.get(0))?;
    Ok(count > 0)
}

fn record_conflict(
    tx: &Transaction<'_>,
    batch_id: &str,
    item: &TransferItem,
    local_revision: Option<i64>,
    reason: &str,
) -> Result<(), SyncError> {
    tx.execute(
        "INSERT INTO sync_conflicts(id,batch_id,entity_type,entity_id,local_revision,remote_revision,reason,remote_payload_json,created_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
        params![Uuid::new_v4().to_string(),batch_id,item.entity_type,item.entity_id,local_revision,item.revision,reason,item.payload.to_string(),Utc::now().to_rfc3339()],
    )?;
    Ok(())
}

fn required_str<'a>(payload: &'a Value, key: &str) -> Result<&'a str, SyncError> {
    payload
        .get(key)
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| SyncError::InvalidBatch(format!("campo obrigatório ausente: {key}")))
}

fn optional_str<'a>(payload: &'a Value, key: &str) -> Option<&'a str> {
    payload.get(key).and_then(Value::as_str)
}

fn required_i64(payload: &Value, key: &str) -> Result<i64, SyncError> {
    payload
        .get(key)
        .and_then(Value::as_i64)
        .ok_or_else(|| SyncError::InvalidBatch(format!("campo numérico ausente: {key}")))
}

#[cfg(test)]
mod tests {
    use rusqlite::Connection;

    #[test]
    fn migration_builds_persistent_queue_and_conflict_tables() {
        let connection = Connection::open_in_memory().expect("database");
        connection
            .execute_batch(include_str!("../../migrations/0001_initial.sql"))
            .expect("initial migration");
        connection
            .execute_batch(include_str!("../../migrations/0002_sync.sql"))
            .expect("sync migration");
        let count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('sync_queue','sync_conflicts','sync_staging')",
                [],
                |row| row.get(0),
            )
            .expect("tables");
        assert_eq!(count, 3);

        connection.execute("INSERT INTO users(id,display_name,username,password_hash,role,status,created_at,updated_at) VALUES ('u1','Profissional','prof','hash','psychologist','active','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')", []).expect("user");
        connection.execute("INSERT INTO patients(id,full_name,status,created_at,updated_at) VALUES ('p1','Paciente Teste','active','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')", []).expect("patient");
        let queued: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM sync_queue WHERE entity_type='patient' AND entity_id='p1' AND status='pending'",
                [],
                |row| row.get(0),
            )
            .expect("queue");
        assert_eq!(queued, 1);
    }
}
