-- Managers of a department can see who in it still needs to sign. A department can have more
-- than one manager, and one person can manage several departments.
CREATE TABLE department_managers (
  department_id integer NOT NULL REFERENCES departments (id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  added_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (department_id, user_id)
);
CREATE INDEX department_managers_user_idx ON department_managers (user_id);
