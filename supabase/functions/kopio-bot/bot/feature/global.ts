/**
 * Global update handlers
 */
import { Composer } from "grammy";
import { Context } from "../context.ts";
import { logHandle } from "../helper/logging.ts";

const composer = new Composer<Context>();
const feature = composer.chatType("private");

// Cancel any pending action and overwrite the original message
feature.callbackQuery("g:cancel", logHandle("callback-cancel"), async (ctx) => {
  await ctx.editMessageText(ctx.t("command.cancelled"));
  await ctx.answerCallbackQuery();
});

export { composer as globalFeature }