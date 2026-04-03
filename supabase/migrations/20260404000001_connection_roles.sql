-- Per-connection user roles.
-- A user may hold different roles across different connections.
-- users.role remains for global bot configuration (e.g. superadmin).
CREATE TABLE connection_roles (
  user_id        BIGINT    NOT NULL REFERENCES users(id),
  connection_id  UUID      NOT NULL REFERENCES connections(id),
  role           user_role NOT NULL DEFAULT 'user',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, connection_id)
);
