import { Composer, InlineKeyboard } from "grammy";
import { Context, Conversation, ConversationContext } from "../context.ts";
import { logHandle } from "../helper/logging.ts";
import db, { type PendingSubmission } from "../../database/index.ts";

const composer = new Composer<Context>();
const feature = composer.chatType("private");

/**
 * Build a text preview of a submission's content for display in review.
 */
function formatPreview(submission: PendingSubmission, ctx: ConversationContext): string {
  const c = submission.content;

  if (c.poll) {
    const poll = c.poll as Record<string, unknown>;
    return ctx.t("moderate.submission_poll", { question: String(poll.question ?? "?") });
  }

  if (c.text) {
    return ctx.t("moderate.submission_text", { text: String(c.text) });
  }

  const mediaType = c.photo
    ? "Photo"
    : c.video
    ? "Video"
    : c.audio
    ? "Audio"
    : c.voice
    ? "Voice"
    : c.document
    ? "Document"
    : c.animation
    ? "GIF"
    : c.sticker
    ? "Sticker"
    : "Media";

  if (c.caption) {
    return ctx.t("moderate.submission_media", { type: mediaType, caption: String(c.caption) });
  }
  return ctx.t("moderate.submission_no_caption", { type: mediaType });
}

/**
 * Send approved submission content to a channel, dispatching on content type.
 */
function sendApprovedSubmission(api: ReturnType<typeof ctx_api>, chatId: number, content: Record<string, unknown>) {
  const c = content;
  if (c.photo) {
    const sizes = c.photo as { file_id: string }[];
    return api.sendPhoto(chatId, sizes[sizes.length - 1].file_id, {
      caption: c.caption as string | undefined,
      caption_entities: c.caption_entities as never,
    });
  }
  if (c.video) {
    return api.sendVideo(chatId, (c.video as { file_id: string }).file_id, {
      caption: c.caption as string | undefined,
      caption_entities: c.caption_entities as never,
    });
  }
  if (c.document) {
    return api.sendDocument(chatId, (c.document as { file_id: string }).file_id, {
      caption: c.caption as string | undefined,
      caption_entities: c.caption_entities as never,
    });
  }
  if (c.audio) {
    return api.sendAudio(chatId, (c.audio as { file_id: string }).file_id, {
      caption: c.caption as string | undefined,
      caption_entities: c.caption_entities as never,
    });
  }
  if (c.voice) {
    return api.sendVoice(chatId, (c.voice as { file_id: string }).file_id, {
      caption: c.caption as string | undefined,
      caption_entities: c.caption_entities as never,
    });
  }
  if (c.animation) {
    return api.sendAnimation(chatId, (c.animation as { file_id: string }).file_id, {
      caption: c.caption as string | undefined,
      caption_entities: c.caption_entities as never,
    });
  }
  if (c.sticker) {
    return api.sendSticker(chatId, (c.sticker as { file_id: string }).file_id);
  }
  if (c.poll) {
    const poll = c.poll as {
      question: string;
      options: { text: string }[];
      type?: "regular" | "quiz";
      allows_multiple_answers?: boolean;
      correct_option_id?: number;
      explanation?: string;
    };
    
    return api.sendPoll(chatId, poll.question, poll.options, {
      type: poll.type,
      allows_multiple_answers: poll.allows_multiple_answers,
      correct_option_ids: poll.correct_option_id != null ? [poll.correct_option_id] : undefined,
      explanation: poll.explanation,
      is_anonymous: true, // Cannot send non-anonymous polls to channel
    });
  }
  // Default: text message
  return api.sendMessage(chatId, c.text as string, {
    entities: c.entities as never,
  });
}

// Type helper — never called, just used to infer ctx.api type
declare function ctx_api(): Context["api"];

feature.command("post", logHandle("command-post"), async ctx => {
  const connection = ctx.session.connection;
  if (!connection) {
    await ctx.reply(ctx.t("submit.no_connection"));
    return;
  }

  const isMod = await db.isUserModerator(ctx.from.id, connection.id);
  if (!isMod) {
    await ctx.reply(ctx.t("moderate.not_moderator"));
    return;
  }

  const submission = await db.dequeueApprovedSubmission(connection.broadcastId);
  if (!submission) {
    await ctx.reply(ctx.t("moderate.no_approved"));
    return;
  }

  await sendApprovedSubmission(ctx.api, connection.broadcastId, submission.content);
  await ctx.reply(ctx.t("moderate.post_success"));
})

/**
 * Conversation for moderators to review pending submissions.
 *
 * Expects `ctx.session.pendingBroadcastId` to be set before entering.
 * Loops through pending submissions until the queue is empty or the moderator exits.
 * The value is kept so subsequent actions target the same group until a new deeplink is used.
 */
