import { Composer, InlineKeyboard, NextFunction } from "grammy";
import { Context, TryDeleteMessage } from "../context.ts";
import { logHandle } from "../helper/logging.ts";
import db from "../../database/index.ts";
import { getConnectionMeta, getConnection } from "../helper/admin.ts";
import { showHelpMenu } from "./help.ts";
import { showSettings } from "./settings.ts";
import { ConnectionInfo } from "../session.ts";

export const deleteDelayMs = 30_000
const META_TTL_MS = 60 * 60 * 1000; // 1 hour
declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined;

function buildWelcomeMenu(
  ctx: Context,
  groupName: string,
  isMod: boolean,
  isAdmin: boolean,
  userStats?: { pending: number; approved: number },
  modPendingCount?: number,
) {
  const keyboard = new InlineKeyboard()
    .text(ctx.t("welcome.choose-submit"), "welcome:choose:submit")
    .text(ctx.t("welcome.choose-whisper"), "welcome:choose:whisper");

  if (isMod || isAdmin) keyboard.row().text(ctx.t("welcome.choose-review"), "welcome:choose:review");
  if (isAdmin) keyboard.text(ctx.t("welcome.choose-settings"), "welcome:choose:settings");
  keyboard.row().text(ctx.t("welcome.choose-disconnect"), "welcome:choose:disconnect");

  const lines: string[] = [ctx.t("welcome.connected-to", { group: groupName })];
  if ((isMod || isAdmin) && modPendingCount !== undefined)
    lines.push(ctx.t("welcome.mod-pending", { count: modPendingCount }));
  if (userStats)
    lines.push(ctx.t("welcome.user-stats", { pending: userStats.pending, approved: userStats.approved }));
  lines.push("", ctx.t("welcome.choose"));

  return { text: lines.join("\n"), keyboard };
}

const composer = new Composer<Context>()

const feature = composer.chatType("private")
const groupFeature = composer.chatType(["group", "supergroup"])

feature.command(
  "start",
  logHandle("command-start"),
  async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    await db.coerceUser(userId);

    if (ctx.match === "help") {
      await showHelpMenu(ctx);
      return;
    }

    // update session if a new deeplink was provided
    const submitId = ctx.match ? Number(ctx.match) : null;
    if (submitId) {
      const resolved = await getConnection(ctx.api, submitId);
      if (resolved) {
        ctx.session.connection = resolved.connection;
        ctx.session.connectionMeta = resolved.connectionMeta;
      }
    }

    // fall back to global default connection when user has no active connection
    if (!ctx.session.connection) {
      const defaultConn = await db.getDefaultConnection();
      if (defaultConn) {
        ctx.session.connection = defaultConn;
        ctx.session.connectionMeta = await getConnectionMeta(ctx.api, defaultConn.id, defaultConn.submitId);
      }
    }

    if (!ctx.session.connection) {
      await ctx.reply(ctx.t("welcome"), { parse_mode: "HTML"});
      return;
    }

    const connection = ctx.session.connection;

    let meta = ctx.session.connectionMeta;
    if (!meta || meta.id !== connection.id || Date.now() - meta.updated >= META_TTL_MS)
      meta = await getConnectionMeta(ctx.api, connection.id, connection.submitId)

    const groupName = meta.title

    const [role, userStats, modPendingCount] = await Promise.all([
      db.getConnectionRole(userId, connection.id),
      db.getUserSubmissionStats(userId),
      db.countPendingSubmissions(connection.broadcastId),
    ]);
    const { text, keyboard } = buildWelcomeMenu(ctx, groupName, role !== "user", role === "admin", userStats, modPendingCount);
    await ctx.reply(text, { reply_markup: keyboard });
  }
)

feature.callbackQuery("welcome:choose:submit", logHandle("callback-choose-submit"), async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageReplyMarkup();
  await ctx.conversation.enter("submitConvo");
});

feature.callbackQuery("welcome:choose:review", logHandle("callback-choose-review"), async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageReplyMarkup();
  await ctx.conversation.enter("moderateConvo");
});

feature.callbackQuery("welcome:choose:whisper", logHandle("callback-choose-whisper"), async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageReplyMarkup();
  await ctx.conversation.enter("whisperConvo");
});

feature.callbackQuery("welcome:choose:settings", logHandle("callback-choose-settings"), async (ctx) => {
  await ctx.answerCallbackQuery();
  await showSettings(ctx);
});

feature.callbackQuery("welcome:choose:disconnect", logHandle("callback-choose-disconnect"), async (ctx) => {
  await ctx.answerCallbackQuery();
  const confirmKeyboard = new InlineKeyboard()
    .text(ctx.t("welcome.disconnect-confirm-button"), "welcome:dc:confirm")
    .text(ctx.t("command.cancel"), "welcome:dc:cancel");
  await ctx.editMessageText(ctx.t("welcome.disconnect-confirm"), { reply_markup: confirmKeyboard });
});

feature.callbackQuery("welcome:dc:confirm", logHandle("callback-disconnect-confirm"), async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.connection = null;
  ctx.session.connectionMeta = null;
  await ctx.editMessageText(ctx.t("welcome.disconnected"));
});

feature.callbackQuery("welcome:dc:cancel", logHandle("callback-disconnect-cancel"), async (ctx) => {
  await ctx.answerCallbackQuery();
  const connection = ctx.session.connection;
  if (!connection) return;
  const userId = ctx.from.id;
  const [meta, role, userStats, modPendingCount] = await Promise.all([
    getConnectionMeta(ctx.api, connection.id, connection.submitId),
    db.getConnectionRole(userId, connection.id),
    db.getUserSubmissionStats(userId),
    db.countPendingSubmissions(connection.broadcastId),
  ]);
  const { text, keyboard } = buildWelcomeMenu(ctx, meta.title, role !== "user", role === "admin", userStats, modPendingCount);
  await ctx.editMessageText(text, { reply_markup: keyboard });
});

feature.command(
  "disconnect",
  logHandle("command-disconnect-session"),
  async (ctx) => {
    ctx.session.connection = null;
    ctx.session.connectionMeta = null;
    await ctx.reply(ctx.t("welcome.disconnected"));
  }
)

export async function handleGroupStart(ctx: Context, connection?: ConnectionInfo) {
  const chatId = ctx.chat!.id;
  const isConnected = !!(connection ?? await db.getConnectionBySubmitId(chatId));

  if (!isConnected) {
    await ctx.reply(ctx.t("welcome.not-connected-prompt"), { disable_notification: true });
    return;
  }

  const startUrl = `https://t.me/${ctx.me.username}?start=${chatId}`;
  const msg = await ctx.reply(ctx.t("welcome.help"), {
    reply_markup: {
      inline_keyboard: [[
        { text: ctx.t("welcome.help-button"), url: startUrl }
      ]]
    },
    disable_notification: true
  });

  await TryDeleteMessage(ctx);

  const deleteAfterDelay = new Promise<void>((resolve) => {
    setTimeout(async () => {
      try { await msg.delete(); } finally { resolve(); }
    }, deleteDelayMs);
  });

  if (typeof EdgeRuntime !== "undefined") {
    EdgeRuntime.waitUntil(deleteAfterDelay);
  }
}

groupFeature.command(
  "start",
  logHandle("command-start"),
  ctx => handleGroupStart(ctx),
)

export { composer as welcomeFeature }
