-- Managers and supervisors can brief staff who don't have an account: the person signs on the
-- briefer's device, and is kept as a person without a login (email optional).

ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
ALTER TABLE users ADD COLUMN is_supervisor boolean NOT NULL DEFAULT false;

ALTER TABLE acknowledgements ALTER COLUMN signer_email DROP NOT NULL;
ALTER TABLE acknowledgements
  ADD COLUMN briefed_by uuid REFERENCES users (id) ON DELETE RESTRICT,
  ADD COLUMN briefed_by_name text,
  ADD CONSTRAINT acknowledgements_briefer_named CHECK ((briefed_by IS NULL) = (briefed_by_name IS NULL));

-- Same rules as before, with who gave the briefing protected too.
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
     OR (NEW.id, NEW.document_id, NEW.user_id, NEW.signer_name, NEW.signer_email, NEW.signer_department,
         NEW.signer_distribution_lists, NEW.document_name, NEW.document_category, NEW.version_label,
         NEW.statement_text, NEW.acknowledged_at, NEW.ip_address, NEW.user_agent,
         NEW.signature_png, NEW.signature_method, NEW.signature_typed_name, NEW.briefed_by, NEW.briefed_by_name)
        IS DISTINCT FROM
        (OLD.id, OLD.document_id, OLD.user_id, OLD.signer_name, OLD.signer_email, OLD.signer_department,
         OLD.signer_distribution_lists, OLD.document_name, OLD.document_category, OLD.version_label,
         OLD.statement_text, OLD.acknowledged_at, OLD.ip_address, OLD.user_agent,
         OLD.signature_png, OLD.signature_method, OLD.signature_typed_name, OLD.briefed_by, OLD.briefed_by_name) THEN
    RAISE EXCEPTION 'acknowledgements can only be voided with a reason';
  END IF;
  RETURN NEW;
END;
$$;
