import { Composer, InlineKeyboard } from "grammy";
import { Context, Conversation, ConversationContext } from "../context.ts";
import { logHandle } from "../helper/logging.ts";
import db from "../../database/index.ts";

const composer = new Composer<Context>();
const feature = composer.chatType("private");

/**
 * Conversation for submitting a message or poll via private chat.
 *
 * Expects `ctx.session.pendingBroadcastId` to be set before entering.
 * Reads and clears it at the start of the conversation.
 */
export async function submitConvo(
  conversation: Conversation,
  ctx0: ConversationContext,
) {
  // Read and immediately clear the pending broadcast target from session.
  const broadcastId = await conversation.external((ctx) => {
    const id = ctx.session.pendingBroadcastId;
    ctx.session.pendingBroadcastId = null;
    return id;
  });

  if (!broadcastId) {
    await ctx0.reply(ctx0.t("submit.no_connection"));
    return;
  }

  await ctx0.reply(ctx0.t("submit.prompt"));

  // Wait for content, re-prompting if the user sends a command instead.
  let contentCtx = await conversation.waitFor("message");
  while (contentCtx.message.text?.startsWith("/")) {
    await contentCtx.reply(contentCtx.t("submit.send_content"));
    contentCtx = await conversation.waitFor("message");
  }

  const message = contentCtx.message;
  const contentType = message.poll ? "poll" : "message";

  // Extract only serialisable Telegram content fields.
  const content = {
    text: message.text,
    entities: message.entities,
    caption: message.caption,
    caption_entities: message.caption_entities,
    photo: message.photo,
    video: message.video,
    document: message.document,
    audio: message.audio,
    voice: message.voice,
    animation: message.animation,
    sticker: message.sticker,
    poll: message.poll,
  };

  const keyboard = new InlineKeyboard()
    .text(ctx0.t("submit.confirm_button"), "submit:confirm")
    .text(ctx0.t("submit.cancel_button"), "submit:cancel");

  await contentCtx.reply(ctx0.t("submit.confirm_prompt"), { reply_markup: keyboard });

  const confirmCtx = await conversation.waitForCallbackQuery(/^submit:(confirm|cancel)$/);
  await confirmCtx.answerCallbackQuery();

  if (confirmCtx.callbackQuery.data === "submit:cancel") {
    await confirmCtx.editMessageText(ctx0.t("submit.cancelled"));
    return;
  }

  const userId = confirmCtx.from.id;

  await conversation.external(async _ => {
    await db.createSubmission(broadcastId, userId, content, contentType);
  });

  await confirmCtx.editMessageText(ctx0.t("submit.success"));
}

feature.on("message", logHandle("submit-convo-active"));

export { composer as submitFeature };
