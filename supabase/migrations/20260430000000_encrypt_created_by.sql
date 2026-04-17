-- Drop FK so created_by can hold encrypted TEXT instead of a BIGINT users.id reference
ALTER TABLE submissions DROP CONSTRAINT submissions_created_by_fkey;

-- Change column type to TEXT (stores 64-char AES-256-CBC hex ciphertext)
-- and allow NULL so anonymizeUserSubmissions can clear attribution
ALTER TABLE submissions
  ALTER COLUMN created_by TYPE TEXT USING created_by::TEXT,
  ALTER COLUMN created_by DROP NOT NULL;
