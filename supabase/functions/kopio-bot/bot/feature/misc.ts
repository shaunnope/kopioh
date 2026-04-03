
import { Composer } from "https://deno.land/x/grammy@v1.42.0/mod.ts";
import { FormattedString } from "https://deno.land/x/grammy_parse_mode@2.3.0/mod.ts";

import { type Context } from "../context.ts";
import { logHandle } from "../helper/logging.ts";
import { config } from "../../config.ts";

const composer = new Composer<Context>()

const feature = composer

function pingLine(formatted: FormattedString, message: string, value: string) {
  return formatted.b(message).plain(": ").plain(value)
}

feature.command("ping", logHandle("command-ping"), async (ctx) => {
  const unit = ctx.t("unit_ms")
  let message = new FormattedString("")

  message = pingLine(message, ctx.t("command_ping.ping"), new Date().toUTCString())
  const start = Date.now()
  const msg = await ctx.reply(message.text, { entities: message.entities })

  // estimate for the time taken to reply to message
  const ts = Date.now() - start
  message = pingLine(message.plain("\n"), ctx.t("command_ping.pong"), `${ts} ${unit}`)
  await msg.editText(message.text, { entities: message.entities })
})

feature.on("message:poll", logHandle("echo-poll"), async (ctx) => {
  await ctx.replyWithPoll(
    ctx.message.poll.question,
    ctx.message.poll.options.map((o) => o.text),
    {
      is_anonymous: ctx.message.poll.is_anonymous,
      type: ctx.message.poll.type,
      allows_multiple_answers: ctx.message.poll.allows_multiple_answers,
      ...(ctx.message.poll.type === "quiz" && {
        correct_option_ids: ctx.message.poll.correct_option_ids,
        explanation: ctx.message.poll.explanation,
      }),
    }
  )
})

export { composer as miscFeature }
