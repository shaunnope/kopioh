import type { BotCommand, BotCommandScope, LanguageCode } from "grammy/types";
import { Bot } from "../bot/index.ts";
import { config } from "../config.ts";

// ── scope ─────────────────────────────────────────────────────────────────────

function resolveScope(param: string, typeParam: string | null): BotCommandScope | null {
  const defaultType = typeParam == "chat_administrators" ? "chat_administrators" : "chat"

  switch (param) {
    case "private": return { type: "all_private_chats" }
    case "group":   return { type: "all_group_chats" }
    case "admins":  return { type: "all_chat_administrators" }
    case "owner":   return { type: "chat", chat_id: config.BOT_OWNER_ID }
    default: {
      const id = Number(param);
      return Number.isFinite(id) ? { type: defaultType, chat_id: id } : null
    }
  }
}

// ── handler ───────────────────────────────────────────────────────────────────

/**
 * POST /kopio-bot/set/commands/:scope/:lang
 *
 * scope  – "private" | "group" | "owner" | <numeric chat_id>
 * lang   – "default" (no language_code, Telegram fallback)
 *        | "all"     (Telegram fallback + every loaded locale)
 *        | "<code>"  (specific locale, e.g. "en")
 *
 * body   – JSON array of { command, description } objects
 */
export async function setCommands(
  bot: Bot,
  req: Request,
  match: URLPatternResult,
): Promise<Response> {
  const scopeParam = match.pathname.groups.scope;
  const langParam  = match.pathname.groups.lang ?? null;

  if (!scopeParam) {
    return new Response("missing scope", { status: 400 });
  }

  const url = new URL(req.url)

  const scope = resolveScope(scopeParam, url.searchParams.get("type"));
  if (!scope) {
    return new Response(`unknown scope: ${scopeParam}`, { status: 400 });
  }

  let commands: BotCommand[];
  try {
    commands = await req.json();
    if (!Array.isArray(commands)) throw new Error();
  } catch {
    return new Response("body must be a JSON array of BotCommand", { status: 400 });
  }

  // Build the list of (localeCode | null) to process.
  // null means "no language_code" → Telegram uses this as the default fallback.
  const targets: Array<string | null> =
    langParam === "default"
      ? [null]
      : [langParam];

  await Promise.all(
    targets.map((code) => {
      const opts = code === null
        ? { scope }
        : { scope, language_code: code as LanguageCode };
      return bot.api.setMyCommands(commands, opts);
    }),
  );

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * DELETE /kopio-bot/set/commands/:scope/:lang
 *
 * Clears the command list for the given scope/language via deleteMyCommands.
 * Accepts the same scope and lang params as setCommands.
 */
export async function deleteCommands(
  bot: Bot,
  req: Request,
  match: URLPatternResult,
): Promise<Response> {
  const scopeParam = match.pathname.groups.scope;
  const langParam  = match.pathname.groups.lang ?? null;

  if (!scopeParam) {
    return new Response("missing scope", { status: 400 });
  }

  const url = new URL(req.url);
  const scope = resolveScope(scopeParam, url.searchParams.get("type"));
  if (!scope) {
    return new Response(`unknown scope: ${scopeParam}`, { status: 400 });
  }

  const targets: Array<string | null> =
    langParam === "default" ? [null] : [langParam];

  await Promise.all(
    targets.map((code) => {
      const opts = code === null
        ? { scope }
        : { scope, language_code: code as LanguageCode };
      return bot.api.deleteMyCommands(opts);
    }),
  );

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
}
