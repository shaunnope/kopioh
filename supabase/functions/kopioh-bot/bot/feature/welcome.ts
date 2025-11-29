import { Composer } from "https://deno.land/x/grammy@v1.38.4/mod.ts";
import { Context } from "../context.ts";
import { logHandle } from "../helper/logging.ts";

const composer = new Composer<Context>()

const feature = composer.chatType("private")
const groupFeature = composer.chatType(["group", "supergroup"])

feature.command(
  "start", 
  logHandle("command-start"), 
  ctx => ctx.reply(ctx.t("welcome"))
)
groupFeature.command(
  "start", 
  logHandle("command-start.group"), 
  ctx => ctx.reply(ctx.t("welcome.group"))
)

export { composer as welcomeFeature }
