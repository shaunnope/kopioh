import { Composer, InlineKeyboard } from "grammy";
import type { Context, Conversation, ConversationContext } from "../context.ts";
import { logHandle } from "../helper/logging.ts";
import { sendContent } from "../helper/send_content.ts";
import type { ApprovedSubmission, LogEventType, PendingSubmission } from "../../database/index.ts";
import db from "../../database/index.ts";
import type { ConnectionInfo } from "../session.ts";
import { awaitTextMessage, detectContentType } from "../helper/content_type.ts";
import { type AuxActions, editPoll } from "./moderate.polls.ts";
import { log, userName } from "../log.ts";
import { isConnected } from "../helper/connection.ts";

const composer = new Composer<Context>();
const feature = composer.chatType("private");

async function validateIsModerator(ctx: Context, connection: ConnectionInfo | null) {
  if (!isConnected(ctx, connection)) return;

  const isMod = await db.isUserModerator(ctx.from!.id, connection!.id);
  if (!isMod) {
    await ctx.reply(ctx.t("moderate.not-moderator"))
    return false
  }
  return true
}

export async function requireModerator(ctx: Context, next: () => Promise<void>) {
  const connection = ctx.session.connection;
  if (!await validateIsModerator(ctx, connection))
    return

  return next()
}

/** Immediately post an approved submission, optionally from a named queue */
feature.command("post", logHandle("command-post"), requireModerator, async ctx => {
  const connection = ctx.session.connection!;
  const queueName = ctx.match?.trim() || null;

  const logPosted = (submission: ApprovedSubmission) => {
    log(ctx.api, connection.logsId, {
      type: "submission.posted",
      id: submission.id,
      moderatorName: userName(ctx.from!),
    }, { get: () => db.getConnectionConfig(connection.id).then(cfg => cfg.log_excluded_events) });
  }

  if (queueName) {
    const queues = await db.getQueuesForConnection(connection.id);
    const queue = queues.find(q => q.name.toLowerCase() === queueName.toLowerCase());
    if (!queue) {
      await ctx.reply(ctx.t("moderate.post-queue-not-found", { name: queueName }));
      return;
    }
    const submission = await db.dequeueFromQueue(queue.id);
    if (!submission) {
      await ctx.reply(ctx.t("moderate.no-approved"));
      return;
    }
    await sendContent(ctx.api, connection.broadcastId, submission.content);
    await db.updateLastPosted(queue.id);
    await ctx.reply(ctx.t("moderate.post-queue-success", { name: queue.name }));
    logPosted(submission)
    return;
  }

  const submission = await db.dequeueApprovedSubmission(connection.broadcastId);
  if (!submission) {
    await ctx.reply(ctx.t("moderate.no-approved"));
    return;
  }

  await sendContent(ctx.api, connection.broadcastId, submission.content);
  await ctx.reply(ctx.t("moderate.post-success"));

  logPosted(submission)
})

/** Shortcut for reviewing */
feature.command("review", logHandle("command-review"), requireModerator, async (ctx) => {
  await ctx.conversation.enter("moderateConvo");
});

feature.command("unwarn", logHandle("command-unwarn"), requireModerator, async (ctx) => {
  const arg = ctx.match?.trim();
  const userId = arg ? parseInt(arg, 10) : NaN;
  if (!arg || isNaN(userId)) {
    await ctx.reply(ctx.t("warn.unwarn-invalid-id"));
    return;
  }
  const connection = ctx.session.connection!;
  const removed = await db.removeWarnings(userId, connection.broadcastId, 1);
  if (removed === 0) {
    await ctx.reply(ctx.t("warn.remove-none"));
    return;
  }
  const remaining = await db.getUserWarningCount(userId, connection.broadcastId);
  await ctx.reply(ctx.t("warn.remove-success", { removed, remaining }));
});

feature.command("clearwarns", logHandle("command-clearwarns"), requireModerator, async (ctx) => {
  const arg = ctx.match?.trim();
  const userId = arg ? parseInt(arg, 10) : NaN;
  if (!arg || isNaN(userId)) {
    await ctx.reply(ctx.t("warn.clearwarns-invalid-id"));
    return;
  }
  const connection = ctx.session.connection!;
  const removed = await db.removeWarnings(userId, connection.broadcastId);
  if (removed === 0) {
    await ctx.reply(ctx.t("warn.remove-none"));
    return;
  }
  await ctx.reply(ctx.t("warn.remove-success", { removed, remaining: 0 }));
});

export { composer as moderateFeature };

//--- Convo definition ---//

