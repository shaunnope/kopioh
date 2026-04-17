-- Requires two secrets set in Supabase Vault before this job will succeed:
--   'kopio_platform_key'  →  value of the PLATFORM_KEY env var
--   'kopio_project_url'   →  e.g. https://<project-id>.supabase.co
--
-- Set them once via Supabase CLI:
--   supabase secrets set --env-file .env   (if PLATFORM_KEY is in .env)
-- Or via the dashboard: Project Settings → Vault → New secret

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.schedule(
  'kopio-auto-post',
  '*/30 * * * *',
  $$
    SELECT net.http_post(
      url     := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'kopio_project_url')
                 || '/functions/v1/kopio-bot/cron/post',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'kopio_platform_key')
      ),
      body    := '{}'::jsonb
    );
  $$
);
