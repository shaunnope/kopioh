ALTER TABLE connection_config
  ADD COLUMN auto_post_enabled     BOOLEAN  NOT NULL DEFAULT FALSE,
  ADD COLUMN post_interval_minutes INTEGER  NOT NULL DEFAULT 60;
