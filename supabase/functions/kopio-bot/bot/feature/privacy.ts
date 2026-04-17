/**
 * Support for users to manage their own data:
 * private session info
 * submission stats
 * etc.
 *
 * Allow users to opt out, delete their own sessions, unlink submission info (remove user id)
 */
import { Composer, InlineKeyboard } from "grammy";
import type { Context } from "../context.ts";
import { logHandle } from "../helper/logging.ts";
import db from "../../database/index.ts";
import { log } from "../log.ts";

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
    ? ctx.t("privacy.session-active", { group: meta.title })
    : ctx.t("privacy.session-none");

  const keyboard = new InlineKeyboard()
    .text(ctx.t("privacy.unlink-button"), "privacy:unlink")
    .text(ctx.t("privacy.deleteall-button"), "privacy:deleteall")
    .row().text(ctx.t("command.cancel"), "g:cancel")

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
    .text(ctx.t("command.confirm"), "privacy:unlink:confirm")
    .text(ctx.t("command.cancel"), "g:cancel");

  await ctx.reply(
    ctx.t("privacy.unlink-prompt", { count: stats.total }),
    { reply_markup: keyboard },
  );
  await ctx.answerCallbackQuery();
});

// Unlink: confirmed
feature.callbackQuery("privacy:unlink:confirm", logHandle("callback-privacy-unlink-confirm"), async (ctx) => {
  const userId = ctx.from.id;
  const count = await db.anonymizeUserSubmissions(userId);

  await ctx.editMessageText(ctx.t("privacy.unlink-success", { count }));
  await ctx.answerCallbackQuery();

  const connection = ctx.session.connection;
  log(ctx.api, connection?.logsId, { type: "privacy.anonymized" }, {
    get: () => db.getConnectionConfig(connection!.id).then(cfg => cfg.log_excluded_events)
  });
});

// Delete all: confirmation prompt
feature.callbackQuery("privacy:deleteall", logHandle("callback-privacy-deleteall"), async (ctx) => {
  await ctx.editMessageReplyMarkup();
  const keyboard = new InlineKeyboard()
    .text(ctx.t("command.confirm"), "privacy:deleteall:confirm")
    .text(ctx.t("command.cancel"), "g:cancel");

  await ctx.reply(ctx.t("privacy.deleteall-prompt"), { reply_markup: keyboard });
  await ctx.answerCallbackQuery();
});

// Delete all: confirmed
feature.callbackQuery("privacy:deleteall:confirm", logHandle("callback-privacy-deleteall-confirm"), async (ctx) => {
  const userId = ctx.from.id;

  const connection = ctx.session.connection;
  log(ctx.api, connection?.logsId, { type: "privacy.deleted" }, {
    get: () => db.getConnectionConfig(connection!.id).then(cfg => cfg.log_excluded_events)
  });

  ctx.session.connection = null;
  ctx.session.connectionMeta = null;
  await db.deleteUserData(userId);

  await ctx.editMessageText(ctx.t("privacy.deleteall-success"));
  await ctx.answerCallbackQuery();
});

export { composer as privacyFeature };
