/**
 * A rework of the edit phase of the "moderate" convo
 */

import { InlineKeyboard } from "grammy";
import { Conversation, ConversationContext } from "../context.ts";
import db, { PendingSubmission } from "../../database/index.ts";
import type { LogEventType } from "../../database/index.ts";
import { fmt, FormattedString, TextWithEntities } from "grammy_parse_mode";
import { awaitTextMessage, PollFragment } from "../helper/content_type.ts";
import { log } from "../log.ts";

export interface AuxActions {
  deleteContentMsg: () => Promise<unknown>
  deleteReviewMsg: () => Promise<unknown>
  appendToReviewMsg: (status: string) => Promise<void>
  clearReviewMarkup: () => Promise<unknown>
}

interface PollDraft extends PollFragment {
  allows_revoting: boolean
}

const POLL_MIN_OPTIONS = 2
const POLL_MAX_OPTIONS = 12
const FIELD_CANCEL = "mod:poll:field_cancel"

const MAX_POLL_QN = 300
const MAX_POLL_DESC = 1024
const MAX_POLL_EXPL = 200
const MAX_POLL_EXPL_LF = 2

function pollSummary(ctx0: ConversationContext, d: PollDraft): FormattedString {
  let summary = FormattedString.b(`[${ctx0.t("content-poll.description")}]`)
  .plain("\n").concat(fmt`${d.description ?? "—"}`)
  .plain("\n\n").b(`[${ctx0.t("content-poll.question")}]`)
  .plain("\n").concat(fmt`${d.question}`)
  .plain("\n\n")

  if (d.type === "quiz") {
    summary = summary.b(`[${ctx0.t("content-poll.explanation")}]`)
    .plain("\n").concat(fmt`${d.explanation ?? "—"}`)
    .plain("\n\n")
  }

  summary = summary.b(`[${ctx0.t("content-poll.options")}]`).plain("\n")
  
  for (const opt of d.options) {
    summary = summary.concat(fmt`${opt}\n`)
  }

  summary = summary.plain("\n")
  .plain(ctx0.t(d.allows_multiple_answers ? 
    "moderate-edit-poll.summary-multiple" : 
    "moderate-edit-poll.summary-single"))

  return summary;
}

function pollKeyboard(ctx0: ConversationContext, d: PollDraft): InlineKeyboard {
  const kb = new InlineKeyboard()
    .text(ctx0.t("moderate-edit-poll.q-button"), "mod:poll:edit_question")
    .text(ctx0.t("moderate-edit-poll.desc-button"), "mod:poll:edit_description")
    .row()
    .text(ctx0.t("moderate-edit-poll.opts-button"), "mod:poll:edit_options");

  if (d.type === "quiz") {
    kb.text(ctx0.t("moderate-edit-poll.expl-button"), "mod:poll:edit_explanation");
  }

  kb.text(
    `${d.allows_multiple_answers ? "✅" : "✗"} ${ctx0.t("moderate-edit-poll.multi-label")}`,
    "mod:poll:toggle_multiple",
  );

  return kb
    .row()
    .text(ctx0.t("moderate.approve-button"), "mod:poll:approve")
    .text(ctx0.t("moderate.reject-button"), "mod:poll:reject")
    .row()
    .text(ctx0.t("moderate-edit-poll.discard-button"), "mod:poll:discard")
    .text(ctx0.t("command.cancel"), "mod:poll:cancel");
}


