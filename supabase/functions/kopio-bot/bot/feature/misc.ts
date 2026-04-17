/**
 * Global context handlers for general QOL requests,
 */
import { Composer } from "grammy";
import { FormattedString } from "grammy_parse_mode";

import { type Context } from "../context.ts";
import { logHandle } from "../helper/logging.ts";

const composer = new Composer<Context>()

const feature = composer

function pingLine(formatted: FormattedString, message: string, value: string) {
  return formatted.b(message).plain(": ").plain(value)
}

feature.command("ping", logHandle("command-ping"), async (ctx) => {
  const unit = ctx.t("unit.ms")
  let message = new FormattedString("")

  message = pingLine(message, ctx.t("command-ping.ping"), new Date().toUTCString())
  const start = Date.now()
  const msg = await ctx.reply(message.text, { entities: message.entities })

  // estimate for the time taken to reply to message
  const ts = Date.now() - start
  message = pingLine(message.plain("\n"), ctx.t("command-ping.pong"), `${ts} ${unit}`)
  await msg.editText(message.text, { entities: message.entities })
})

export { composer as miscFeature }
