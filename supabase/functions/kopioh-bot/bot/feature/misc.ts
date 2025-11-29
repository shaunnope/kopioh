
import { Composer } from "https://deno.land/x/grammy@v1.38.4/mod.ts";
import { fmt, b } from "https://deno.land/x/grammy_parse_mode@2.2.0/mod.ts";

import { type Context } from "../context.ts";
import { logHandle } from "../helper/logging.ts";


const composer = new Composer<Context>()

const feature = composer

function pingLine(ctx: Context, message: string, value: number) {
  return fmt`${b}${message}${b}: ${value} ${ctx.t("unit_ms")}`
}

feature.command("ping", logHandle("command-ping"), async (ctx) => {
  const start = Date.now()
  let ts = start - ctx.msg.date * 1000
  let message = pingLine(ctx, ctx.t("command_ping.ping"), ts)
  // let formatted = fmt message
  const msg = await ctx.reply(message.text, { entities: message.entities })

  ts = Date.now() - start
  message = message.concat(fmt`\n`, pingLine(ctx, ctx.t("command_ping.pong"), ts))
  await msg.editText(message.text, { entities: message.entities })
})

export { composer as miscFeature }