/**
 * Conversation for moderators to review pending submissions.
 *
 * Expects `ctx.session.connection` to be set before entering.
 * Loops through pending submissions until the queue is empty or the moderator exits.
 * The value is kept so subsequent actions target the same group until a new deeplink is used.
 */
export async function moderateConvo(
  conversation: Conversation,
  ctx0: ConversationContext,
) {
  // TODO: tweak validateIsModerator to work in conversations
  const maybeConnection = await conversation.external((ctx) => ctx.session.connection);

  if (!isConnected(ctx0, maybeConnection)) return;
  const connection = maybeConnection!

  const moderatorId = ctx0.from!.id;
  const broadcastId = connection.broadcastId;

  const isMod = await conversation.external(() => db.isUserModerator(moderatorId, connection.id));
  if (!isMod) {
    await ctx0.reply(ctx0.t("moderate.not-moderator"));
    return;
  }

  const count = await conversation.external(() => db.countPendingSubmissions(broadcastId));
  if (count === 0) {
    await ctx0.reply(ctx0.t("moderate.no-pending"));
    return;
  }

  await ctx0.reply(ctx0.t("moderate.pending_count", { count }));

  // moderation loop: repeat until no more pending submissions
  while (true) {
    const submission = await conversation.external(() => db.claimNextSubmission(broadcastId));

    if (!submission) {
      await ctx0.reply(ctx0.t("moderate.done"));
      return;
    }

    const contentMsg = await sendContent(ctx0.api, ctx0.chat!.id, submission.content);
    const metaText = ctx0.t("moderate.submission-meta", {
      date: new Date(submission.created_at).toLocaleString("en-GB", {
        day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit", timeZone: "UTC",
      }) + " UTC",
    });

    const contentType = detectContentType(submission.content);
    const keyboard = new InlineKeyboard()
      .text(ctx0.t("moderate.approve-button"), "mod:approve")
      .text(ctx0.t("moderate.reject-button"), "mod:reject")
      .text(ctx0.t("warn.reject-warn-button"), "mod:reject-warn")
      .row();
    if (contentType !== "sticker") {
      keyboard.text(ctx0.t("moderate.edit-button"), "mod:edit");
    }
    keyboard
      .text(ctx0.t("moderate.skip-button"), "mod:skip")
      .row()
      .text(ctx0.t("moderate.exit-button"), "mod:exit");

    const reviewMsg = await ctx0.reply(metaText, { reply_markup: keyboard });

    const cleanup : AuxActions = {
      deleteContentMsg: () => ctx0.api.deleteMessage(contentMsg.chat.id, contentMsg.message_id).catch(() => {}),
      deleteReviewMsg: () => ctx0.api.deleteMessage(reviewMsg.chat.id, reviewMsg.message_id).catch(() => {}),
      appendToReviewMsg: async (status: string) => {
        await ctx0.api.editMessageText(reviewMsg.chat.id, reviewMsg.message_id, metaText + "\n\n" + status);
      },
      clearReviewMarkup: () => ctx0.api.editMessageReplyMarkup(reviewMsg.chat.id, reviewMsg.message_id)
    }

    const actionCtx = await conversation.waitForCallbackQuery(/^mod:(approve|reject|reject-warn|edit|skip|exit)$/);
    await actionCtx.answerCallbackQuery();
    const action = actionCtx.callbackQuery.data.split(":")[1];
    if (action === "exit") {
      await conversation.external(() => db.unclaimSubmission(submission.id));
      await Promise.all([cleanup.deleteContentMsg(), cleanup.appendToReviewMsg(ctx0.t("moderate.exited"))]);
      return;
    }

    const cfg = await conversation.external(() => db.getConnectionConfig(connection.id))
    switch (action)  {
      case "approve": {
        const queueName = await assignQueue(ctx0, conversation, cleanup, submission, moderatorId, connection.id);
        await Promise.all([cleanup.deleteContentMsg(), cleanup.appendToReviewMsg(ctx0.t("moderate.approved"))]);
        log(ctx0.api, connection.logsId, {
          type: "submission.approved",
          id: submission.id,
          moderatorName: userName(actionCtx.from),
          queueName,
          edited: false
        }, { excluded: cfg.log_excluded_events });
        continue;
      }
      case "reject":
        await conversation.external(() => db.rejectSubmission(submission.id, moderatorId));
        await Promise.all([cleanup.deleteContentMsg(), cleanup.appendToReviewMsg(ctx0.t("moderate.rejected"))]);
        log(ctx0.api, connection.logsId, {
          type: "submission.rejected",
          id: submission.id,
          moderatorName: userName(actionCtx.from),
        }, { excluded: cfg.log_excluded_events });
        continue;
      case "reject-warn": {
        // Ask the moderator for a reason (optional).
        await cleanup.clearReviewMarkup();
        const skipKb = new InlineKeyboard().text(ctx0.t("warn.skip-reason-button"), "mod:skip-reason");
        const reasonPromptMsg = await ctx0.reply(ctx0.t("warn.reason-prompt"), { reply_markup: skipKb });

        let reason: string | null = null;
        while (true) {
          const next = await conversation.wait();
          if (next.callbackQuery) {
            await next.answerCallbackQuery();
            if (next.callbackQuery.data === "mod:skip-reason") break;
            continue;
          }
          if (next.message?.text && !next.message.text.startsWith("/")) {
            reason = next.message.text;
            break;
          }
        }

        await ctx0.api.deleteMessage(reasonPromptMsg.chat.id, reasonPromptMsg.message_id).catch(() => {});

        const result = await conversation.external(() => db.issueWarning(
          submission.created_by, 
          connection.broadcastId, 
          submission.id, 
          reason, 
          {
            warnThresholdTemp: cfg.warn_threshold_temp,
            warnThresholdPerm: cfg.warn_threshold_perm,
            tempBanDays: cfg.temp_ban_days,
          }
        ));
        await conversation.external(() => db.rejectSubmission(submission.id, moderatorId))

        // Notify submitter via DM; silently ignore if they haven't started the bot.
        const noReason = ctx0.t("warn.notify-no-reason");
        const displayReason = reason ?? noReason;
        const dateOpts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" };
        if (result.banned) {
          if (result.permanent) {
            ctx0.api.sendMessage(submission.created_by, ctx0.t("warn.notify-perm", { count: result.count, reason: displayReason })).catch(() => {});
          } else {
            ctx0.api.sendMessage(submission.created_by, ctx0.t("warn.notify-temp", {
              count: result.count,
              date: result.expiresAt!.toLocaleDateString("en-GB", dateOpts),
              reason: displayReason,
            })).catch(() => {});
          }
        } else {
          ctx0.api.sendMessage(submission.created_by, ctx0.t("warn.notify-issued", {
            count: result.count,
            threshold: cfg.warn_threshold_temp,
            reason: displayReason,
          })).catch(() => {});
        }

        const warnLine = result.banned
          ? (result.permanent
            ? ctx0.t("warn.banned-perm", { count: result.count })
            : ctx0.t("warn.banned-temp", {
                count: result.count,
                date: result.expiresAt!.toLocaleDateString("en-GB", dateOpts),
              }))
          : ctx0.t("warn.issued", { count: result.count, threshold: cfg.warn_threshold_temp });
        await Promise.all([
          cleanup.deleteContentMsg(),
          cleanup.appendToReviewMsg(ctx0.t("moderate.rejected") + "\n" + warnLine),
        ]);
        log(ctx0.api, connection.logsId, {
          type: "submission.rejected",
          id: submission.id,
          moderatorName: userName(actionCtx.from),
        }, { excluded: cfg.log_excluded_events });
        continue;
      }
      case "skip":
        // TODO: does not work yet. stuck on same submission
        await conversation.external(() => db.unclaimSubmission(submission.id));
        await Promise.all([cleanup.deleteContentMsg(), cleanup.appendToReviewMsg(ctx0.t("moderate.skipped"))]);
        continue;
      case "edit":
        await editSubmission(
          actionCtx, conversation, submission, moderatorId, cleanup,
          connection.logsId, cfg.log_excluded_events, userName(actionCtx.from),
          connection.id,
        )
    }
  }
}

