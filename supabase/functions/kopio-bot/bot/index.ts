import { Bot as BaseBot, session } from "grammy";
import { hydrate } from "grammy_hydrate";
import { conversations, createConversation } from "grammy_conversations/plugin";

import type { Context } from "./context.ts";
import i18n from "./i18n.ts";
import { initial } from "./session.ts";

import { welcomeFeature } from "./feature/welcome.ts";
import { connectionFeature } from "./feature/connect.ts";
import { submitFeature, submitConvo } from "./feature/submit.ts";
import { config } from "../config.ts";
import { miscFeature } from "./feature/misc.ts";
import { unhandledHandler } from "./feature/unhandler.ts";
import db from "../database/index.ts";
import { logger } from "../logger.ts";

export function getBot() {
  const bot = new BaseBot<Context>(config.BOT_TOKEN);

  // Base Middleware
  bot.use(hydrate())
  bot.use(i18n)
  bot.use(session({ 
    initial, 
    storage: db.createStorageAdapter("bot_sessions") 
  }))

  bot.use(conversations({
    storage: db.createStorageAdapter("bot_conversations"),
    plugins: [hydrate(), i18n] // register plugins for use within conversations
  }))

  // Conversations (must be registered before the handlers that enter them)
  bot.use(createConversation(submitConvo))

  // Handlers
  bot.use(welcomeFeature)
  bot.use(connectionFeature)
  bot.use(submitFeature)

  bot.use(miscFeature)

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