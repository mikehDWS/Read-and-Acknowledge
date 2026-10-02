-- A signature (drawn, or a typed name rendered as a signature) replaces the tick box.
-- Earlier records have no signature and keep the statement they were signed against.

ALTER TABLE acknowledgements
  ADD COLUMN signature_png bytea,
  ADD COLUMN signature_method text CHECK (signature_method IN ('drawn', 'typed')),
  ADD COLUMN signature_typed_name text,
  ADD CONSTRAINT acknowledgements_signature_complete
    CHECK ((signature_png IS NULL) = (signature_method IS NULL));

-- Same rules as before, with the signature protected too.
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
         NEW.signature_png, NEW.signature_method, NEW.signature_typed_name)
        IS DISTINCT FROM
        (OLD.id, OLD.document_id, OLD.user_id, OLD.signer_name, OLD.signer_email, OLD.signer_department,
         OLD.signer_distribution_lists, OLD.document_name, OLD.document_category, OLD.version_label,
         OLD.statement_text, OLD.acknowledged_at, OLD.ip_address, OLD.user_agent,
         OLD.signature_png, OLD.signature_method, OLD.signature_typed_name) THEN
    RAISE EXCEPTION 'acknowledgements can only be voided with a reason';
  END IF;
  RETURN NEW;
END;
$$;