export async function editPoll(
  ctx0: ConversationContext,
  conversation: Conversation,
  submission: PendingSubmission,
  moderatorId: number,
  aux: AuxActions,
  assignQueueFn: (approvalFn?: () => Promise<void>) => Promise<string | null>,
  logsId: number | null,
  excludedEvents: LogEventType[],
  moderatorName: string,
): Promise<void> {
  const original = submission.content.poll as PollFragment;
  const draft: PollDraft = {
    ...original,
    allows_revoting: true
  };
  const initialJSON = JSON.stringify(draft);

  const summary = pollSummary(ctx0, draft)
  const summaryMsg = await ctx0.reply(summary.text, {
    entities: summary.entities,
    reply_markup: pollKeyboard(ctx0, draft),
  });

  const updateSummary = async () => {
    const summary = pollSummary(ctx0, draft)
    await ctx0.api.editMessageText(
      summaryMsg.chat.id, summaryMsg.message_id,
      summary.text,
      { 
        entities: summary.entities,
        reply_markup: pollKeyboard(ctx0, draft) 
      },
    ).catch(() => {});
  }
    

  const clearMainMarkup = () =>
    ctx0.api.editMessageReplyMarkup(summaryMsg.chat.id, summaryMsg.message_id).catch(() => {});

  const exitClean = (statusKey: string) => Promise.all([
    aux.deleteContentMsg(),
    aux.deleteReviewMsg(),
    ctx0.api.editMessageText(summaryMsg.chat.id, summaryMsg.message_id, ctx0.t(statusKey)).catch(() => {}),
  ]);

  /**
   * Prompt for a text message until success or cancellation.
   * On success, applies the received text with the provided callback function.
   */
  const editTextField = async (
    promptKey: string, 
    apply: (text: TextWithEntities) => void,
    validate?: (ctx: ConversationContext) => Promise<boolean>
  ) => {
    await clearMainMarkup();
    const cancelKb = new InlineKeyboard().text(ctx0.t("command.cancel"), FIELD_CANCEL);
    const prompt = await ctx0.reply(ctx0.t(promptKey), { reply_markup: cancelKb });
    const text = await awaitTextMessage(conversation, FIELD_CANCEL, validate);
    await ctx0.api.deleteMessage(prompt.chat.id, prompt.message_id).catch(() => {});
    if (text !== null) apply(text);
    await updateSummary();
  };

  const validateFieldLength = (limit: number, type: string) => {
    return async (ctx : ConversationContext) => {
      if (ctx.message!.text!.length > limit) {
        await ctx.reply(ctx.t(
          "moderate-edit-poll.field-too-long",
          { field: ctx.t(`content-poll.${type}`), limit: limit }
        ))
        return false
      }
      return true
    }
  }

  const validateQuestion = validateFieldLength(MAX_POLL_QN, "question")
  const validateDesc = validateFieldLength(MAX_POLL_DESC, "description")
  const validateExpln = validateFieldLength(MAX_POLL_EXPL, "explanation")

  while (true) {
    const actionCtx = await conversation.waitForCallbackQuery(
      /^mod:poll:(edit_question|edit_description|edit_explanation|edit_options|toggle_multiple|approve|reject|discard|cancel)$/,
    );
    await actionCtx.answerCallbackQuery();
    const action = actionCtx.callbackQuery.data.split(":")[2];

    switch (action) {
      case "edit_question":
        await editTextField(
          "moderate-edit-poll.question", 
          t => draft.question = t,
          validateQuestion
        );
        break;
      case "edit_description":
        await editTextField(
          "moderate-edit-poll.description", 
          t => draft.description = t.text === "-" ? undefined : t,
          validateDesc
        );
        break;
      case "edit_explanation":
        await editTextField(
          "moderate-edit-poll.explanation", 
          t => draft.explanation = t.text === "-" ? undefined : t,
          async ctx => {
            if (!await validateExpln(ctx))
              return false

            if (ctx.message!.text!.split("\n").length > MAX_POLL_EXPL_LF + 1) {
              await ctx.reply(ctx.t(
                "moderate-edit-poll.field-too-many-lines",
                { field: ctx.t("content-poll.explanation"), limit: MAX_POLL_EXPL_LF }
              ))
              return false
            }
            return true
          }
        );
        break;
      case "edit_options": {
        // NOTE: options parsing does not currently support entities (custom emoji)
        await clearMainMarkup();
        const cancelKb = new InlineKeyboard().text(ctx0.t("command.cancel"), FIELD_CANCEL);
        const prompt = await ctx0.reply(ctx0.t("moderate-edit-poll.options"), { reply_markup: cancelKb });
        while (true) {
          const text = await awaitTextMessage(conversation, FIELD_CANCEL);
          if (text === null) break;
          const lines = text.text.split("\n").map(l => l.trim()).filter(Boolean).map(line =>  {
            return {text: line}
          });
          if (lines.length < POLL_MIN_OPTIONS) { 
            await ctx0.reply(ctx0.t("moderate-edit-poll.options-min")); 
            continue; 
          }
          if (lines.length > POLL_MAX_OPTIONS) { 
            await ctx0.reply(ctx0.t("moderate-edit-poll.options-max")); 
            continue; 
          }
          draft.options = lines;
          break;
        }
        await ctx0.api.deleteMessage(prompt.chat.id, prompt.message_id).catch(() => {});
        await updateSummary();
        break;
      }
      case "toggle_multiple":
        draft.allows_multiple_answers = !draft.allows_multiple_answers;
        await updateSummary();
        break;
      case "approve": {
        const isModified = JSON.stringify(draft) !== initialJSON;
        const approvalFn = isModified
          ? () => db.editAndApproveSubmission(submission.id, moderatorId, { ...submission.content, poll: draft })
          : () => db.approveSubmission(submission.id, moderatorId);
        const queueName = await assignQueueFn(approvalFn);
        await exitClean("moderate.approved");
        log(ctx0.api, logsId, {
          type: "submission.approved",
          id: submission.id,
          moderatorName,
          queueName,
          edited: isModified
        }, { excluded: excludedEvents });
        return;
      }
      case "reject":
        await conversation.external(() => db.rejectSubmission(submission.id, moderatorId));
        await exitClean("moderate.rejected");
        log(ctx0.api, logsId, {
          type: "submission.rejected",
          id: submission.id,
          moderatorName,
        }, { excluded: excludedEvents });
        return;
      case "discard":
      case "cancel":
        await conversation.external(() => db.unclaimSubmission(submission.id));
        await exitClean("moderate-edit.cancelled");
        return;
    }
  }
}
