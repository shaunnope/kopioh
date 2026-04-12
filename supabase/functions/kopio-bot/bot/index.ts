import { Bot as BaseBot, MiddlewareFn, RawApi, session, Transformer, type StorageAdapter } from "grammy";
import { hydrate } from "grammy_hydrate";
import { conversations, createConversation } from "grammy_conversations/plugin";

import { UserFromGetMe } from "grammy/types";

import type { Context } from "./context.ts";
import type { SessionData } from "./session.ts";
import i18n from "./i18n.ts";
import { initial } from "./session.ts";

import { welcomeFeature } from "./feature/welcome.ts";
import { connectionFeature } from "./feature/connect.ts";
import { submitFeature, submitConvo } from "./feature/submit.ts";
import { moderateFeature, moderateConvo } from "./feature/moderate.ts";
import { config } from "../config.ts";
import { miscFeature } from "./feature/misc.ts";
import { privacyFeature } from "./feature/privacy.ts";
import { unhandledHandler } from "./feature/unhandler.ts";
import db from "../database/index.ts";
import { logger } from "../logger.ts";

interface BotOptions {
  botInfo?: UserFromGetMe
  sessionStorage?: StorageAdapter<SessionData>
  // deno-lint-ignore no-explicit-any
  conversationStorage?: StorageAdapter<any>
  transformer?: Transformer<RawApi>
}

export function getBot(opts: BotOptions = {}) {
  const bot = new BaseBot<Context>(config.BOT_TOKEN);
  if (opts.botInfo)
    bot.botInfo = opts.botInfo

  opts.sessionStorage = opts.sessionStorage ?? db.createStorageAdapter("bot_sessions")
  opts.conversationStorage = opts.conversationStorage ?? db.createStorageAdapter("bot_conversations")
  let convoTransformer: MiddlewareFn = async (_, next) => await next()

  if (opts.transformer) {
    const transformer = opts.transformer
    bot.api.config.use(transformer)

    convoTransformer = async (ctx, next) => {
      ctx.api.config.use(transformer)
      await next()
    }
  }


  // Base Middleware
  bot.use(hydrate())
  bot.use(i18n)
  bot.use(session({
    initial,
    storage: opts.sessionStorage
  }))

  bot.use(conversations({
    storage: opts.conversationStorage,
    plugins: [hydrate(), i18n, convoTransformer] // register plugins for use within conversations
  }))

  // Conversations (must be registered before the handlers that enter them)
  bot.use(createConversation(submitConvo))
  bot.use(createConversation(moderateConvo))

  // Handlers
  bot.use(welcomeFeature)
  bot.use(connectionFeature)
  bot.use(submitFeature)
  bot.use(moderateFeature)

  bot.use(miscFeature)
  bot.use(privacyFeature)

  // if (isMultipleLocales) {
  //   bot.use(languageFeature)
  // }

  bot.use(unhandledHandler)

  bot.catch((err) => {
    logger.error({
      msg: "unhandled bot error",
      update_id: err.ctx.update.update_id,
      error: err.message,
    })
    err.ctx.reply("An unexpected error occurred. Please try again later.").catch(() => {})
    console.error(err.stack)
  })

  return bot
}

export type Bot = ReturnType<typeof getBot>