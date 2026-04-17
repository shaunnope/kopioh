import { Poll, PollOption } from "grammy/types";
import type { ContentType } from "../../database/config.ts";
import { TextWithEntities } from "grammy_parse_mode";
import { Conversation, ConversationContext } from "../context.ts";

export function detectContentType(content: Record<string, unknown>): ContentType {
  if (content.photo) return "photo";
  if (content.video) return "video";
  if (content.document) return "document";
  if (content.audio) return "audio";
  if (content.voice) return "voice";
  if (content.animation) return "animation";
  if (content.sticker) return "sticker";
  if (content.poll) return "poll";
  return "text";
}

/**
 * Prompt a user for a message, retrying on invalid messages, until a cancellation is requested
 * @param conversation 
 * @param cancelKey The key to identify a cancellation callback request
 * @param validate The validation predicate to identify a valid context object
 * @returns The final validated context, or null, if cancelled
 */
export async function awaitContext(
  conversation: Conversation,
  cancelKey: string,
  validate?: (ctx: ConversationContext) => Promise<boolean>,
) {
  while (true) {
    const next = await conversation.wait();
    if (next.callbackQuery) {
      await next.answerCallbackQuery();
      if (next.callbackQuery.data === cancelKey) return null;
      continue;
    }
    if (validate && !await validate(next)) continue;

    return next;
  }
}

export /**
 * Prompt a user for a text message, until cancellation
 * @param conversation 
 * @param cancelKey The key to identify a cancellation callback request
 * @param validate Optional, additional validation to perform on the text message context
 * @returns The final validated message text with entities, or null, if cancelled
 */
async function awaitTextMessage(
  conversation: Conversation,
  cancelKey: string,
  validate?: (ctx: ConversationContext) => Promise<boolean>,
): Promise<TextWithEntities | null> {
  const ctx = await awaitContext(
    conversation,
    cancelKey,
    async (ctx) => 
      MessageIs.defined(ctx) && 
      await MessageIs.notCommand(ctx) && 
      await MessageIs.text(ctx) &&
      (!validate || await validate(ctx))
  )
  return !ctx ? ctx : {
    text: ctx.message!.text!,
    entities: ctx.message!.entities
  };
}

/** Context validators */
export const MessageIs = {
  defined: (ctx: ConversationContext) => ctx.message != undefined,
  notCommand: async (ctx: ConversationContext) => {
    if (ctx.message?.text?.startsWith("/")) {
      await ctx.reply(ctx.t("content.command-not-allowed"));
      return false
    }
    return true
  },
  text: async (ctx: ConversationContext) => {
    if (!ctx.message?.text) {
      await ctx.reply(ctx.t("moderate-edit.text-only"));
      return false
    }
    return true
  }
}

/** The fields required to send a poll */
export interface PollFragment {
  question: TextWithEntities
  options: TextWithEntities[]

  description?: TextWithEntities
  explanation?: TextWithEntities

  type: Poll["type"]
  allows_multiple_answers: boolean
  correct_option_ids?: number[]
}

/** Extract only the required fields of a poll, in bundled text + entities format */
export function extractPoll(poll: Poll) : PollFragment {
  return {
    question: {
      text: poll.question,
      entities: poll.question_entities
    },
    options: poll.options,
    description: poll.description ? {
      text: poll.description,
      entities: poll.description_entities
    } : undefined,
    explanation: poll.explanation ? {
      text: poll.explanation,
      entities: poll.explanation_entities
    } : undefined,
    type: poll.type,
    allows_multiple_answers: poll.allows_multiple_answers,
    correct_option_ids: poll.correct_option_ids
  }
}

export function makePoll(fragment: PollFragment, allows_revoting: boolean, anon?: boolean, id?: string) : Poll {
  return {
    id: id ?? "fragment",
    ...fragment,
    question: fragment.question.text,
    question_entities: fragment.question.entities,
    options: fragment.options as PollOption[],
    
    description: fragment.description?.text,
    description_entities: fragment.description?.entities,
    explanation: fragment.explanation?.text,
    explanation_entities: fragment.explanation?.entities,

    allows_revoting,
    total_voter_count: 0,
    is_closed: false,
    is_anonymous: anon ?? true,
  }
}