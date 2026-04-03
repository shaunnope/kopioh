// function entry point
import { webhookCallback } from "https://deno.land/x/grammy@v1.42.0/mod.ts";
import { getBot } from "./bot/index.ts";

const bot = getBot();

const handleUpdate = webhookCallback(bot, "std/http");

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    if (url.searchParams.get("secret") !== bot.token) {
      return new Response("not allowed", { status: 405 });
    }
    return await handleUpdate(req);
  } catch (err) {
    console.error(err);
  }
  return new Response();
});