import { Composer, InlineKeyboard } from "grammy";
import { Context, Conversation, ConversationContext } from "../context.ts";
import { logHandle } from "../helper/logging.ts";
import { detectContentType, extractPoll } from "../helper/content_type.ts";
import db from "../../database/index.ts";
import { log, userName } from "../log.ts";
import { isConnected } from "../helper/connection.ts";

const composer = new Composer<Context>();
const feature = composer.chatType("private");

/**
 * Conversation for submitting a message or poll via private chat.
 *
 * Expects `ctx.session.pendingBroadcastId` to be set before entering.
 * The value is kept so subsequent actions target the same group until a new deeplink is used.
 */
export async function submitConvo(
  conversation: Conversation,
  ctx0: ConversationContext,
) {
  const connection = await conversation.external((ctx) => ctx.session.connection);
  if (!isConnected(ctx0, connection) || !connection) return;
  
  const userId = ctx0.from!.id;
  const isBanned = await conversation.external(() => db.isUserBanned(userId, connection.broadcastId));
  if (isBanned) {
    const banStatus = await conversation.external(() => db.getBanStatus(userId, connection.broadcastId));
    if (banStatus?.expiresAt) {
      await ctx0.reply(ctx0.t("warn.submit-banned-temp", {
        date: banStatus.expiresAt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }),
      }));
    } else {
      await ctx0.reply(ctx0.t("warn.submit-banned-perm"));
    }
    return;
  }

  const connectionConfig = await conversation.external(() => db.getConnectionConfig(connection.id));

  const cancelKeyboard = new InlineKeyboard().text(ctx0.t("command.cancel"), "submit:cancel");
  const promptMsg = await ctx0.reply(ctx0.t("submit.prompt"), { reply_markup: cancelKeyboard });

  // Wait for content, handling cancel, command re-prompts, and disallowed types.
  let contentCtx: ConversationContext | undefined;
  while (!contentCtx) {
    const nextCtx = await conversation.wait();

    if (nextCtx.callbackQuery?.data === "submit:cancel") {
      await nextCtx.answerCallbackQuery();
      await ctx0.api.editMessageText(promptMsg.chat.id, promptMsg.message_id, ctx0.t("submit.cancelled"));
      return;
    }

    if (!nextCtx.message) continue;

    if (nextCtx.message.text?.startsWith("/")) {
      await nextCtx.reply(nextCtx.t("submit.send-content"));
      continue;
    }

    if (!connectionConfig.allowed_types.includes(detectContentType(nextCtx.message as never))) {
      await nextCtx.reply(nextCtx.t("submit.type-not-allowed"));
      continue;
    }

    contentCtx = nextCtx;
  }

  const keyboard = new InlineKeyboard()
    .text(ctx0.t("submit.confirm-button"), "submit:confirm")
    .text(ctx0.t("command.cancel"), "submit:cancel");

  await contentCtx.reply(ctx0.t("submit.confirm-prompt"), { reply_markup: keyboard });

  const confirmCtx = await conversation.waitForCallbackQuery(/^submit:(confirm|cancel)$/);
  await confirmCtx.answerCallbackQuery();

  if (confirmCtx.callbackQuery.data === "submit:cancel") {
    await confirmCtx.editMessageText(ctx0.t("submit.cancelled"));
    return;
  }
  await ctx0.api.editMessageText(promptMsg.chat.id, promptMsg.message_id, promptMsg.text, { entities: promptMsg.entities })

  const message = contentCtx!.message!;
  // Extract only relevant serialisable fields from a Message object.
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
    poll: message.poll ? extractPoll(message.poll) : undefined,
  };

  const submissionId = await conversation.external(async _ => {
    return await db.createSubmission(connection.broadcastId, userId, content);
  });

  if (submissionId) {
    log(ctx0.api, connection.logsId, {
      type: "submission.new",
      id: submissionId,
      contentType: detectContentType(message as never),
    }, { excluded: connectionConfig.log_excluded_events});
  }

  await confirmCtx.editMessageText(ctx0.t("submit.success"));
}

feature.command("submit", logHandle("command-submit"), async (ctx) => {
  await ctx.conversation.enter("submitConvo");
});

feature.callbackQuery(/^submit:(confirm|cancel)$/, logHandle("callback-submit-stale"), async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageReplyMarkup();
});

export { composer as submitFeature };
