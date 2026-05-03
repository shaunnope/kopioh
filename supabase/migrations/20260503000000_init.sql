-- Extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Enums
CREATE TYPE user_role AS ENUM ('user', 'moderator', 'admin');

-- Users: Telegram users who interact with the bot
CREATE TABLE users (
  id          BIGINT      PRIMARY KEY,  -- Telegram user ID
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  role        user_role   NOT NULL DEFAULT 'user'
);

-- Connections: a <broadcast, submit, logs> chat set
-- A broadcast may have multiple submit chats; each submit belongs to one broadcast.
CREATE TABLE connections (
  id            UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id  BIGINT  NOT NULL,
  submit_id     BIGINT  NOT NULL,
  logs_id       BIGINT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (broadcast_id, submit_id)
);

-- Per-connection user roles.
-- A user may hold different roles across different connections.
-- users.role remains for global bot configuration (e.g. superadmin).
CREATE TABLE connection_roles (
  user_id        BIGINT    NOT NULL REFERENCES users(id),
  connection_id  UUID      NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
  role           user_role NOT NULL DEFAULT 'user',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, connection_id)
);

-- Queues: named posting schedules tied to a connection
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

-- Submissions: content submitted by users for broadcast
--
-- Status is inferred:
--   pending:   in_review IS NULL     AND reviewed_by IS NULL AND is_rejected = FALSE
--   in_review: in_review IS NOT NULL AND reviewed_by IS NULL AND is_rejected = FALSE
--   approved:  reviewed_by IS NOT NULL AND posted_at IS NULL AND is_rejected = FALSE
--   posted:    posted_at IS NOT NULL
--   rejected:  is_rejected = TRUE
--
-- original_content is populated on the first moderator edit, preserving what the
-- user originally submitted. Subsequent edits do not overwrite it.
-- created_by stores a 64-char AES-256-CBC hex ciphertext (or NULL if anonymised).
CREATE TABLE submissions (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id      BIGINT       NOT NULL,
  created_by        TEXT,                    -- encrypted Telegram user ID
  content           JSONB        NOT NULL,
  original_content  JSONB,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  in_review         TIMESTAMPTZ,
  reviewed_by       BIGINT       REFERENCES users(id),
  reviewed_at       TIMESTAMPTZ,
  posted_at         TIMESTAMPTZ,
  is_rejected       BOOLEAN      NOT NULL DEFAULT FALSE,
  queue_id          UUID         REFERENCES queues(id) ON DELETE SET NULL
);

-- grammY session and conversation storage
CREATE TABLE bot_sessions (
  key    TEXT  PRIMARY KEY,
  value  JSONB NOT NULL
);

CREATE TABLE bot_conversations (
  key    TEXT  PRIMARY KEY,
  value  JSONB NOT NULL
);

-- Whispers: anonymous replies from moderators to submitters
CREATE TABLE whispers (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  submit_id   BIGINT       NOT NULL,
  created_by  BIGINT       NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX whispers_rate_limit_idx ON whispers (created_by, submit_id, created_at);

-- Per-connection bot configuration
CREATE TABLE connection_config (
  connection_id           UUID     PRIMARY KEY REFERENCES connections(id) ON DELETE CASCADE,
  allowed_types           TEXT[]   NOT NULL DEFAULT ARRAY['text','photo','video','audio','voice','animation','sticker','poll','document'],
  whisper_allowed_types   TEXT[]   NOT NULL DEFAULT ARRAY['text'],
  whisper_limit           INTEGER  NOT NULL DEFAULT 3,
  whisper_period_minutes  INTEGER  NOT NULL DEFAULT 60,
  warn_threshold_temp     INTEGER  NOT NULL DEFAULT 3,
  warn_threshold_perm     INTEGER  NOT NULL DEFAULT 5,
  temp_ban_days           INTEGER  NOT NULL DEFAULT 7,
  log_excluded_events     TEXT[]   NOT NULL DEFAULT '{whisper.new}',
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Global bot configuration (single row)
CREATE TABLE global_config (
  singleton             BOOLEAN PRIMARY KEY DEFAULT TRUE,
  default_connection_id UUID    REFERENCES connections(id) ON DELETE SET NULL,
  CONSTRAINT single_row CHECK (singleton = TRUE)
);

INSERT INTO global_config (singleton) VALUES (TRUE);

-- Moderation: warnings and bans
CREATE TABLE warnings (
  id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               BIGINT       NOT NULL REFERENCES users(id),
  broadcast_id          BIGINT       NOT NULL,
  submission_id         TEXT,        -- encrypted submission UUID (AES-CBC, random IV)
  reason                TEXT,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  appeal_at             TIMESTAMPTZ,
  appeal_reason         TEXT,
  appeal_processed_at   TIMESTAMPTZ,
  appeal_rejection      TEXT
);

CREATE INDEX ON warnings (user_id, broadcast_id);

CREATE TABLE bans (
  user_id       BIGINT       NOT NULL REFERENCES users(id),
  broadcast_id  BIGINT       NOT NULL,
  expires_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, broadcast_id)
);
