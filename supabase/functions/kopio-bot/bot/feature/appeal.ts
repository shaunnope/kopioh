import { Composer, InlineKeyboard } from "grammy";
import { FormattedString } from "grammy_parse_mode";
import type { TranslateFunction } from "grammy_i18n";
import type { Context, Conversation, ConversationContext } from "../context.ts";
import { logHandle } from "../helper/logging.ts";
import db from "../../database/index.ts";
import type { Appeal } from "../../database/index.ts";
import { config } from "../../config.ts";
import { resolveDisplayName } from "./userinfo.ts";

const composer = new Composer<Context>();
const feature = composer.chatType("private");

function makeAppealInfoCard(
  appeal: Appeal,
  displayName: string,
  t: TranslateFunction,
): FormattedString {
  const noReason = t("warn.notify-no-reason");
  return FormattedString.b(t("warn-appeal-info"))
    .plain(" ")
    .link(displayName, `tg://user?id=${appeal.userId}`)
    .plain(" [")
    .code(String(appeal.userId))
    .plain("]\n")
    .b(t("warn-appeal-info.warning-label")).plain(" ").plain(appeal.warningReason ?? noReason).plain("\n")
    .b(t("warn-appeal-info.appeal-label")).plain(" ").plain(appeal.reason);
}

// User clicks Appeal on a warning notification
feature.callbackQuery(/^warn:appeal:/, logHandle("callback-warn-appeal"), async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.conversation.enter("appealConvo");
});

export async function appealConvo(conversation: Conversation, ctx0: ConversationContext) {
  const warningId = ctx0.callbackQuery?.data?.split(":")[2];
  if (!warningId) return;

  // Check before prompting — avoids unnecessary input if already appealed
  const existing = await conversation.external(() => db.getAppeal(warningId));
  if (existing) {
    await ctx0.reply(ctx0.t("warn-appeal.already"));
    return;
  }

  const promptMsg = await ctx0.reply(ctx0.t("warn-appeal.prompt"));

  let reason: string | null = null;
  while (true) {
    const next = await conversation.wait();
    if (next.message?.text && !next.message.text.startsWith("/")) {
      reason = next.message.text;
      break;
    }
  }

  await ctx0.api.deleteMessage(promptMsg.chat.id, promptMsg.message_id).catch(() => {});

  const appealId = await conversation.external(() =>
    db.createAppeal(warningId, ctx0.from!.id, reason!)
  );

  if (!appealId) {
    await ctx0.reply(ctx0.t("warn-appeal.already"));
    return;
  }

  const appeal = await conversation.external(() => db.getAppeal(appealId));
  if (!appeal) return;

  await ctx0.reply(ctx0.t("warn-appeal.sent"));

  const displayName = await resolveDisplayName(ctx0, appeal.userId);
  const card = makeAppealInfoCard(appeal, displayName, ctx0.t);
  const ownerKeyboard = new InlineKeyboard()
    .text(ctx0.t("warn-appeal-info.lift-button"), `warn-appeal:lift:${appealId}`)
    .text(ctx0.t("warn-appeal-info.reject-button"), `warn-appeal:reject:${appealId}`);

  await ctx0.api.sendMessage(config.BOT_OWNER_ID, card.text, {
    entities: card.entities,
    reply_markup: ownerKeyboard,
  }).catch(() => {});
}

// Owner: lift appeal
const ownerFeature = composer.filter((ctx) => ctx.from?.id === config.BOT_OWNER_ID);

ownerFeature.callbackQuery(/^warn-appeal:lift:/, logHandle("callback-warn-appeal-lift"), async (ctx) => {
  await ctx.answerCallbackQuery();
  const appealId = ctx.callbackQuery.data.split(":")[2];
  const result = await db.liftAppeal(appealId);
  if (!result) {
    await ctx.reply(ctx.t("warn-appeal-info.expired"));
    return;
  }
  await ctx.api.sendMessage(result.userId, ctx.t("warn-appeal.notify-lifted")).catch(() => {});
  await ctx.editMessageText(ctx.t("warn-appeal-info.lifted"));
});

// Owner: reject appeal → enter conversation to collect rejection reason
ownerFeature.callbackQuery(/^warn-appeal:reject:/, logHandle("callback-warn-appeal-reject"), async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.conversation.enter("rejectAppealConvo");
});

export async function rejectAppealConvo(conversation: Conversation, ctx0: ConversationContext) {
  const appealId = ctx0.callbackQuery?.data?.split(":")[2];
  if (!appealId) return;

  const promptMsg = await ctx0.reply(ctx0.t("warn-appeal-info.reject-prompt"));

  let rejectionReason: string | null = null;
  while (true) {
    const next = await conversation.wait();
    if (next.message?.text && !next.message.text.startsWith("/")) {
      rejectionReason = next.message.text;
      break;
    }
  }

  await ctx0.api.deleteMessage(promptMsg.chat.id, promptMsg.message_id).catch(() => {});

  const result = await conversation.external(() =>
    db.rejectAppeal(appealId, rejectionReason!)
  );

  if (!result) {
    await ctx0.reply(ctx0.t("warn-appeal-info.expired"));
    return;
  }

  await ctx0.api.sendMessage(
    result.userId,
    ctx0.t("warn-appeal.notify-rejected", { reason: rejectionReason! }),
  ).catch(() => {});
  await ctx0.reply(ctx0.t("warn-appeal-info.reject-success"));
}

export { composer as appealFeature };
