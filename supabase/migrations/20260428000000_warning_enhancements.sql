ALTER TABLE warnings ADD COLUMN reason TEXT;

ALTER TABLE connection_config
  ADD COLUMN warn_threshold_temp INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN warn_threshold_perm INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN temp_ban_days       INTEGER NOT NULL DEFAULT 7;
