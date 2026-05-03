
import { Composer } from "grammy";

import { type Context } from "../context.ts";
import { logHandle } from "../helper/logging.ts";

const composer = new Composer<Context>()

const feature = composer

// Only catch non-handled commands that start at the beginning of the message
feature.on("::bot_command", logHandle("unhandled"), (ctx, next) => {
  const entities = ctx.message?.entities ?? ctx.channelPost?.entities ?? [];
  const startsWithCommand = entities.some(e => e.type === "bot_command" && e.offset === 0);
  return startsWithCommand ? ctx.reply(ctx.t("unhandled.command")) : next();
})

export { composer as unhandledHandler }
