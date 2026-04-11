import { Composer } from "grammy";
import { Context } from "../context.ts";
import { logHandle } from "../helper/logging.ts";
import db from "../../database/index.ts";

const deleteDelayMs = 5_000
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

    const submitId = ctx.match ? Number(ctx.match) : null;
    const connection = submitId ? await db.getConnectionBySubmitId(submitId) : null;

    if (connection) {
      ctx.session.pendingBroadcastId = connection.broadcast_id;
      await ctx.conversation.enter("submitConvo");
      return;
    }

    await ctx.reply(ctx.t("welcome"));
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

    await ctx.deleteMessage().catch(() => {
      // Bot may lack admin rights to delete messages in this group
    });

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
