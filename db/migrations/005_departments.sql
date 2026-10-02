-- Outstations become departments, and the distribution-list teams join the same list.
-- Each person belongs to one department. Records already signed keep what they stored.

DROP VIEW document_signers;

ALTER TABLE outstations RENAME TO departments;
ALTER INDEX outstations_name_key RENAME TO departments_name_key;
ALTER SEQUENCE outstations_id_seq RENAME TO departments_id_seq;
ALTER TABLE users RENAME COLUMN outstation_id TO department_id;
ALTER INDEX users_outstation_idx RENAME TO users_department_idx;
ALTER TABLE document_outstations RENAME TO document_departments;
ALTER TABLE document_departments RENAME COLUMN outstation_id TO department_id;
ALTER INDEX document_outstations_pkey RENAME TO document_departments_pkey;
ALTER INDEX document_outstations_outstation_idx RENAME TO document_departments_department_idx;
ALTER TABLE acknowledgements RENAME COLUMN signer_outstation TO signer_department;

INSERT INTO departments (name, sort_order) VALUES
  ('Engineering', 11),
  ('Health and Safety', 12),
  ('Purchasing', 13),
  ('Operations Management', 14),
  ('Fleet Control', 15)
ON CONFLICT DO NOTHING;

-- Documents sent to a distribution list are now sent to the matching department.
INSERT INTO document_departments (document_id, department_id)
SELECT ddl.document_id, d.id
  FROM document_distribution_lists ddl
  JOIN distribution_lists dl ON dl.id = ddl.list_id
  JOIN departments d
    ON lower(d.name) = lower(CASE dl.name WHEN 'Operations Managers' THEN 'Operations Management' ELSE dl.name END)
ON CONFLICT DO NOTHING;

-- People without a department take the one matching their first distribution list.
UPDATE users u
   SET department_id = (
     SELECT d.id
       FROM user_distribution_lists udl
       JOIN distribution_lists dl ON dl.id = udl.list_id
       JOIN departments d
         ON lower(d.name) = lower(CASE dl.name WHEN 'Operations Managers' THEN 'Operations Management' ELSE dl.name END)
      WHERE udl.user_id = u.id
      ORDER BY dl.sort_order
      LIMIT 1)
 WHERE u.department_id IS NULL
   AND EXISTS (SELECT 1 FROM user_distribution_lists udl WHERE udl.user_id = u.id);

-- Anyone who was expected through a distribution list but isn't in a matching department now
-- (because they belong to another department) is added to that document by name, so nobody drops off.
INSERT INTO expected_signers (document_id, user_id)
SELECT ddl.document_id, udl.user_id
  FROM document_distribution_lists ddl
  JOIN user_distribution_lists udl ON udl.list_id = ddl.list_id
 WHERE NOT EXISTS (
   SELECT 1 FROM document_departments dd JOIN users u ON u.department_id = dd.department_id
    WHERE dd.document_id = ddl.document_id AND u.id = udl.user_id)
ON CONFLICT DO NOTHING;

DROP TABLE document_distribution_lists;
DROP TABLE user_distribution_lists;
DROP TABLE distribution_lists;

-- Everyone expected to sign: people added by name plus everyone in a ticked department.
CREATE VIEW document_signers AS
SELECT x.document_id, x.user_id, bool_or(x.individual) AS individual
  FROM (
    SELECT es.document_id, es.user_id, true AS individual
      FROM expected_signers es
    UNION ALL
    SELECT dd.document_id, u.id, false
      FROM document_departments dd
      JOIN users u ON u.department_id = dd.department_id
  ) x
 GROUP BY x.document_id, x.user_id;

-- Same rules as before, using the renamed column. signer_distribution_lists stays for old records.
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
         NEW.statement_text, NEW.acknowledged_at, NEW.ip_address, NEW.user_agent)
        IS DISTINCT FROM
        (OLD.id, OLD.document_id, OLD.user_id, OLD.signer_name, OLD.signer_email, OLD.signer_department,
         OLD.signer_distribution_lists, OLD.document_name, OLD.document_category, OLD.version_label,
         OLD.statement_text, OLD.acknowledged_at, OLD.ip_address, OLD.user_agent) THEN
    RAISE EXCEPTION 'acknowledgements can only be voided with a reason';
  END IF;
  RETURN NEW;
END;
$$;
