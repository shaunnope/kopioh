import type { Context as DefaultContext } from "https://deno.land/x/grammy@v1.38.4/mod.ts";

import { HydrateFlavor } from "https://deno.land/x/grammy_hydrate@v1.6.0/mod.ts";

import {
  type Conversation as DefaultConversation,
  type ConversationFlavor,
} from "https://deno.land/x/grammy_conversations@v2.1.0/mod.ts";

import type { I18nFlavor } from "https://deno.land/x/grammy_i18n@v1.1.0/mod.ts";

export type Context = 
HydrateFlavor<
  ConversationFlavor<
    DefaultContext &
    I18nFlavor
  >
>

export type Conversation = DefaultConversation<Context>