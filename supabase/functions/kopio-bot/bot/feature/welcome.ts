import { Composer, InlineKeyboard } from "grammy";
import { Context, TryDeleteMessage } from "../context.ts";
import { logHandle } from "../helper/logging.ts";
import db from "../../database/index.ts";
import { getConnectionMeta, getConnection } from "../helper/admin.ts";

const deleteDelayMs = 5_000
const META_TTL_MS = 60 * 60 * 1000; // 1 hour
declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined;

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

    // update session if a new deeplink was provided
    const submitId = ctx.match ? Number(ctx.match) : null;
    if (submitId) {
      const resolved = await getConnection(ctx.api, submitId);
      if (resolved) {
        ctx.session.connection = resolved.connection;
        ctx.session.connectionMeta = resolved.connectionMeta;
      }
    }

    if (!ctx.session.connection) {
      await ctx.reply(ctx.t("welcome"));
      return;
    }

    const connection = ctx.session.connection;
    
    let meta = ctx.session.connectionMeta;
    if (!meta || meta.id !== connection.id || Date.now() - meta.updated >= META_TTL_MS) 
      meta = await getConnectionMeta(ctx.api, connection.id, connection.submitId)

    const groupName = meta.title

    const isMod = await db.isUserModerator(userId, connection.id);
    if (isMod) {
      const keyboard = new InlineKeyboard()
        .text(ctx.t("welcome.choose_submit"), "welcome:choose:submit")
        .text(ctx.t("welcome.choose_review"), "welcome:choose:review");

      const text = `${ctx.t("welcome.connected_to", { group: groupName })}\n\n${ctx.t("welcome.choose")}`
      await ctx.reply(text, { reply_markup: keyboard });
      return;
    }

    await ctx.reply(ctx.t("welcome.connected_to", { group: groupName }));
    await ctx.conversation.enter("submitConvo");
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

feature.command(
  "disconnect",
  logHandle("command-disconnect-session"),
  async (ctx) => {
    ctx.session.connection = null;
    ctx.session.connectionMeta = null;
    await ctx.reply(ctx.t("welcome.disconnected"));
  }
)

groupFeature.command(
  "start",
  logHandle("command-start"),
  async (ctx) => {
    const chatId = ctx.chat.id;
    const botUsername = ctx.me.username;
    const startUrl = `https://t.me/${botUsername}?start=${chatId}`;

    const msg = await ctx.reply(ctx.t("welcome.help"), {
      reply_markup: {
        inline_keyboard: [[
          { text: ctx.t("welcome.help_button"), url: startUrl }
        ]]
      }
    });

    await TryDeleteMessage(ctx)

    const deleteAfterDelay = new Promise<void>((resolve) => {
      setTimeout(async () => {
        try { await msg.delete(); } finally { resolve(); }
      }, deleteDelayMs);
    });

    if (typeof EdgeRuntime !== "undefined") {
      EdgeRuntime.waitUntil(deleteAfterDelay);
    }
  }
)

export { composer as welcomeFeature }
