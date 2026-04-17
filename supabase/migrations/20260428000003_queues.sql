CREATE TABLE queues (
  id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id          BIGINT       NOT NULL,
  name                  TEXT         NOT NULL,
  post_interval_minutes INTEGER      NOT NULL DEFAULT 60,
  auto_post_enabled     BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (broadcast_id, name)
);

ALTER TABLE submissions
  ADD COLUMN queue_id UUID REFERENCES queues(id) ON DELETE SET NULL;

-- Per-queue scheduling supersedes the per-connection columns added in 20260428000001
ALTER TABLE connection_config
  DROP COLUMN auto_post_enabled,
  DROP COLUMN post_interval_minutes;
