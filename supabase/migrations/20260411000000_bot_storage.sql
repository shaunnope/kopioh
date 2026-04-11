-- grammY session storage: one row per chat/user key
CREATE TABLE bot_sessions (
  key    TEXT  PRIMARY KEY,
  value  JSONB NOT NULL
);

-- grammY conversations storage: one row per active conversation
CREATE TABLE bot_conversations (
  key    TEXT  PRIMARY KEY,
  value  JSONB NOT NULL
);
