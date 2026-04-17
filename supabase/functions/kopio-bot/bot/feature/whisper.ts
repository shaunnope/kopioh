import { Composer, InlineKeyboard } from "grammy";
import { code, fmt, FormattedString } from "grammy_parse_mode";
import { Context, Conversation, ConversationContext } from "../context.ts";
import { logHandle } from "../helper/logging.ts";
import { sendContent } from "../helper/send_content.ts";
import { detectContentType } from "../helper/content_type.ts";
import { formatPeriod } from "../helper/format_period.ts";
import db from "../../database/index.ts";
import { log } from "../log.ts";
import { isConnected } from "../helper/connection.ts";

function getCommandExample(ctx: Context, key?: string) {
  switch (key) {
    case "3/d-":
      return FormattedString.code("/setwhisper 3 24h")
    case "3/d":
      return FormattedString.code("/setwhisper 3 24h").plain(" — 3/day")
    case "1/w":
      return FormattedString.code("/setwhisper 1 1w").plain(" — 1/week")
    case "10/30min":
      return FormattedString.code("/setwhisper 10 30").plain(" — 10/30 min")
    case "5":
      return FormattedString.code("/setwhisper 5").plain(" — 5/hour")
    case "units":
      return FormattedString.code("min")
        .plain(", ").code("h").plain(", ").code("d")
        .plain(", ").code("w").plain(", ").code("m")
    case "periods":
    default: // template
      return FormattedString.code(`/setwhisper [${ctx.t("setwhisper.arg-limit")}] [${ctx.t("setwhisper.arg-period")}]`)
  }
}

const composer = new Composer<Context>();
const feature = composer.chatType("private");

export async function whisperConvo(
  conversation: Conversation,
  ctx0: ConversationContext,
) {
  const maybeConnection = await conversation.external((ctx) => ctx.session.connection);

  if (!isConnected(ctx0, maybeConnection)) return;
  const connection = maybeConnection!

  const { submitId } = connection;
  const userId = ctx0.from!.id;

  const connectionConfig = await conversation.external(() => db.getConnectionConfig(connection.id));

  if (connectionConfig.whisper_limit === 0) {
    await ctx0.reply(ctx0.t("whisper.disabled"));
    return;
  }

  const allowed = await conversation.external(() =>
    db.canWhisper(userId, submitId, connectionConfig.whisper_limit, connectionConfig.whisper_period_minutes)
  );

  if (!allowed) {
    await ctx0.reply(ctx0.t("whisper.rate_limited", {
      limit: connectionConfig.whisper_limit,
      period: formatPeriod(connectionConfig.whisper_period_minutes),
    }));
    return;
  }

  const cancelKeyboard = new InlineKeyboard().text(ctx0.t("command.cancel"), "whisper:cancel");
  const promptMsg = await ctx0.reply(ctx0.t("whisper.prompt"), { reply_markup: cancelKeyboard });

  let contentCtx: ConversationContext | undefined;
  while (!contentCtx) {
    const nextCtx = await conversation.wait();

    if (nextCtx.callbackQuery?.data === "whisper:cancel") {
      await nextCtx.answerCallbackQuery();
      await ctx0.api.editMessageText(promptMsg.chat.id, promptMsg.message_id, ctx0.t("command.cancelled"));
      return;
    }

    if (!nextCtx.message) continue;

    if (nextCtx.message.text?.startsWith("/")) {
      await nextCtx.reply(nextCtx.t("submit.send-content"));
      continue;
    }

    if (!connectionConfig.whisper_allowed_types.includes(detectContentType(nextCtx.message as never))) {
      await nextCtx.reply(nextCtx.t("submit.type-not-allowed"));
      continue;
    }

    contentCtx = nextCtx;
  }

  const msg = contentCtx!.message!;
  const content = {
    text: msg.text,
    entities: msg.entities,
    caption: msg.caption,
    caption_entities: msg.caption_entities,
    photo: msg.photo,
    video: msg.video,
    document: msg.document,
    audio: msg.audio,
    voice: msg.voice,
    animation: msg.animation,
    sticker: msg.sticker,
    poll: msg.poll,
  };

  const confirmKeyboard = new InlineKeyboard()
    .text(ctx0.t("command.confirm"), "whisper:confirm")
    .text(ctx0.t("command.cancel"), "whisper:cancel");

  await contentCtx!.reply(ctx0.t("whisper.confirm-prompt"), { reply_markup: confirmKeyboard });

  const confirmCtx = await conversation.waitForCallbackQuery(/^whisper:(confirm|cancel)$/);
  await confirmCtx.answerCallbackQuery();

  if (confirmCtx.callbackQuery.data === "whisper:cancel") {
    await confirmCtx.editMessageText(ctx0.t("command.cancelled"));
    return;
  }

  await ctx0.api.sendMessage(submitId, ctx0.t("whisper.anonymous-label"));
  await sendContent(ctx0.api, submitId, content);
  await conversation.external(() => db.createWhisper(userId, submitId));

  log(ctx0.api, connection.logsId, {
    type: "whisper.new",
    contentType: detectContentType(msg as never),
  }, { excluded: connectionConfig.log_excluded_events });

  await confirmCtx.editMessageText(ctx0.t("whisper.success"));
}

