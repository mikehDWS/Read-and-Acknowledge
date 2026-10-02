-- Document categories, e.g. customer documents vs internal ones. Each document has one.

CREATE TABLE document_categories (
  id         serial PRIMARY KEY,
  name       text NOT NULL CHECK (length(trim(name)) > 0),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX document_categories_name_key ON document_categories (lower(name));

INSERT INTO document_categories (name, sort_order) VALUES
  ('Customer', 1),
  ('Internal Engineering', 2),
  ('Internal Health and Safety', 3);

ALTER TABLE documents ADD COLUMN category_id integer REFERENCES document_categories (id) ON DELETE SET NULL;
CREATE INDEX documents_category_idx ON documents (category_id);

-- The document's category when it was signed.
ALTER TABLE acknowledgements ADD COLUMN document_category text;

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
         NEW.signer_distribution_lists, NEW.document_name, NEW.document_category, NEW.version_label,
         NEW.statement_text, NEW.acknowledged_at, NEW.ip_address, NEW.user_agent)
        IS DISTINCT FROM
        (OLD.id, OLD.document_id, OLD.user_id, OLD.signer_name, OLD.signer_email, OLD.signer_outstation,
         OLD.signer_distribution_lists, OLD.document_name, OLD.document_category, OLD.version_label,
         OLD.statement_text, OLD.acknowledged_at, OLD.ip_address, OLD.user_agent) THEN
    RAISE EXCEPTION 'acknowledgements can only be voided with a reason';
  END IF;
  RETURN NEW;
END;
$$;
