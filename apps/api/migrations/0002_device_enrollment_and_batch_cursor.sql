CREATE TABLE device_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  token_hash char(64) NOT NULL,
  scopes text[] NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, token_hash),
  CHECK (expires_at > created_at),
  CHECK (cardinality(scopes) > 0),
  CHECK (scopes <@ ARRAY[
    'batches:read', 'batches:write', 'sync:read', 'sync:write',
    'uploads:write', 'realtime:connect', 'devices:read'
  ]::text[])
);

CREATE INDEX device_enrollments_active_idx
  ON device_enrollments(clinic_id, expires_at)
  WHERE consumed_at IS NULL;

ALTER TABLE batches
  ADD COLUMN delivery_cursor bigint GENERATED ALWAYS AS IDENTITY,
  ADD COLUMN signer_public_key text NOT NULL
    DEFAULT 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

ALTER TABLE batches ALTER COLUMN signer_public_key DROP DEFAULT;

CREATE UNIQUE INDEX batches_delivery_cursor_unique_idx ON batches(delivery_cursor);
CREATE INDEX batches_target_delivery_idx
  ON batches(clinic_id, target_device_id, delivery_cursor)
  WHERE status IN ('pending', 'downloaded');

ALTER TABLE sync_changes
  ADD COLUMN encryption jsonb NOT NULL
  DEFAULT '{"algorithm":"aes-256-gcm","keyId":"legacy","nonce":"AAAAAAAAAAAAAAAA"}'::jsonb;

ALTER TABLE sync_changes ALTER COLUMN encryption DROP DEFAULT;

ALTER TABLE devices
  ADD COLUMN signing_public_key text,
  ADD COLUMN signing_key_fingerprint char(64),
  ADD CONSTRAINT devices_signing_identity_pair CHECK (
    (signing_public_key IS NULL AND signing_key_fingerprint IS NULL)
    OR (signing_public_key IS NOT NULL AND signing_key_fingerprint IS NOT NULL)
  );
