-- Re-add the FK on connection_roles.connection_id with ON DELETE CASCADE
-- so that deleting a connection automatically removes all associated roles.
ALTER TABLE connection_roles
  DROP CONSTRAINT connection_roles_connection_id_fkey,
  ADD CONSTRAINT connection_roles_connection_id_fkey
    FOREIGN KEY (connection_id) REFERENCES connections(id) ON DELETE CASCADE;
