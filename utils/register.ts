// register new bot token. Only needs to be run after token is revoked.

import "./command.ts"
import { logOuput, runCommand } from "./command.ts";

const PROJECT_REF = Deno.env.get("PROJECT_ID");
const BOT_TOKEN = Deno.env.get("BOT_TOKEN");
const PLATFORM = Deno.env.get("PLATFORM")

async function register() {
  
  if (!PROJECT_REF) throw new Error("PROJECT_ID is unset");
  if (!BOT_TOKEN) throw new Error("BOT_TOKEN is unset");

  let webhookUrl = ""
  switch (PLATFORM) {
    case "supabase":
    default:
    {
      const FUNCTION = Deno.env.get("FUNCTION")
      if (!FUNCTION) throw new Error("FUNCTION is unset");
      
      // update token secret
      const res = await runCommand("supabase", [
          "secrets",
          "set",
          `BOT_TOKEN=${BOT_TOKEN}`,
          "--project-ref",
          PROJECT_REF,
        ]);
      logOuput(res);
      webhookUrl = `https://${PROJECT_REF}.supabase.co/functions/v1/${FUNCTION}?secret=${BOT_TOKEN}`
    }
  }

  

  // update webhook url
  //https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=https://<PROJECT_REFERENCE_ID>.supabase.co/functions/v1/telegram-bot?secret=<BOT_TOKEN>
  const res = await runCommand("curl", [
        `https://api.telegram.org/bot${BOT_TOKEN}/setWebhook?url=${webhookUrl}}`,
      ]);
  logOuput(res);
}



await register()