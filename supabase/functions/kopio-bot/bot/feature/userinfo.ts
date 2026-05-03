import { Composer } from "grammy";
import type { Context, ConversationContext } from "../context.ts";
import { logHandle } from "../helper/logging.ts";
import { isConnected } from "../helper/connection.ts";
import type { ConnectionInfo } from "../session.ts";
import db from "../../database/index.ts";
import { FormattedString } from "grammy_parse_mode";
import { formatCommandUsageV2 } from "../helper/bot_commands.ts";
import { TranslateFunction } from "grammy_i18n";

const composer = new Composer<Context>();
const feature = composer.chatType("private");

async function requireAdmin(ctx: Context, next: () => Promise<void>) {
  const connection = ctx.session.connection;
  if (!await isConnected(ctx, connection)) return;
  const role = await db.getConnectionRole(ctx.from!.id, connection!.id);
  if (role !== "admin") {
    await ctx.reply(ctx.t("userinfo.not-admin"));
    return;
  }
  return next();
}

export async function resolveDisplayName(ctx: Context | ConversationContext, userId: number): Promise<string> {
  const chat = await ctx.api.getChat(userId).catch(() => null);
  if (chat && "first_name" in chat) {
    const full = chat.last_name ? `${chat.first_name} ${chat.last_name}` : chat.first_name;
    if (full) return full;
    if (chat.username) return `@${chat.username}`;
  }
  return String(userId);
}

export async function getUserInfoCardData(
  userId: number,
  connection: ConnectionInfo
) {
  const [role, warnings, ban, stats] = await Promise.all([
    db.getConnectionRole(userId, connection.id),
    db.getUserWarningCount(userId, connection.broadcastId),
    db.getBanStatus(userId, connection.broadcastId),
    db.getConnectionSubmissionStats(userId, connection.broadcastId),
  ]);
  return { role, warnings, ban, stats }
}

export async function makeUserInfoCard(
  userId: number,
  displayName: string,
  data: ReturnType<typeof getUserInfoCardData>,
  t: TranslateFunction
) {
  const { role, warnings, ban, stats } = await data
  let banLine = FormattedString.b(t("userinfo-ban")).plain(" ")

  banLine = ban === null
    ? banLine.plain(t("userinfo-ban.none"))
    : ban.expiresAt === null
    ? banLine.plain(t("userinfo-ban.perm"))
    : banLine.plain(t("userinfo-ban-temp", {
        date: ban.expiresAt.toLocaleDateString("en-GB", {
          day: "2-digit", month: "short", year: "numeric", timeZone: "UTC",
        }),
      }))

  return FormattedString.b(t("userinfo.header"))
    .plain(" ")
    .link(displayName, `tg://user?id=${userId}`)
    .plain(" [")
    .code(String(userId))
    .plain(`]\n`)
    .b(t("userinfo.role")).plain(" ").code(role).plain("\n")
    .b(t("userinfo.warnings")).plain(` ${warnings}\n`)
    .concat(banLine).plain("\n")
    .plain(t("userinfo.stats", { total: stats.total, approved: stats.approved, pending: stats.pending }))
}

export async function buildUserInfoCard(
  userId: number,
  connection: ConnectionInfo,
  ctx: Context | ConversationContext,
): Promise<FormattedString> {
  const displayName = await resolveDisplayName(ctx, userId)
  const data = getUserInfoCardData(userId, connection)

  return makeUserInfoCard(userId, displayName, data, ctx.t)
}

feature.command("userinfo", logHandle("command-userinfo"), requireAdmin, async (ctx) => {
  const arg = ctx.match?.trim();
  const userId = arg ? parseInt(arg, 10) : NaN;
  if (!arg || isNaN(userId)) {
    const usage = formatCommandUsageV2(ctx.t, "userinfo")
    await ctx.reply(usage.text, { entities: usage.entities });
    return;
  }
  const card = await buildUserInfoCard(userId, ctx.session.connection!, ctx);
  await ctx.reply(card.text, { entities: card.entities });
});

feature.on("message", logHandle("message-userinfo-forward"), async (ctx, next) => {
  const origin = ctx.message.forward_origin;
  if (!origin) return next(); // not a forwarded message — skip entirely

  const connection = ctx.session.connection;
  if (!await isConnected(ctx, connection)) return;
  const role = await db.getConnectionRole(ctx.from!.id, connection!.id);
  if (role !== "admin") {
    await ctx.reply(ctx.t("userinfo.not-admin"));
    return;
  }

  if (origin.type === "hidden_user") {
    await ctx.reply(ctx.t("userinfo.forward-hidden"));
    return;
  }

  if (origin.type === "user") {
    const card = await buildUserInfoCard(origin.sender_user.id, connection!, ctx);
    await ctx.reply(card.text, { entities: card.entities });
    return;
  }

  return next();
});

export { composer as userinfoFeature };
