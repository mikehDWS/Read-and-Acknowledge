-- Read and Acknowledge: initial schema.
-- Readers and admins both have accounts (users). Documents are recorded by name only;
-- the document itself lives elsewhere. Acknowledgements are append-only.

CREATE TABLE users (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name               text NOT NULL CHECK (length(trim(name)) > 0),
  email              text NOT NULL CHECK (position('@' IN email) > 1),
  employee_id        text,
  role               text NOT NULL DEFAULT 'reader' CHECK (role IN ('reader', 'admin')),
  password_hash      text,
  failed_login_count integer NOT NULL DEFAULT 0,
  locked_until       timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_key ON users (lower(email));

-- Sessions and one-time account links store a SHA-256 hash of the token, never the token.
CREATE TABLE sessions (
  id_hash    text PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX sessions_user_idx ON sessions (user_id);

CREATE TABLE account_tokens (
  token_hash text PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  purpose    text NOT NULL CHECK (purpose IN ('setup', 'reset')),
  created_by uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at    timestamptz
);
CREATE INDEX account_tokens_user_idx ON account_tokens (user_id);

CREATE TABLE documents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL CHECK (length(trim(name)) > 0),
  description   text,
  version_label text,
  due_date      date,
  location_url  text CHECK (location_url IS NULL OR location_url ~* '^https?://'),
  link_token    text NOT NULL UNIQUE,
  status        text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_by    uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE expected_signers (
  document_id uuid NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  added_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (document_id, user_id)
);
CREATE INDEX expected_signers_user_idx ON expected_signers (user_id);

CREATE TABLE acknowledgements (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id     uuid NOT NULL REFERENCES documents (id) ON DELETE RESTRICT,
  user_id         uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  -- Snapshots taken at signing time, so later edits don't weaken past records.
  signer_name     text NOT NULL,
  signer_email    text NOT NULL,
  document_name   text NOT NULL,
  version_label   text,
  statement_text  text NOT NULL,
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  ip_address      text,
  user_agent      text,
  voided_at       timestamptz,
  voided_by       uuid REFERENCES users (id) ON DELETE RESTRICT,
  void_reason     text,
  CHECK ((voided_at IS NULL) = (void_reason IS NULL)),
  CHECK (voided_at IS NULL OR voided_by IS NOT NULL)
);
-- One live acknowledgement per person per document (FR-8).
CREATE UNIQUE INDEX acknowledgements_live_key
  ON acknowledgements (document_id, user_id) WHERE voided_at IS NULL;
CREATE INDEX acknowledgements_time_idx ON acknowledgements (acknowledged_at);

-- Append-only: rows can never be deleted, and the only permitted update is voiding
-- a live acknowledgement once, with a reason (FR-9, FR-14).
CREATE FUNCTION acknowledgements_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'acknowledgements are append-only and cannot be deleted';
  END IF;
  IF OLD.voided_at IS NOT NULL THEN
    RAISE EXCEPTION 'a voided acknowledgement cannot be changed';
  END IF;
  IF NEW.voided_at IS NULL
     OR NEW.void_reason IS NULL OR length(trim(NEW.void_reason)) = 0
     OR (NEW.id, NEW.document_id, NEW.user_id, NEW.signer_name, NEW.signer_email,
         NEW.document_name, NEW.version_label, NEW.statement_text, NEW.acknowledged_at,
         NEW.ip_address, NEW.user_agent)
        IS DISTINCT FROM
        (OLD.id, OLD.document_id, OLD.user_id, OLD.signer_name, OLD.signer_email,
         OLD.document_name, OLD.version_label, OLD.statement_text, OLD.acknowledged_at,
         OLD.ip_address, OLD.user_agent) THEN
    RAISE EXCEPTION 'acknowledgements can only be voided with a reason';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER acknowledgements_append_only
  BEFORE UPDATE OR DELETE ON acknowledgements
  FOR EACH ROW EXECUTE FUNCTION acknowledgements_guard();

CREATE FUNCTION acknowledgements_no_truncate() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'acknowledgements are append-only and cannot be truncated';
END;
$$;

CREATE TRIGGER acknowledgements_no_truncate
  BEFORE TRUNCATE ON acknowledgements
  FOR EACH STATEMENT EXECUTE FUNCTION acknowledgements_no_truncate();

-- Who did what in the admin area, including voids.
CREATE TABLE audit_log (
  id          bigserial PRIMARY KEY,
  actor_id    uuid REFERENCES users (id) ON DELETE SET NULL,
  action      text NOT NULL,
  target_type text NOT NULL,
  target_id   text,
  details     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_target_idx ON audit_log (target_type, target_id);