export async function moderateConvo(
  conversation: Conversation,
  ctx0: ConversationContext,
) {
  const broadcastId = await conversation.external((ctx) => ctx.session.connection?.broadcastId ?? null);

  if (!broadcastId) {
    await ctx0.reply(ctx0.t("submit.no_connection"));
    return;
  }

  const moderatorId = ctx0.from!.id;

  const count = await conversation.external(() => db.countPendingSubmissions(broadcastId));
  if (count === 0) {
    await ctx0.reply(ctx0.t("moderate.no_pending"));
    return;
  }

  await ctx0.reply(ctx0.t("moderate.pending_count", { count }));

  while (true) {
    const submission = await conversation.external(() => db.claimNextSubmission(broadcastId));

    if (!submission) {
      await ctx0.reply(ctx0.t("moderate.done"));
      return;
    }

    const preview = formatPreview(submission, ctx0);
    const keyboard = new InlineKeyboard()
      .text(ctx0.t("moderate.approve_button"), "mod:approve")
      .text(ctx0.t("moderate.reject_button"), "mod:reject")
      .row()
      .text(ctx0.t("moderate.edit_button"), "mod:edit")
      .text(ctx0.t("moderate.skip_button"), "mod:skip")
      .row()
      .text(ctx0.t("moderate.exit_button"), "mod:exit");

    const reviewMsg = await ctx0.reply(preview, { reply_markup: keyboard });
    const appendToReviewMsg = async (message: string) => {
      message = preview + "\n\n" + message
      await ctx0.api.editMessageText(reviewMsg.chat.id, reviewMsg.message_id, message);
    }
    const clearReviewMarkup = () => ctx0.api.editMessageReplyMarkup(reviewMsg.chat.id, reviewMsg.message_id)


    const actionCtx = await conversation.waitForCallbackQuery(/^mod:(approve|reject|edit|skip|exit)$/);
    await actionCtx.answerCallbackQuery();
    const action = actionCtx.callbackQuery.data.split(":")[1];

    if (action === "exit") {
      await conversation.external(() => db.unclaimSubmission(submission.id));
      await appendToReviewMsg(ctx0.t("moderate.exited"));
      return;
    }

    if (action === "approve") {
      await conversation.external(() => db.approveSubmission(submission.id, moderatorId));
      await appendToReviewMsg(ctx0.t("moderate.approved"));
      continue;
    }

    if (action === "reject") {
      await conversation.external(() => db.rejectSubmission(submission.id, moderatorId));
      await appendToReviewMsg(ctx0.t("moderate.rejected"));
      continue;
    }

    if (action === "skip") {
      await conversation.external(() => db.unclaimSubmission(submission.id));
      await appendToReviewMsg(ctx0.t("moderate.skipped"));
      continue;
    }

    if (action === "edit") {
      await clearReviewMarkup()
      await actionCtx.reply(ctx0.t("moderate.edit_prompt"));

      let editCtx = await conversation.waitFor("message");
      while (editCtx.message.text?.startsWith("/")) {
        await editCtx.reply(ctx0.t("submit.send_content"));
        editCtx = await conversation.waitFor("message");
      }

      const msg = editCtx.message;
      const newContent = {
        text: msg.text,
        entities: msg.entities,
        caption: msg.caption,
        caption_entities: msg.caption_entities,
        photo: msg.photo,
        video: msg.video,
        document: msg.document,
        audio: msg.audio,
        voice: msg.voice,
        animation: msg.animation,
        sticker: msg.sticker,
        poll: msg.poll,
      };

      const editKeyboard = new InlineKeyboard()
        .text(ctx0.t("moderate.edit_confirm_button"), "mod:edit_confirm")
        .text(ctx0.t("moderate.edit_cancel_button"), "mod:edit_cancel");

      await editCtx.reply(ctx0.t("moderate.edit_confirm_prompt"), { reply_markup: editKeyboard });

      const confirmCtx = await conversation.waitForCallbackQuery(/^mod:edit_(confirm|cancel)$/);
      await confirmCtx.answerCallbackQuery();

      if (confirmCtx.callbackQuery.data === "mod:edit_cancel") {
        await conversation.external(() => db.unclaimSubmission(submission.id));
        await confirmCtx.editMessageText(ctx0.t("moderate.edit_cancelled"));
        continue;
      }

      await conversation.external(() =>
        db.editAndApproveSubmission(submission.id, moderatorId, newContent)
      );
      await confirmCtx.editMessageText(ctx0.t("moderate.edited_and_approved"));
      continue;
    }
  }
}

export { composer as moderateFeature };
