BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE clinics (
  id uuid PRIMARY KEY,
  name text NOT NULL CHECK (length(name) BETWEEN 2 AND 160),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE devices (
  clinic_id uuid NOT NULL REFERENCES clinics(id) ON DELETE RESTRICT,
  id uuid NOT NULL,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  secret_hash text NOT NULL,
  scopes text[] NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (clinic_id, id)
);

CREATE TABLE batches (
  clinic_id uuid NOT NULL REFERENCES clinics(id) ON DELETE RESTRICT,
  batch_id uuid NOT NULL,
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 16 AND 128),
  schema_version integer NOT NULL CHECK (schema_version BETWEEN 1 AND 100),
  origin_device_id uuid NOT NULL,
  target_device_id uuid NOT NULL,
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  content_hash char(64) NOT NULL,
  signature text NOT NULL,
  encryption jsonb NOT NULL,
  payload bytea NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','downloaded','applied','rejected','deleted','expired')),
  result_hash char(64),
  PRIMARY KEY (clinic_id, batch_id),
  UNIQUE (clinic_id, idempotency_key),
  FOREIGN KEY (clinic_id, origin_device_id) REFERENCES devices(clinic_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (clinic_id, target_device_id) REFERENCES devices(clinic_id, id) ON DELETE RESTRICT,
  CHECK (origin_device_id <> target_device_id),
  CHECK (expires_at > created_at),
  CHECK (octet_length(payload) <= 20971520)
);
CREATE INDEX batches_target_pending_idx ON batches(clinic_id, target_device_id, status, received_at DESC);
CREATE INDEX batches_expiration_idx ON batches(expires_at) WHERE status = 'pending';

CREATE TABLE sync_entity_heads (
  clinic_id uuid NOT NULL REFERENCES clinics(id) ON DELETE RESTRICT,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  revision integer NOT NULL CHECK (revision >= 0),
  latest_change_id uuid,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (clinic_id, entity_type, entity_id)
);

CREATE TABLE sync_changes (
  cursor bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  clinic_id uuid NOT NULL REFERENCES clinics(id) ON DELETE RESTRICT,
  change_id uuid NOT NULL,
  source_device_id uuid NOT NULL,
  entity_type text NOT NULL CHECK (entity_type IN ('patient','appointment','clinical_record','charge','payment','document','setting')),
  entity_id uuid NOT NULL,
  operation text NOT NULL CHECK (operation IN ('upsert','delete')),
  revision integer NOT NULL CHECK (revision > 0),
  modified_at timestamptz NOT NULL,
  payload_ciphertext bytea NOT NULL CHECK (octet_length(payload_ciphertext) <= 20971520),
  payload_hash char(64) NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, change_id),
  FOREIGN KEY (clinic_id, source_device_id) REFERENCES devices(clinic_id, id) ON DELETE RESTRICT
);
CREATE INDEX sync_changes_pull_idx ON sync_changes(clinic_id, cursor);

CREATE TABLE sync_conflicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id) ON DELETE RESTRICT,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  incoming_change_id uuid NOT NULL,
  expected_revision integer NOT NULL,
  current_revision integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  UNIQUE (clinic_id, incoming_change_id)
);
CREATE INDEX sync_conflicts_open_idx ON sync_conflicts(clinic_id, created_at DESC) WHERE resolved_at IS NULL;

CREATE TABLE audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  clinic_id uuid NOT NULL REFERENCES clinics(id) ON DELETE RESTRICT,
  device_id uuid,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id text,
  result text NOT NULL CHECK (result IN ('success','denied','failure')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (clinic_id, device_id) REFERENCES devices(clinic_id, id) ON DELETE SET NULL
);
CREATE INDEX audit_events_tenant_time_idx ON audit_events(clinic_id, created_at DESC);

COMMIT;
