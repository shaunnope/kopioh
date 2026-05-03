import type { Context as DefaultContext, Transformer } from "grammy";

import { HydrateFlavor } from "grammy_hydrate";

import type { I18nFlavor } from "grammy_i18n";

import type { ConversationFlavor, Conversation as DefaultConversation } from "grammy_conversations";
import { SessionFlavor } from "./session.ts";

export type BaseContext = DefaultContext & I18nFlavor

export type ConversationContext = 
  HydrateFlavor<BaseContext>
export type Context = ConversationFlavor<
  HydrateFlavor<
    BaseContext & SessionFlavor
    >
  >
export type Conversation = DefaultConversation<Context, ConversationContext>

export const convoStorage = {
  
}

/**
 * Attempt to delete the associated message.
 *
 * Bot may lack admin rights to delete messages in a group. In such cases, silently ignore error and leave message
 * @param ctx
 */
export async function TryDeleteMessage(ctx: Context) {
  await ctx.deleteMessage().catch(() => {})
}

/**
 * API transformer that silently swallows errors from `deleteMessage` calls.
 * Useful for cross-chat deletes where admin rights may be absent.
 * @param onError optional callback invoked with the caught error
 */
export function silentDeleteTransformer(onError?: (err: unknown) => void): Transformer {
  return async (prev, method, payload, signal) => {
    if (method !== "deleteMessage") return prev(method, payload, signal);
    try {
      return await prev(method, payload, signal);
    } catch (err) {
      onError?.(err);
      return { ok: true, result: true } as Awaited<ReturnType<typeof prev>>;
    }
  };
}