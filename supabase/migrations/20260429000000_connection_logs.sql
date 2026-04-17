-- whisper.new excluded by default — noisy on high-volume connections
ALTER TABLE connection_config
  ADD COLUMN log_excluded_events TEXT[] NOT NULL DEFAULT '{whisper.new}';
