-- Cron job: auto-post from queues every 30 minutes
-- Requires vault secrets 'kopio_platform_key' and 'kopio_project_url'.
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
