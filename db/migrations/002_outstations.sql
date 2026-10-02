-- Outstations: the maintenance teams people belong to.

CREATE TABLE outstations (
  id         serial PRIMARY KEY,
  name       text NOT NULL CHECK (length(trim(name)) > 0),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX outstations_name_key ON outstations (lower(name));

INSERT INTO outstations (name, sort_order) VALUES
  ('Head Office', 1),
  ('Ferrybridge', 2),
  ('Tuebrook', 3),
  ('Stirling', 4),
  ('Bardon', 5),
  ('Isle of Grain', 6),
  ('Humber', 7),
  ('Port Talbot', 8),
  ('Llanwern', 9),
  ('Milford Haven', 10);

ALTER TABLE users ADD COLUMN outstation_id integer REFERENCES outstations (id) ON DELETE SET NULL;
CREATE INDEX users_outstation_idx ON users (outstation_id);

-- The signer's outstation when they signed, so the record stays right if they move later.
ALTER TABLE acknowledgements ADD COLUMN signer_outstation text;

-- Same rules as before, with the new column protected too.
CREATE OR REPLACE FUNCTION acknowledgements_guard() RETURNS trigger
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
     OR (NEW.id, NEW.document_id, NEW.user_id, NEW.signer_name, NEW.signer_email, NEW.signer_outstation,
         NEW.document_name, NEW.version_label, NEW.statement_text, NEW.acknowledged_at,
         NEW.ip_address, NEW.user_agent)
        IS DISTINCT FROM
        (OLD.id, OLD.document_id, OLD.user_id, OLD.signer_name, OLD.signer_email, OLD.signer_outstation,
         OLD.document_name, OLD.version_label, OLD.statement_text, OLD.acknowledged_at,
         OLD.ip_address, OLD.user_agent) THEN
    RAISE EXCEPTION 'acknowledgements can only be voided with a reason';
  END IF;
  RETURN NEW;
END;
$$;

-- Outstations that need to acknowledge a document. Everyone currently at a selected outstation
-- is expected to sign it, including people who join that outstation later.
CREATE TABLE document_outstations (
  document_id   uuid NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
  outstation_id integer NOT NULL REFERENCES outstations (id) ON DELETE CASCADE,
  added_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (document_id, outstation_id)
);
CREATE INDEX document_outstations_outstation_idx ON document_outstations (outstation_id);

-- Everyone expected to sign each document: people added individually plus everyone at a
-- selected outstation. `individual` is true when the person was also added by name.
CREATE VIEW document_signers AS
SELECT x.document_id, x.user_id, bool_or(x.individual) AS individual
  FROM (
    SELECT es.document_id, es.user_id, true AS individual
      FROM expected_signers es
    UNION ALL
    SELECT dos.document_id, u.id, false
      FROM document_outstations dos
      JOIN users u ON u.outstation_id = dos.outstation_id
  ) x
 GROUP BY x.document_id, x.user_id;
