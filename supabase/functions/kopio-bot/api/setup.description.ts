import type { LanguageCode } from "grammy/types";
import { Bot } from "../bot/index.ts";

interface DescriptionBody {
  description?: string;
  short_description?: string;
}

function parseBody(raw: unknown): DescriptionBody | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const { description, short_description } = raw as Record<string, unknown>;
  if (description !== undefined && typeof description !== "string") return null;
  if (short_description !== undefined && typeof short_description !== "string") return null;
  if (description === undefined && short_description === undefined) return null;
  return { description, short_description };
}

// ── handlers ──────────────────────────────────────────────────────────────────

/**
 * POST /kopio-bot/set/description/:lang
 *
 * lang – "default" (no language_code, Telegram fallback)
 *      | "<code>"  (specific locale, e.g. "en")
 *
 * body – { description?: string, short_description?: string }
 *        At least one field must be present.
 */
export async function setDescription(
  bot: Bot,
  req: Request,
  match: URLPatternResult,
): Promise<Response> {
  const langParam = match.pathname.groups.lang ?? "default";

  let body: DescriptionBody | null;
  try {
    body = parseBody(await req.json());
  } catch {
    body = null;
  }
  if (!body) {
    return new Response(
      "body must be a JSON object with at least one of: description, short_description",
      { status: 400 },
    );
  }

  const opts = langParam === "default" ? {} : { language_code: langParam as LanguageCode };

  await Promise.all([
    body.description !== undefined
      ? bot.api.setMyDescription(body.description, opts)
      : Promise.resolve(),
    body.short_description !== undefined
      ? bot.api.setMyShortDescription(body.short_description, opts)
      : Promise.resolve(),
  ]);

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * DELETE /kopio-bot/set/description/:lang
 *
 * Clears both description and short_description for the given language
 * by setting them to empty strings (Telegram has no dedicated delete endpoint).
 */
export async function deleteDescription(
  bot: Bot,
  _req: Request,
  match: URLPatternResult,
): Promise<Response> {
  const langParam = match.pathname.groups.lang ?? "default";
  const opts = langParam === "default" ? {} : { language_code: langParam as LanguageCode };

  await Promise.all([
    bot.api.setMyDescription("", opts),
    bot.api.setMyShortDescription("", opts),
  ]);

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
}
