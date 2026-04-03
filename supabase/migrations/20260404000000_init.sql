-- Enums
CREATE TYPE user_role AS ENUM ('user', 'moderator', 'admin');
CREATE TYPE content_type AS ENUM ('message', 'poll');

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
  broadcast_id  BIGINT  NOT NULL,  -- Telegram chat ID of the broadcast channel
  submit_id     BIGINT  NOT NULL,  -- Telegram chat ID of the submit group/topic
  logs_id       BIGINT,            -- Telegram chat ID of the logs channel (optional)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (broadcast_id, submit_id)
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
CREATE TABLE submissions (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id      BIGINT       NOT NULL,   -- target broadcast channel
  created_by        BIGINT       NOT NULL REFERENCES users(id),
  content           JSONB        NOT NULL,   -- Telegram message/poll object (text + entities)
  content_type      content_type NOT NULL DEFAULT 'message',
  original_content  JSONB,                   -- preserved on first moderator edit
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  in_review         TIMESTAMPTZ,             -- set when a moderator opens the submission
  reviewed_by       BIGINT       REFERENCES users(id),
  reviewed_at       TIMESTAMPTZ,
  posted_at         TIMESTAMPTZ,
  is_rejected       BOOLEAN      NOT NULL DEFAULT FALSE
);
