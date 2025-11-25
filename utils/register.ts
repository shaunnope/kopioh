// register new bot token. Only needs to be run after token is revoked.

import "./command.ts"
import { logOuput, runCommand } from "./command.ts";

const PROJECT_REF = Deno.env.get("SUPABASE_PROJECT_ID");
if (!PROJECT_REF) throw new Error("SUPABASE_PROJECT_ID is unset");

const BOT_TOKEN = Deno.env.get("BOT_TOKEN");
if (!BOT_TOKEN) throw new Error("BOT_TOKEN is unset");

// update token secret
let res = await runCommand("supabase", [
      "secrets",
      "set",
      `BOT_TOKEN=${BOT_TOKEN}`,
      "--project-ref",
      PROJECT_REF,
    ]);
logOuput(res);

// update webhook url
//https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=https://<PROJECT_REFERENCE_ID>.supabase.co/functions/v1/telegram-bot?secret=<BOT_TOKEN>
res = await runCommand("curl", [
      `https://api.telegram.org/bot${BOT_TOKEN}/setWebhook?url=https://${PROJECT_REF}.supabase.co/functions/v1/kopioh-bot?secret=${BOT_TOKEN}`,
    ]);
logOuput(res);