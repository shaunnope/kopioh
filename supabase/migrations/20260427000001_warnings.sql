CREATE TABLE warnings (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       BIGINT       NOT NULL REFERENCES users(id),
  broadcast_id  BIGINT       NOT NULL,
  submission_id UUID         REFERENCES submissions(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX ON warnings (user_id, broadcast_id);

CREATE TABLE bans (
  user_id       BIGINT       NOT NULL REFERENCES users(id),
  broadcast_id  BIGINT       NOT NULL,
  expires_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, broadcast_id)
);
