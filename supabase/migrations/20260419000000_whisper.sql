CREATE TABLE whispers (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  submit_id   BIGINT       NOT NULL,
  created_by  BIGINT       NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX whispers_rate_limit_idx ON whispers (created_by, submit_id, created_at);

CREATE TABLE connection_config (
  connection_id         UUID    PRIMARY KEY REFERENCES connections(id) ON DELETE CASCADE,
  allowed_types         TEXT[]  NOT NULL DEFAULT ARRAY['text','photo','video','audio','voice','animation','sticker','poll','document'],
  whisper_allowed_types TEXT[]  NOT NULL DEFAULT ARRAY['text'],
  whisper_limit         INTEGER NOT NULL DEFAULT 3,
  whisper_period_minutes INTEGER NOT NULL DEFAULT 60,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
