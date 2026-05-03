import { Composer } from "grammy";
import type { Context } from "../context.ts";
import { logHandle } from "../helper/logging.ts";
import { isConnected } from "../helper/connection.ts";
import db from "../../database/index.ts";
import type { WarningDetail } from "../../database/index.ts";
import { FormattedString } from "grammy_parse_mode";
import { formatCommandUsageV2 } from "../helper/bot_commands.ts";
import type { TranslateFunction } from "grammy_i18n";
import { resolveDisplayName } from "./userinfo.ts";

const composer = new Composer<Context>();
const feature = composer.chatType("private");

function makeWarningsCard(
  userId: number,
  displayName: string,
  warnings: WarningDetail[],
  t: TranslateFunction,
): FormattedString {
  let card = FormattedString.b(t("warnings"))
    .plain(" ")
    .link(displayName, `tg://user?id=${userId}`)
    .plain(" [")
    .code(String(userId))
    .plain("]\n")
    .plain(t("warnings.count", { count: warnings.length }));

  if (warnings.length === 0) {
    return card.plain("\n").plain(t("warnings.none"));
  }

  for (const w of warnings) {
    const d = w.createdAt;
    const pad = (n: number) => String(n).padStart(2, "0");
    const date = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
    const shortId = w.id.slice(0, 8);
    const reason = w.reason ?? t("warn.notify-no-reason");
    card = card.plain("\n[").code(shortId).plain(`] ${date}  — ${reason}`);
    if (w.appealStatus === "rejected" && w.rejectionReason) {
      card = card.plain(`\n${t("warnings.appeal-rejected-reason", { reason: w.rejectionReason })}`);
    } else if (w.appealStatus !== "none") {
      card = card.plain(` ${t(`warnings.appeal-${w.appealStatus}`)}`);
    }
  }

  return card;
}

feature.command("warnings", logHandle("command-warnings"), async (ctx) => {
  const connection = ctx.session.connection;
  if (!await isConnected(ctx, connection)) return;

  const callerId = ctx.from!.id;
  const arg = ctx.match?.trim();

  let targetId: number;
  if (arg) {
    const role = await db.getConnectionRole(callerId, connection!.id);
    if (role !== "admin") {
      await ctx.reply(ctx.t("warnings.not-admin"));
      return;
    }
    targetId = parseInt(arg, 10);
    if (isNaN(targetId)) {
      const usage = formatCommandUsageV2(ctx.t, "warnings");
      await ctx.reply(usage.text, { entities: usage.entities });
      return;
    }
  } else {
    targetId = callerId;
  }

  const [displayName, warnings] = await Promise.all([
    resolveDisplayName(ctx, targetId),
    db.getWarningDetails(targetId, connection!.broadcastId),
  ]);
  const card = makeWarningsCard(targetId, displayName, warnings, ctx.t);
  await ctx.reply(card.text, { entities: card.entities });
});

export { composer as warningsFeature };
