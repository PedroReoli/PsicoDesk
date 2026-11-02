PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sync_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  endpoint TEXT NOT NULL,
  clinic_id TEXT NOT NULL CHECK (length(clinic_id) BETWEEN 1 AND 120),
  device_id TEXT NOT NULL CHECK (length(device_id) BETWEEN 1 AND 120),
  trusted_server_public_key TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_queue (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  operation TEXT NOT NULL CHECK (operation IN ('upsert', 'delete')),
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(entity_type, entity_id)
);
CREATE INDEX IF NOT EXISTS idx_sync_queue_status_time ON sync_queue(status, next_attempt_at, created_at);

CREATE TABLE IF NOT EXISTS sync_cursors (
  direction TEXT PRIMARY KEY CHECK (direction IN ('push', 'pull')),
  cursor_value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_seen_batches (
  batch_id TEXT PRIMARY KEY,
  content_hash TEXT NOT NULL,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_staging (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  operation TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  staged_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sync_staging_batch ON sync_staging(batch_id);

CREATE TABLE IF NOT EXISTS sync_conflicts (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  local_revision INTEGER,
  remote_revision INTEGER NOT NULL,
  reason TEXT NOT NULL,
  remote_payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved_local', 'resolved_remote', 'merged')),
  created_at TEXT NOT NULL,
  resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_sync_conflicts_status ON sync_conflicts(status, created_at DESC);

CREATE TABLE IF NOT EXISTS sync_runtime_flags (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  applying_remote INTEGER NOT NULL DEFAULT 0 CHECK (applying_remote IN (0, 1))
);
INSERT OR IGNORE INTO sync_runtime_flags(id, applying_remote) VALUES (1, 0);

CREATE TRIGGER IF NOT EXISTS sync_patients_insert
AFTER INSERT ON patients
WHEN (SELECT applying_remote FROM sync_runtime_flags WHERE id = 1) = 0
BEGIN
  INSERT INTO sync_queue(id, entity_type, entity_id, revision, operation, payload_json, created_at, updated_at)
  VALUES (lower(hex(randomblob(16))), 'patient', NEW.id, NEW.version, 'upsert',
    json_object('id',NEW.id,'fullName',NEW.full_name,'socialName',NEW.social_name,'birthDate',NEW.birth_date,'cpfCiphertext',NEW.cpf_ciphertext,'emailCiphertext',NEW.email_ciphertext,'phoneCiphertext',NEW.phone_ciphertext,'guardianName',NEW.guardian_name,'guardianPhoneCiphertext',NEW.guardian_phone_ciphertext,'notesCiphertext',NEW.notes_ciphertext,'status',NEW.status,'createdAt',NEW.created_at,'updatedAt',NEW.updated_at,'version',NEW.version),
    strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  ON CONFLICT(entity_type, entity_id) DO UPDATE SET revision=excluded.revision,payload_json=excluded.payload_json,status='pending',attempts=0,next_attempt_at=NULL,updated_at=excluded.updated_at;
END;

CREATE TRIGGER IF NOT EXISTS sync_patients_update
AFTER UPDATE ON patients
WHEN (SELECT applying_remote FROM sync_runtime_flags WHERE id = 1) = 0
BEGIN
  INSERT INTO sync_queue(id, entity_type, entity_id, revision, operation, payload_json, created_at, updated_at)
  VALUES (lower(hex(randomblob(16))), 'patient', NEW.id, NEW.version, 'upsert',
    json_object('id',NEW.id,'fullName',NEW.full_name,'socialName',NEW.social_name,'birthDate',NEW.birth_date,'cpfCiphertext',NEW.cpf_ciphertext,'emailCiphertext',NEW.email_ciphertext,'phoneCiphertext',NEW.phone_ciphertext,'guardianName',NEW.guardian_name,'guardianPhoneCiphertext',NEW.guardian_phone_ciphertext,'notesCiphertext',NEW.notes_ciphertext,'status',NEW.status,'createdAt',NEW.created_at,'updatedAt',NEW.updated_at,'version',NEW.version),
    strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  ON CONFLICT(entity_type, entity_id) DO UPDATE SET revision=excluded.revision,payload_json=excluded.payload_json,status='pending',attempts=0,next_attempt_at=NULL,updated_at=excluded.updated_at;
END;

CREATE TRIGGER IF NOT EXISTS sync_appointments_insert
AFTER INSERT ON appointments
WHEN (SELECT applying_remote FROM sync_runtime_flags WHERE id = 1) = 0
BEGIN
  INSERT INTO sync_queue(id, entity_type, entity_id, revision, operation, payload_json, created_at, updated_at)
  VALUES (lower(hex(randomblob(16))), 'appointment', NEW.id, NEW.version, 'upsert',
    json_object('id',NEW.id,'patientId',NEW.patient_id,'professionalId',NEW.professional_id,'startsAt',NEW.starts_at,'endsAt',NEW.ends_at,'status',NEW.status,'kind',NEW.kind,'recurrenceId',NEW.recurrence_id,'cancellationReason',NEW.cancellation_reason,'createdBy',NEW.created_by,'createdAt',NEW.created_at,'updatedAt',NEW.updated_at,'version',NEW.version),
    strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  ON CONFLICT(entity_type, entity_id) DO UPDATE SET revision=excluded.revision,payload_json=excluded.payload_json,status='pending',attempts=0,next_attempt_at=NULL,updated_at=excluded.updated_at;
END;

CREATE TRIGGER IF NOT EXISTS sync_appointments_update
AFTER UPDATE ON appointments
WHEN (SELECT applying_remote FROM sync_runtime_flags WHERE id = 1) = 0
BEGIN
  INSERT INTO sync_queue(id, entity_type, entity_id, revision, operation, payload_json, created_at, updated_at)
  VALUES (lower(hex(randomblob(16))), 'appointment', NEW.id, NEW.version, 'upsert',
    json_object('id',NEW.id,'patientId',NEW.patient_id,'professionalId',NEW.professional_id,'startsAt',NEW.starts_at,'endsAt',NEW.ends_at,'status',NEW.status,'kind',NEW.kind,'recurrenceId',NEW.recurrence_id,'cancellationReason',NEW.cancellation_reason,'createdBy',NEW.created_by,'createdAt',NEW.created_at,'updatedAt',NEW.updated_at,'version',NEW.version),
    strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  ON CONFLICT(entity_type, entity_id) DO UPDATE SET revision=excluded.revision,payload_json=excluded.payload_json,status='pending',attempts=0,next_attempt_at=NULL,updated_at=excluded.updated_at;
END;

CREATE TRIGGER IF NOT EXISTS sync_clinical_records_insert
AFTER INSERT ON clinical_records
WHEN (SELECT applying_remote FROM sync_runtime_flags WHERE id = 1) = 0
BEGIN
  INSERT INTO sync_queue(id, entity_type, entity_id, revision, operation, payload_json, created_at, updated_at)
  VALUES (lower(hex(randomblob(16))), 'clinicalRecord', NEW.id, 1, 'upsert',
    json_object('id',NEW.id,'patientId',NEW.patient_id,'authorId',NEW.author_id,'appointmentId',NEW.appointment_id,'bodyCiphertext',NEW.body_ciphertext,'amendmentOf',NEW.amendment_of,'contentHash',NEW.content_hash,'createdAt',NEW.created_at),
    strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  ON CONFLICT(entity_type, entity_id) DO NOTHING;
END;

CREATE TRIGGER IF NOT EXISTS sync_charges_insert
AFTER INSERT ON charges
WHEN (SELECT applying_remote FROM sync_runtime_flags WHERE id = 1) = 0
BEGIN
  INSERT INTO sync_queue(id, entity_type, entity_id, revision, operation, payload_json, created_at, updated_at)
  VALUES (lower(hex(randomblob(16))), 'charge', NEW.id, 1, 'upsert',
    json_object('id',NEW.id,'patientId',NEW.patient_id,'description',NEW.description,'amountMinor',NEW.amount_minor,'dueDate',NEW.due_date,'status',NEW.status,'createdBy',NEW.created_by,'createdAt',NEW.created_at,'updatedAt',NEW.updated_at),
    strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  ON CONFLICT(entity_type, entity_id) DO UPDATE SET payload_json=excluded.payload_json,status='pending',attempts=0,next_attempt_at=NULL,updated_at=excluded.updated_at;
END;

CREATE TRIGGER IF NOT EXISTS sync_charges_update
AFTER UPDATE ON charges
WHEN (SELECT applying_remote FROM sync_runtime_flags WHERE id = 1) = 0
BEGIN
  INSERT INTO sync_queue(id, entity_type, entity_id, revision, operation, payload_json, created_at, updated_at)
  VALUES (lower(hex(randomblob(16))), 'charge', NEW.id, 1, 'upsert',
    json_object('id',NEW.id,'patientId',NEW.patient_id,'description',NEW.description,'amountMinor',NEW.amount_minor,'dueDate',NEW.due_date,'status',NEW.status,'createdBy',NEW.created_by,'createdAt',NEW.created_at,'updatedAt',NEW.updated_at),
    strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  ON CONFLICT(entity_type, entity_id) DO UPDATE SET payload_json=excluded.payload_json,status='pending',attempts=0,next_attempt_at=NULL,updated_at=excluded.updated_at;
END;

CREATE TRIGGER IF NOT EXISTS sync_payments_insert
AFTER INSERT ON payments
WHEN (SELECT applying_remote FROM sync_runtime_flags WHERE id = 1) = 0
BEGIN
  INSERT INTO sync_queue(id, entity_type, entity_id, revision, operation, payload_json, created_at, updated_at)
  VALUES (lower(hex(randomblob(16))), 'payment', NEW.id, 1, 'upsert',
    json_object('id',NEW.id,'chargeId',NEW.charge_id,'amountMinor',NEW.amount_minor,'method',NEW.method,'paidAt',NEW.paid_at,'createdBy',NEW.created_by,'createdAt',NEW.created_at),
    strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  ON CONFLICT(entity_type, entity_id) DO NOTHING;
END;

CREATE TRIGGER IF NOT EXISTS sync_documents_insert
AFTER INSERT ON documents
WHEN (SELECT applying_remote FROM sync_runtime_flags WHERE id = 1) = 0
BEGIN
  INSERT INTO sync_queue(id, entity_type, entity_id, revision, operation, payload_json, created_at, updated_at)
  VALUES (lower(hex(randomblob(16))), 'document', NEW.id, NEW.template_version, 'upsert',
    json_object('id',NEW.id,'patientId',NEW.patient_id,'title',NEW.title,'documentType',NEW.document_type,'templateVersion',NEW.template_version,'encryptedPath',NEW.encrypted_path,'checksum',NEW.checksum,'createdBy',NEW.created_by,'createdAt',NEW.created_at),
    strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  ON CONFLICT(entity_type, entity_id) DO NOTHING;
END;

INSERT OR IGNORE INTO schema_migrations(version, applied_at)
VALUES (2, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
