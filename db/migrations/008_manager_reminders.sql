-- One row per weekly reminder email sent to a manager, so a manager gets at most one a week
-- even if the scheduled job runs twice.
CREATE TABLE manager_reminders (
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  week_start  date NOT NULL,
  sent_at     timestamptz NOT NULL DEFAULT now(),
  documents   integer NOT NULL,
  outstanding integer NOT NULL,
  PRIMARY KEY (user_id, week_start)
);
