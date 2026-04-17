CREATE TABLE global_config (
  singleton             BOOLEAN PRIMARY KEY DEFAULT TRUE,
  default_connection_id UUID    REFERENCES connections(id) ON DELETE SET NULL,
  CONSTRAINT single_row CHECK (singleton = TRUE)
);

INSERT INTO global_config (singleton) VALUES (TRUE);
