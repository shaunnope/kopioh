import { Api } from "grammy";
import type { ForceReply, InlineKeyboardMarkup, Message, Poll, ReplyKeyboardMarkup, ReplyKeyboardRemove, ReplyParameters } from "grammy/types";
import { makePoll, PollFragment } from "./content_type.ts";

export interface SendOptions {
  all?: {
    disable_notification?: boolean
    protect_content?: boolean
    allow_paid_broadcast?: boolean
    message_effect_id?: string
    reply_parameters?: ReplyParameters
    reply_markup?: InlineKeyboardMarkup | ReplyKeyboardMarkup | ReplyKeyboardRemove | ForceReply
  },
  poll?: {
    /**
     * The bot typically does not send non-anonymous polls, 
     * since the primary context of sending polls is within broadcast channels, where anonymous polls are not supported
     * 
     * Set this to false to send a non-anonymous poll
     */
    is_anonymous?: boolean
    shuffle_options?: boolean
    allow_adding_options?: boolean
    hide_results_until_closes?: boolean
    is_closed?: boolean
  }
}

/**
 * Send submission content to a chat, dispatching on content type.
 * Used for moderator preview, channel posting, and group whispers.
 */
export function sendContent(api: Api, chatId: number, content: Record<string, unknown>, options?: SendOptions): Promise<Message> {
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
    const poll = makePoll(
      c.poll as PollFragment, 
      true, 
      options?.poll?.is_anonymous ?? true
    );

    return api.sendPoll(chatId, poll.question, poll.options, poll);
  }
  return api.sendMessage(chatId, c.text as string, {
    entities: c.entities as never,
  });
}