async function editSubmission(
  ctx0: ConversationContext,
  conversation: Conversation,
  submission: PendingSubmission,
  moderatorId: number,
  aux: AuxActions,
  logsId: number | null,
  excludedEvents: LogEventType[],
  moderatorName: string,
  connectionId: string,
) {
  await aux.clearReviewMarkup();

  const contentType = detectContentType(submission.content);

  if (contentType === "poll") {
    const assignQueueFn = (approvalFn?: () => Promise<void>) =>
      assignQueue(ctx0, conversation, aux, submission, moderatorId, connectionId, approvalFn);
    await editPoll(ctx0, conversation, submission, moderatorId, aux, assignQueueFn, logsId, excludedEvents, moderatorName);
    return;
  }

  const isCaptioned = (["photo", "video", "audio", "voice", "animation", "document"] as string[]).includes(contentType);
  const promptKey = isCaptioned ? "moderate-edit.prompt_caption" : "moderate-edit.prompt";

  const editCancelKeyboard = new InlineKeyboard().text(ctx0.t("command.cancel"), "mod:edit:cancel");
  const editPromptMsg = await ctx0.reply(ctx0.t(promptKey), { reply_markup: editCancelKeyboard });

  // Show current caption for captioned media so the moderator can see what they're replacing
  let prefillMsg: { chat: { id: number }; message_id: number } | undefined;
  if (isCaptioned) {
    const caption = submission.content.caption as string | undefined;
    if (caption) prefillMsg = await ctx0.reply(caption);
  }

  const cleanup = (statusKey?: string) => Promise.all([
    aux.deleteContentMsg(),
    aux.deleteReviewMsg(),
    prefillMsg && ctx0.api.deleteMessage(prefillMsg.chat.id, prefillMsg.message_id).catch(() => {}),
    statusKey
      ? ctx0.api.editMessageText(editPromptMsg.chat.id, editPromptMsg.message_id, ctx0.t(statusKey))
      : ctx0.api.deleteMessage(editPromptMsg.chat.id, editPromptMsg.message_id).catch(() => {}),
  ]);

  const newText = await awaitTextMessage(conversation, "mod:edit:cancel")
  if (!newText) {
    await cleanup("moderate-edit.cancelled");
    await conversation.external(() => db.unclaimSubmission(submission.id));
    return
  }

  const newContent = isCaptioned
    ? { 
      ...submission.content, 
      caption: newText.text === "-" 
        ? undefined 
        : newText.text, 
      caption_entities: newText.entities
    }
    : {
      ...submission.content,
      ...newText
    };

  const confirmKeyboard = new InlineKeyboard()
    .text(ctx0.t("moderate-edit.confirm-button"), "mod:edit_confirm")
    .text(ctx0.t("command.cancel"), "mod:edit_cancel");

  await ctx0.reply(ctx0.t("moderate-edit.confirm-prompt"), { reply_markup: confirmKeyboard });

  const confirmCtx = await conversation.waitForCallbackQuery(/^mod:edit_(confirm|cancel)$/);
  await confirmCtx.answerCallbackQuery();

  if (confirmCtx.callbackQuery.data === "mod:edit_cancel") {
    await conversation.external(() => db.unclaimSubmission(submission.id));
    await Promise.all([cleanup(), confirmCtx.editMessageText(ctx0.t("moderate-edit.cancelled"))]);
    return;
  }

  // TODO: determine whether content was actually modified
  await conversation.external(() =>
    db.editAndApproveSubmission(submission.id, moderatorId, newContent)
  );
  await Promise.all([
    cleanup(),
    confirmCtx.editMessageText(ctx0.t("moderate-edit.and-approved")),
  ]);
  log(ctx0.api, logsId, {
    type: "submission.approved",
    id: submission.id,
    moderatorName,
    queueName: null,
    edited: true
  }, { excluded: excludedEvents });
}

