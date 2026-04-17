import { Composer, InlineKeyboard } from "grammy";
import { Context } from "../context.ts";
import { logHandle } from "../helper/logging.ts";
import { TranslateFunction } from "grammy_i18n";
import { FormattedString } from "grammy_parse_mode";

const composer = new Composer<Context>();

const feature = composer.chatType("private");
const groupFeature = composer.chatType(["group", "supergroup"]);

function mainKeyboard(ctx: Context) {
  return new InlineKeyboard()
    .text(ctx.t("help-submit"),   "help:section:submit")
    .text(ctx.t("help-moderate"), "help:section:moderate")
    .row()
    .text(ctx.t("help-queues"),   "help:section:queues")
    .text(ctx.t("help-privacy"),  "help:section:privacy");
}

function backKeyboard(ctx: Context) {
  return new InlineKeyboard().text(ctx.t("help.back-button"), "help:back");
}

function helpText(section: string, t: TranslateFunction) {
  return FormattedString.b(t(`help-${section}`)).plain("\n\n").plain(t(`help-${section}.desc`))
}


export async function showHelpMenu(ctx: Context) {
  await ctx.reply(ctx.t("help-intro"), { reply_markup: mainKeyboard(ctx) });
}

feature.command("help", logHandle("command-help"), async (ctx) => {
  await showHelpMenu(ctx);
});

feature.callbackQuery(/^help:section:(submit|moderate|queues|privacy)$/, logHandle("callback-help-section"), async (ctx) => {
  await ctx.answerCallbackQuery();
  const section = ctx.callbackQuery.data.split(":")[2] as "submit" | "moderate" | "queues" | "privacy";
  const text = helpText(section, ctx.t)
  await ctx.editMessageText(text.text, { entities: text.entities, reply_markup: backKeyboard(ctx) });
});

feature.callbackQuery("help:back", logHandle("callback-help-back"), async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(ctx.t("help-intro"), { reply_markup: mainKeyboard(ctx) });
});

groupFeature.command("help", logHandle("command-help-group"), async (ctx) => {
  const startUrl = `https://t.me/${ctx.me.username}?start=help`;
  await ctx.reply(ctx.t("help.group-redirect"), {
    reply_markup: new InlineKeyboard().url(ctx.t("help.group-redirect-button"), startUrl),
  });
});

export { composer as helpFeature };
