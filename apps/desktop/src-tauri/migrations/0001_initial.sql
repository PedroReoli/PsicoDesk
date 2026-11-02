PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL CHECK (length(display_name) BETWEEN 2 AND 120),
  username TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (length(username) BETWEEN 3 AND 80),
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'psychologist', 'receptionist', 'finance')),
  professional_registration TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'locked')),
  failed_login_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_login_attempts >= 0),
  locked_until TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS patients (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL CHECK (length(full_name) BETWEEN 2 AND 160),
  social_name TEXT,
  birth_date TEXT,
  cpf_ciphertext TEXT,
  email_ciphertext TEXT,
  phone_ciphertext TEXT,
  guardian_name TEXT,
  guardian_phone_ciphertext TEXT,
  notes_ciphertext TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0)
);
CREATE INDEX IF NOT EXISTS idx_patients_name ON patients(full_name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_patients_status ON patients(status);

CREATE TABLE IF NOT EXISTS patient_professionals (
  patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  professional_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  scope TEXT NOT NULL DEFAULT 'clinical' CHECK (scope IN ('clinical', 'scheduling')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (patient_id, professional_id, scope)
);
CREATE INDEX IF NOT EXISTS idx_patient_professionals_professional ON patient_professionals(professional_id, patient_id);

CREATE TABLE IF NOT EXISTS appointments (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  professional_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'confirmed', 'completed', 'cancelled', 'no_show')),
  kind TEXT NOT NULL DEFAULT 'individual' CHECK (kind IN ('individual', 'couple', 'family', 'group', 'assessment')),
  recurrence_id TEXT,
  cancellation_reason TEXT,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS idx_appointments_professional_time ON appointments(professional_id, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS idx_appointments_patient_time ON appointments(patient_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_appointments_status_time ON appointments(status, starts_at);

CREATE TABLE IF NOT EXISTS clinical_records (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  author_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  appointment_id TEXT REFERENCES appointments(id) ON DELETE SET NULL,
  body_ciphertext TEXT NOT NULL CHECK (length(body_ciphertext) > 0),
  amendment_of TEXT REFERENCES clinical_records(id) ON DELETE RESTRICT,
  content_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CHECK (amendment_of IS NULL OR amendment_of <> id)
);
CREATE INDEX IF NOT EXISTS idx_clinical_records_patient_time ON clinical_records(patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_clinical_records_author ON clinical_records(author_id, created_at DESC);

CREATE TRIGGER IF NOT EXISTS clinical_records_immutable_update
BEFORE UPDATE ON clinical_records BEGIN
  SELECT RAISE(ABORT, 'clinical_records are immutable');
END;
CREATE TRIGGER IF NOT EXISTS clinical_records_immutable_delete
BEFORE DELETE ON clinical_records BEGIN
  SELECT RAISE(ABORT, 'clinical_records are immutable');
END;

CREATE TABLE IF NOT EXISTS charges (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  description TEXT NOT NULL CHECK (length(description) BETWEEN 2 AND 240),
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  due_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue', 'cancelled')),
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_charges_status_due ON charges(status, due_date);
CREATE INDEX IF NOT EXISTS idx_charges_patient ON charges(patient_id, due_date DESC);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  charge_id TEXT NOT NULL REFERENCES charges(id) ON DELETE RESTRICT,
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  method TEXT NOT NULL CHECK (method IN ('cash', 'pix', 'card', 'transfer', 'other')),
  paid_at TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_payments_charge ON payments(charge_id, paid_at);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  patient_id TEXT REFERENCES patients(id) ON DELETE RESTRICT,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 2 AND 200),
  document_type TEXT NOT NULL CHECK (document_type IN ('declaration', 'receipt', 'report', 'consent', 'other')),
  template_version INTEGER NOT NULL DEFAULT 1 CHECK (template_version > 0),
  encrypted_path TEXT NOT NULL,
  checksum TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_documents_patient_time ON documents(patient_id, created_at DESC);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  result TEXT NOT NULL CHECK (result IN ('success', 'denied', 'failure')),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_events_actor_time ON audit_events(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_entity ON audit_events(entity_type, entity_id, created_at DESC);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS password_recovery (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  locked_until TEXT,
  created_at TEXT NOT NULL
);

INSERT OR IGNORE INTO schema_migrations(version, applied_at)
VALUES (1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

