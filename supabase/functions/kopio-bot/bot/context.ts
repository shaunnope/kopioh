import type { Context as DefaultContext } from "grammy";

import { HydrateFlavor } from "grammy_hydrate";

import type { I18nFlavor } from "grammy_i18n";

import type { ConversationFlavor, Conversation as DefaultConversation } from "grammy_conversations";
import { SessionFlavor } from "./session.ts";

type BaseContext = DefaultContext & I18nFlavor

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