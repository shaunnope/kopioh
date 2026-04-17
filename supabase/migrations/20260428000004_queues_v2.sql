-- Replace the simple queues table with the full cron_queues schema.
-- The prior migration (20260428000003) created a minimal queues table;
-- DROP CASCADE removes the FK constraint on submissions.queue_id (column stays).

DROP TABLE IF EXISTS queues CASCADE;

CREATE TABLE queues (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id    UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  schedule_type    TEXT NOT NULL CHECK (schedule_type IN ('interval', 'fixed')),
  timezone         TEXT NOT NULL DEFAULT 'UTC',
  -- interval: post every interval_minutes between start_time and end_time
  interval_minutes INTEGER,
  start_time       TIME,
  end_time         TIME,
  -- fixed: post at these exact times each day
  times            TIME[],
  -- NULL = every day; 0=Sun … 6=Sat (Postgres DOW convention)
  days_of_week     SMALLINT[],
  last_posted_at           TIMESTAMPTZ,
  low_submission_threshold INTEGER NOT NULL DEFAULT 5,
  low_alert_sent_at        TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (connection_id, name)
);

CREATE TABLE queue_templates (
  queue_id    UUID PRIMARY KEY REFERENCES queues(id) ON DELETE CASCADE,
  prefix      TEXT,
  suffix      TEXT,
  use_counter BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE queue_counters (
  queue_id UUID PRIMARY KEY REFERENCES queues(id) ON DELETE CASCADE,
  value    INTEGER NOT NULL DEFAULT 0
);

-- submissions.queue_id column already exists from 20260428000003;
-- re-attach the FK constraint to the new queues table.
ALTER TABLE submissions
  ADD CONSTRAINT submissions_queue_id_fkey
  FOREIGN KEY (queue_id) REFERENCES queues(id) ON DELETE SET NULL;
