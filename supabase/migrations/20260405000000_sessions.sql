CREATE TABLE sessions (
  chat_id BIGINT PRIMARY KEY,
  data    JSONB NOT NULL DEFAULT '{}'
);
