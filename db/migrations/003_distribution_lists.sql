-- Distribution lists: groups that cut across outstations (e.g. everyone in Engineering).
-- A person has one outstation but can be on several distribution lists.

CREATE TABLE distribution_lists (
  id         serial PRIMARY KEY,
  name       text NOT NULL CHECK (length(trim(name)) > 0),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX distribution_lists_name_key ON distribution_lists (lower(name));

INSERT INTO distribution_lists (name, sort_order) VALUES
  ('Engineering', 1),
  ('Purchasing', 2),
  ('Health and Safety', 3),
  ('Operations Managers', 4);

CREATE TABLE user_distribution_lists (
  user_id  uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  list_id  integer NOT NULL REFERENCES distribution_lists (id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, list_id)
);
CREATE INDEX user_distribution_lists_list_idx ON user_distribution_lists (list_id);

-- Distribution lists that need to acknowledge a document, alongside its outstations.
CREATE TABLE document_distribution_lists (
  document_id uuid NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
  list_id     integer NOT NULL REFERENCES distribution_lists (id) ON DELETE CASCADE,
  added_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (document_id, list_id)
);
CREATE INDEX document_distribution_lists_list_idx ON document_distribution_lists (list_id);

-- The signer's distribution lists when they signed, e.g. "Engineering, Purchasing".
ALTER TABLE acknowledgements ADD COLUMN signer_distribution_lists text;

-- Everyone expected to sign: people added by name, everyone at a ticked outstation, and
-- everyone on a ticked distribution list.
CREATE OR REPLACE VIEW document_signers AS
SELECT x.document_id, x.user_id, bool_or(x.individual) AS individual
  FROM (
    SELECT es.document_id, es.user_id, true AS individual
      FROM expected_signers es
    UNION ALL
    SELECT dos.document_id, u.id, false
      FROM document_outstations dos
      JOIN users u ON u.outstation_id = dos.outstation_id
    UNION ALL
    SELECT ddl.document_id, udl.user_id, false
      FROM document_distribution_lists ddl
      JOIN user_distribution_lists udl ON udl.list_id = ddl.list_id
  ) x
 GROUP BY x.document_id, x.user_id;

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
         NEW.signer_distribution_lists, NEW.document_name, NEW.version_label, NEW.statement_text,
         NEW.acknowledged_at, NEW.ip_address, NEW.user_agent)
        IS DISTINCT FROM
        (OLD.id, OLD.document_id, OLD.user_id, OLD.signer_name, OLD.signer_email, OLD.signer_outstation,
         OLD.signer_distribution_lists, OLD.document_name, OLD.version_label, OLD.statement_text,
         OLD.acknowledged_at, OLD.ip_address, OLD.user_agent) THEN
    RAISE EXCEPTION 'acknowledgements can only be voided with a reason';
  END IF;
  RETURN NEW;
END;
$$;