feature.callbackQuery(/^whisper:(confirm|cancel)$/, logHandle("callback-whisper-stale"), async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageReplyMarkup();
});

// Matches a number with an optional unit. No unit defaults to minutes.
const PERIOD_REGEX = /^(\d+(?:\.\d+)?)(min|h|d|w|m)?$/i;
const MAX_PERIOD_MINUTES = 3 * 30 * 24 * 60; // ~3 months

function parsePeriodToMinutes(period: string): number | null {
  const match = PERIOD_REGEX.exec(period);
  if (!match) return null;
  const value = parseFloat(match[1]);
  if (value <= 0) return null;
  switch ((match[2] ?? "min").toLowerCase()) {
    case "min": return Math.round(value);
    case "h":   return Math.round(value * 60);
    case "d":   return Math.round(value * 60 * 24);
    case "w":   return Math.round(value * 60 * 24 * 7);
    case "m":   return Math.round(value * 60 * 24 * 30);
    default:    return null;
  }
}

feature.command("setwhisper", logHandle("command-setwhisper"), async (ctx) => {
  const connection = ctx.session.connection;
  if (!isConnected(ctx, connection) || !connection) return;

  const isAdmin = await db.isUserAdmin(ctx.from.id, connection.id);
  if (!isAdmin) {
    await ctx.reply(ctx.t("setwhisper.not-admin"));
    return;
  }

  const rawArgs = ctx.match.trim();
  const usageMsg = FormattedString
    .b(ctx.t("command-help.usage")).b(": ").concat(getCommandExample(ctx))
    .plain("\n").plain(ctx.t("command-help.example")).plain(": ").concat(getCommandExample(ctx, "3/d-"))
  if (!rawArgs) {
    await ctx.reply(usageMsg.text, { entities: usageMsg.entities });
    return;
  }

  const args = rawArgs.split(/\s+/);
  if (args.length > 2) {
    await ctx.reply(usageMsg.text, { entities: usageMsg.entities });
    return;
  }

  const limit = Number(args[0]);
  if (!Number.isInteger(limit) || limit < 0 || limit > 100) {
    await ctx.reply(ctx.t("setwhisper.invalid-limit"));
    return;
  }

  // Default period to 60 minutes (1h) when omitted
  const periodArg = args[1] ?? "60";
  const minutes = parsePeriodToMinutes(periodArg);
  if (minutes === null) {
    const invalidPeriodMsg = fmt`⚠️ Invalid period. Use a number with a unit: ${code()}min${code()}, ${code()}h${code()}, ${code()}d${code()}, ${code()}w${code()}, ${code()}m${code()}\nExample: ${code()}1h${code()}, ${code()}30min${code()}, ${code()}2d${code()}, ${code()}1w${code()}, ${code()}1m${code()}`;
    await ctx.reply(invalidPeriodMsg.text, { entities: invalidPeriodMsg.entities });
    return;
  }

  if (minutes > MAX_PERIOD_MINUTES) {
    await ctx.reply(ctx.t("setwhisper.period-too-long"));
    return;
  }

  await Promise.all([
    db.setWhisperLimit(connection.id, limit),
    db.setWhisperPeriodMinutes(connection.id, minutes),
  ]);

  await ctx.reply(ctx.t("setwhisper.success", { limit, period: formatPeriod(minutes) }));
});

export { composer as whisperFeature };

export default {
  getCommandExample
}