async function assignQueue(
  ctx0: ConversationContext,
  conversation: Conversation,
  cleanup: AuxActions,
  submission: PendingSubmission,
  moderatorId: number,
  connectionId: string,
  approvalFn?: () => Promise<void>,
): Promise<string | null> {
  const defaultApproval = () => db.approveSubmission(submission.id, moderatorId);
  const queues = await conversation.external(() => db.getQueuesForConnection(connectionId));
  if (queues.length === 0) {
    await conversation.external(approvalFn ?? defaultApproval);
    return null;
  }

  await cleanup.clearReviewMarkup();
  const queueKb = new InlineKeyboard();
  for (const q of queues) {
    // TODO: evaluate if callback data can fit queue UUID.
    queueKb.text(q.name, `mod:queue:${q.id}`).row();
  }
  queueKb.text(ctx0.t("queue.no-queue-button"), "mod:queue:none");
  const queueMsg = await ctx0.reply(ctx0.t("queue.select-prompt"), { reply_markup: queueKb });
  const queueCtx = await conversation.waitForCallbackQuery(/^mod:queue:/);
  await queueCtx.answerCallbackQuery();
  const queueId = queueCtx.callbackQuery.data.slice("mod:queue:".length);
  const selectedQueue = queues.find(q => q.id === queueId);
  await ctx0.api.deleteMessage(queueMsg.chat.id, queueMsg.message_id).catch(() => {});
  await conversation.external(approvalFn ?? defaultApproval);
  if (queueId !== "none") {
    await conversation.external(() => db.assignSubmissionToQueue(submission.id, queueId));
    await conversation.external(() => db.clearLowAlertIfAboveThreshold(queueId));
    return selectedQueue?.name ?? null;
  }
  return null;
}