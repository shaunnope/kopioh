
import { Composer } from "https://deno.land/x/grammy@v1.42.0/mod.ts";

import { type Context } from "../context.ts";
import { logHandle } from "../helper/logging.ts";

const composer = new Composer<Context>()

const feature = composer

feature.on("::bot_command", logHandle("unhandled"), ctx => ctx.reply(ctx.t("unhandled.command")))
feature.on(":text", logHandle("unhandled"), ctx => ctx.reply(ctx.t("unhandled.text")))

export { composer as unhandledHandler }
