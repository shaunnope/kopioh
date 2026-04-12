/**
 * Support for users to manage their own data:
 * private session info
 * submission stats
 * etc.
 *
 * Allow users to opt out, delete their own sessions, unlink submission info (remove user id)
 */
import { Composer, InlineKeyboard } from "grammy";
import { Context } from "../context.ts";
import { logHandle } from "../helper/logging.ts";
import db from "../../database/index.ts";

const composer = new Composer<Context>();
const feature = composer.chatType("private");

feature.command("getdata", logHandle("command-getdata"), async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  const stats = await db.getUserSubmissionStats(userId);
  const meta = ctx.session.connectionMeta;
  const conn = ctx.session.connection;
  const freshMeta = meta && conn && meta.id === conn.id;
  const sessionDesc = freshMeta
    ? ctx.t("privacy.session_active", { group: meta.title })
    : ctx.t("privacy.session_none");

  const keyboard = new InlineKeyboard()
    .text(ctx.t("privacy.unlink_button"), "privacy:unlink")
    .text(ctx.t("privacy.deleteall_button"), "privacy:deleteall");

  await ctx.reply(
    ctx.t("privacy.summary", {
      total:    stats.total,
      approved: stats.approved,
      pending:  stats.pending,
      session:  sessionDesc,
    }),
    { reply_markup: keyboard },
  );
});

// Unlink: confirmation prompt
feature.callbackQuery("privacy:unlink", logHandle("callback-privacy-unlink"), async (ctx) => {
  const userId = ctx.from.id;
  const stats = await db.getUserSubmissionStats(userId);

  await ctx.editMessageReplyMarkup();
  const keyboard = new InlineKeyboard()
    .text(ctx.t("privacy.confirm_button"), "privacy:unlink:confirm")
    .text(ctx.t("privacy.cancel_button"), "privacy:cancel");

  await ctx.reply(
    ctx.t("privacy.unlink_prompt", { count: stats.total }),
    { reply_markup: keyboard },
  );
  await ctx.answerCallbackQuery();
});

// Unlink: confirmed
feature.callbackQuery("privacy:unlink:confirm", logHandle("callback-privacy-unlink-confirm"), async (ctx) => {
  const userId = ctx.from.id;
  const count = await db.anonymizeUserSubmissions(userId);

  await ctx.editMessageText(ctx.t("privacy.unlink_success", { count }));
  await ctx.answerCallbackQuery();
});

// Delete all: confirmation prompt
feature.callbackQuery("privacy:deleteall", logHandle("callback-privacy-deleteall"), async (ctx) => {
  await ctx.editMessageReplyMarkup();
  const keyboard = new InlineKeyboard()
    .text(ctx.t("privacy.confirm_button"), "privacy:deleteall:confirm")
    .text(ctx.t("privacy.cancel_button"), "privacy:cancel");

  await ctx.reply(ctx.t("privacy.deleteall_prompt"), { reply_markup: keyboard });
  await ctx.answerCallbackQuery();
});

// Delete all: confirmed
feature.callbackQuery("privacy:deleteall:confirm", logHandle("callback-privacy-deleteall-confirm"), async (ctx) => {
  const userId = ctx.from.id;

  ctx.session.connection = null;
  ctx.session.connectionMeta = null;
  await db.deleteUserData(userId);

  await ctx.editMessageText(ctx.t("privacy.deleteall_success"));
  await ctx.answerCallbackQuery();
});

// Cancel any pending action
feature.callbackQuery("privacy:cancel", logHandle("callback-privacy-cancel"), async (ctx) => {
  await ctx.editMessageText(ctx.t("privacy.cancelled"));
  await ctx.answerCallbackQuery();
});

export { composer as privacyFeature };
