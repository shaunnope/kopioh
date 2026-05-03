import { Composer, InlineKeyboard } from "grammy";
import { FormattedString, fmt, b } from "grammy_parse_mode";
import { Context, Conversation, ConversationContext } from "../context.ts";
import { logHandle } from "../helper/logging.ts";
import { formatPeriod } from "../helper/format_period.ts";
import { ALL_CONTENT_TYPES, DEFAULT_CONFIG, type ConnectionConfig, type ContentType, type LogEventType } from "../../database/config.ts";
import db from "../../database/index.ts";
import whisper from "./whisper.ts"
import { log } from "../log.ts";


const composer = new Composer<Context>();
const feature = composer.chatType("private");

const TYPE_LABELS: Record<ContentType, string> = {
  text: "Text", photo: "Photo", video: "Video",
  audio: "Audio", voice: "Voice", animation: "GIF",
  sticker: "Sticker", poll: "Poll", document: "Doc",
};

const WHISPER_LIMIT_PRESETS = [1, 2, 3, 5, 10];
const WHISPER_PERIOD_PRESETS = [15, 30, 60, 360, 720, 1440, 10080]; // minutes: 15min, 30min, 1h, 6h, 12h, 1d, 1w
const WARN_THRESHOLD_TEMP_PRESETS = [2, 3, 5, 10];
const WARN_THRESHOLD_PERM_PRESETS = [3, 5, 7, 10];
const TEMP_BAN_DAYS_PRESETS = [1, 3, 7, 14, 30];

// Maps filter button key → the event types it controls
const FILTER_GROUPS: Record<string, LogEventType[]> = {
  sub_new:      ["submission.new"],
  sub_approved: ["submission.approved", "submission.edited"],
  sub_rejected: ["submission.rejected"],
  sub_skipped:  ["submission.skipped"],
  sub_posted:   ["submission.posted", "submission.auto_posted"],
  whisper_new:  ["whisper.new"],
  queue_low:    ["queue.low"],
  roles:        ["role.added", "role.removed"],
  config:       ["config.allowed_types", "config.whisper"],
  privacy:      ["privacy.anonymized", "privacy.deleted"],
};

function nextInCycle<T>(presets: T[], current: T): T {
  const idx = presets.indexOf(current);
  return presets[(idx + 1) % presets.length];
}

function getSettingValue(setting: string, value: string) {
  return fmt`${setting}: ${b}${value}${b}`
}

function buildMainText(ctx: Context, cfg: ConnectionConfig, groupName: string, logsId: number | null): string {
  const enabled = cfg.allowed_types.length;
  const total = ALL_CONTENT_TYPES.length;
  const whisper = cfg.whisper_limit === 0
    ? ctx.t("settings.whisper-disabled-label")
    : ctx.t("settings.whisper-active-label", { limit: cfg.whisper_limit, period: formatPeriod(cfg.whisper_period_minutes) });
  return [
    ctx.t("settings.title", { group: groupName }),
    ctx.t("settings.summary", { enabled, total, whisper }),
    ctx.t("settings.warnings-summary", { temp: cfg.warn_threshold_temp, perm: cfg.warn_threshold_perm, days: cfg.temp_ban_days }),
    logsId ? ctx.t("settings.logs-summary-active") : ctx.t("settings.logs-summary-none"),
  ].join("\n");
}

function buildMainKeyboard(ctx: Context): InlineKeyboard {
  return new InlineKeyboard()
    .text(ctx.t("settings.section-types"), "cfg:types")
    .text(ctx.t("settings.section-whisper"), "cfg:whisper")
    .row()
    .text(ctx.t("settings.section-warnings"), "cfg:warnings")
    .text(ctx.t("settings.section-logs"), "cfg:logs")
    .row()
    .text(ctx.t("settings.close-button"), "cfg:close");
}

function buildWarningsKeyboard(ctx: Context, cfg: ConnectionConfig): InlineKeyboard {
  return new InlineKeyboard()
    .text(ctx.t("settings.warn-threshold-temp-button", { threshold: cfg.warn_threshold_temp }), "cfg:wthresh_temp")
    .row()
    .text(ctx.t("settings.warn-threshold-perm-button", { threshold: cfg.warn_threshold_perm }), "cfg:wthresh_perm")
    .row()
    .text(ctx.t("settings.temp-ban-days-button", { days: cfg.temp_ban_days }), "cfg:wban_days")
    .row()
    .text(ctx.t("settings.back-button"), "cfg:main");
}

function buildTypesText(ctx: Context): string {
  return [ctx.t("settings.types-header"), ctx.t("settings.types-hint")].join("\n");
}

function buildTypesKeyboard(cfg: ConnectionConfig): InlineKeyboard {
  const kb = new InlineKeyboard();
  ALL_CONTENT_TYPES.forEach((type, i) => {
    const on = cfg.allowed_types.includes(type);
    kb.text(`${on ? "✅" : "✗"} ${TYPE_LABELS[type]}`, `cfg:toggle:${type}`);
    if ((i + 1) % 3 === 0) kb.row();
  });
  return kb.row().text("← Back", "cfg:main");
}

function buildWhisperText(ctx: Context, cfg: ConnectionConfig): FormattedString {
  let msg = FormattedString.b(ctx.t("settings.whisper-header")).plain("\n\n")

  if (cfg.whisper_limit === 0) {
    msg = msg.concat(getSettingValue(ctx.t("whisper"), ctx.t("settings.is-disabled")))
    .plain("\n").plain(ctx.t("settings.whisper-disabled-desc"))
  }
  else {
    msg = msg.plain(ctx.t("settings.whisper-desc"))
  }

  const types = cfg.whisper_allowed_types.map(t => TYPE_LABELS[t]).join(", ");
  return msg.plain("\n\n")
  .b(ctx.t("settings.whisper-allowed-label")).plain(` ${types}`)
  .plain("\n\n")
  .b(ctx.t("command-help.command")).plain("\n")
  .plain(" ").concat(whisper.getCommandExample(ctx))
  .plain("\n\n")
  .b("• ").code(ctx.t("setwhisper.arg-limit")).plain(" — ").plain(ctx.t("setwhisper.desc-limit"))
  .plain("\n")
  .b("• ").code(ctx.t("setwhisper.arg-period")).plain(" — ").plain(ctx.t("setwhisper.desc-period")).plain(" ")
  .concat(whisper.getCommandExample(ctx, "units"))
  .plain("\n    ").plain(ctx.t("setwhisper.desc-omit_unit"))
  .plain("\n    ").plain(ctx.t("setwhisper.desc-omit_period"))
  .plain("\n\n")
  .b(ctx.t("command-help.examples")).plain("\n")
  .concat(whisper.getCommandExample(ctx, "3/d")).plain("\n")
  .concat(whisper.getCommandExample(ctx, "1/w")).plain("\n")
  .concat(whisper.getCommandExample(ctx, "10/30min")).plain("\n")
  .concat(whisper.getCommandExample(ctx, "5"))
}

function buildWhisperTypesKeyboard(cfg: ConnectionConfig): InlineKeyboard {
  const kb = new InlineKeyboard();
  ALL_CONTENT_TYPES.forEach((type, i) => {
    const on = cfg.whisper_allowed_types.includes(type);
    kb.text(`${on ? "✅" : "✗"} ${TYPE_LABELS[type]}`, `cfg:wtype:${type}`);
    if ((i + 1) % 3 === 0) kb.row();
  });
  return kb.row().text("← Back", "cfg:whisper");
}

function buildWhisperKeyboard(ctx: Context, cfg: ConnectionConfig): InlineKeyboard {
  const isEnabled = cfg.whisper_limit > 0;
  const kb = new InlineKeyboard()
    .text(ctx.t(isEnabled ? "settings.whisper-disable-button" : "settings.whisper-enable-button"), "cfg:wtoggle")
  if (isEnabled) {
    kb.text(ctx.t("settings.whisper-types-button"), "cfg:wtypes")
      .row()
      .text(ctx.t("settings.whisper-limit-button", { limit: cfg.whisper_limit }), "cfg:wlimit")
      .text(ctx.t("settings.whisper-period-button", { period: formatPeriod(cfg.whisper_period_minutes) }), "cfg:wperiod")
  }
  return kb.row().text(ctx.t("settings.back-button"), "cfg:main");
}

function buildLogsText(ctx: Context, channelDisplay: string | null): string {
  const log = new FormattedString(ctx.t("settings.logs-header"))
  .plain("\n\n")
  .plain(channelDisplay
    ? ctx.t("settings.logs-active", { channel: channelDisplay })
    : ctx.t("settings.logs-none"))

  return log.text;
}

function buildLogsKeyboard(ctx: Context, logsId: number | null): InlineKeyboard {
  const kb = new InlineKeyboard();
  if (logsId) {
    kb.text(ctx.t("settings.logs-change-button"), "cfg:logs:set")
      .text(ctx.t("settings.logs-remove-button"), "cfg:logs:clear")
      .row();
  } else {
    kb.text(ctx.t("settings.logs-set-button"), "cfg:logs:set").row();
  }
  return kb
    .text(ctx.t("settings.logs-filters-button"), "cfg:logs:filters")
    .row()
    .text(ctx.t("settings.back-button"), "cfg:main");
}

function buildFiltersKeyboard(cfg: ConnectionConfig): InlineKeyboard {
  const isOn = (types: LogEventType[]) => types.every(t => !cfg.log_excluded_events.includes(t));

  return new InlineKeyboard()
    .text(`${isOn(["submission.new"]) ? "✅" : "✗"} New`, "cfg:logs:filter:sub_new")
    .text(`${isOn(["submission.approved", "submission.edited"]) ? "✅" : "✗"} Approved`, "cfg:logs:filter:sub_approved")
    .text(`${isOn(["submission.rejected"]) ? "✅" : "✗"} Rejected`, "cfg:logs:filter:sub_rejected")
    .row()
    .text(`${isOn(["submission.skipped"]) ? "✅" : "✗"} Skipped`, "cfg:logs:filter:sub_skipped")
    .text(`${isOn(["submission.posted", "submission.auto_posted"]) ? "✅" : "✗"} Posted`, "cfg:logs:filter:sub_posted")
    .row()
    .text(`${isOn(["whisper.new"]) ? "✅" : "✗"} Whispers`, "cfg:logs:filter:whisper_new")
    .text(`${isOn(["queue.low"]) ? "✅" : "✗"} Queue low`, "cfg:logs:filter:queue_low")
    .row()
    .text(`${isOn(["role.added", "role.removed"]) ? "✅" : "✗"} Role changes`, "cfg:logs:filter:roles")
    .text(`${isOn(["config.allowed_types", "config.whisper"]) ? "✅" : "✗"} Config`, "cfg:logs:filter:config")
    .row()
    .text(`${isOn(["privacy.anonymized", "privacy.deleted"]) ? "✅" : "✗"} Privacy`, "cfg:logs:filter:privacy")
    .row()
    .text("← Back", "cfg:logs");
}

export async function showSettings(ctx: Context): Promise<void> {
  const connection = ctx.session.connection;
  if (!connection) return;
  const [cfg, groupName, logsId] = await Promise.all([
    db.getConnectionConfig(connection.id),
    Promise.resolve(ctx.session.connectionMeta?.title ?? String(connection.submitId)),
    db.getLogsChannel(connection.id),
  ]);
  await ctx.reply(buildMainText(ctx, cfg, groupName, logsId), { reply_markup: buildMainKeyboard(ctx) });
}

async function guardAdmin(ctx: Context): Promise<boolean> {
  const connection = ctx.session.connection;
  if (!connection) return false;
  const ok = await db.getConnectionRole(ctx.from!.id, connection.id) === "admin";
  if (!ok) await ctx.answerCallbackQuery(ctx.t("settings.not-admin"));
  return ok;
}

// --- Log channel conversation ---

export async function logChannelConvo(
  conversation: Conversation,
  ctx0: ConversationContext,
) {
  const connection = await conversation.external(ctx => ctx.session.connection);
  if (!connection) return;

  const role = await conversation.external(() => db.getConnectionRole(ctx0.from!.id, connection.id));
  if (role !== "admin") {
    await ctx0.reply(ctx0.t("settings.not-admin"));
    return;
  }

  const cancelKb = new InlineKeyboard().text(ctx0.t("command.cancel"), "cfg:logs:cancel");
  const promptMsg = await ctx0.reply(ctx0.t("settings.logs-forward-prompt"), { reply_markup: cancelKb });

  while (true) {
    const nextCtx = await conversation.wait();

    if (nextCtx.callbackQuery?.data === "cfg:logs:cancel") {
      await nextCtx.answerCallbackQuery();
      await ctx0.api.editMessageText(promptMsg.chat.id, promptMsg.message_id, ctx0.t("command.cancelled"));
      return;
    }

    if (!nextCtx.message) continue;

    const origin = nextCtx.message.forward_origin;
    if (origin?.type !== "channel") {
      await nextCtx.reply(ctx0.t("settings.logs-forward-invalid"));
      continue;
    }

    const channelId = origin.chat.id;
    const channelDisplay = "username" in origin.chat && origin.chat.username
      ? `@${origin.chat.username}`
      : ("title" in origin.chat ? origin.chat.title : null) ?? String(channelId);

    const canPost = await conversation.external(async () => {
      try {
        const testMsg = await ctx0.api.sendMessage(channelId, ".");
        await ctx0.api.deleteMessage(channelId, testMsg.message_id).catch(_ => {});
        return true;
      } catch {
        return false;
      }
    });

    if (!canPost) {
      await nextCtx.reply(ctx0.t("settings.logs-no-permission"));
      continue;
    }

    await conversation.external(async () => {
      await db.setLogsChannel(connection.id, channelId);
      const cfg = await db.getConnectionConfig(connection.id);
      await log(ctx0.api, channelId, { type: "logs.set", channelId }, {
        excluded: cfg.log_excluded_events
      });
    });

    await ctx0.api.editMessageText(
      promptMsg.chat.id,
      promptMsg.message_id,
      ctx0.t("settings.logs-set-success", { channel: channelDisplay }),
    );
    return;
  }
}

// --- Callbacks ---

feature.callbackQuery("cfg:main", logHandle("callback-cfg-main"), async (ctx) => {
  if (!await guardAdmin(ctx)) return;
  await ctx.answerCallbackQuery();
  const connection = ctx.session.connection!;
  const [cfg, groupName, logsId] = await Promise.all([
    db.getConnectionConfig(connection.id),
    Promise.resolve(ctx.session.connectionMeta?.title ?? String(connection.submitId)),
    db.getLogsChannel(connection.id),
  ]);
  await ctx.editMessageText(buildMainText(ctx, cfg, groupName, logsId), { reply_markup: buildMainKeyboard(ctx) });
});

feature.callbackQuery("cfg:types", logHandle("callback-cfg-types"), async (ctx) => {
  if (!await guardAdmin(ctx)) return;
  await ctx.answerCallbackQuery();
  const cfg = await db.getConnectionConfig(ctx.session.connection!.id);
  await ctx.editMessageText(buildTypesText(ctx), { reply_markup: buildTypesKeyboard(cfg) });
});

feature.callbackQuery(/^cfg:toggle:(.+)$/, logHandle("callback-cfg-toggle"), async (ctx) => {
  if (!await guardAdmin(ctx)) return;
  await ctx.answerCallbackQuery();
  const type = ctx.match[1] as ContentType;
  const connection = ctx.session.connection!;
  const cfg = await db.getConnectionConfig(connection.id);
  const before = [...cfg.allowed_types];
  const types = cfg.allowed_types.includes(type)
    ? cfg.allowed_types.filter(t => t !== type)
    : [...cfg.allowed_types, type];
  await db.setAllowedTypes(connection.id, types as ContentType[]);
  cfg.allowed_types = types as ContentType[];
  await ctx.editMessageReplyMarkup({ reply_markup: buildTypesKeyboard(cfg) });
  log(ctx.api, connection.logsId, {
    type: "config.allowed_types",
    before,
    after: types,
  }, { excluded: cfg.log_excluded_events});
});

feature.callbackQuery("cfg:whisper", logHandle("callback-cfg-whisper"), async (ctx) => {
  if (!await guardAdmin(ctx)) return;
  await ctx.answerCallbackQuery();
  const cfg = await db.getConnectionConfig(ctx.session.connection!.id);
  const text = buildWhisperText(ctx, cfg);
  await ctx.editMessageText(text.text, { reply_markup: buildWhisperKeyboard(ctx, cfg), entities: text.entities });
});

feature.callbackQuery("cfg:wlimit", logHandle("callback-cfg-wlimit"), async (ctx) => {
  if (!await guardAdmin(ctx)) return;
  await ctx.answerCallbackQuery();
  const connection = ctx.session.connection!;
  const cfg = await db.getConnectionConfig(connection.id);
  const before = cfg.whisper_limit;
  const next = nextInCycle(WHISPER_LIMIT_PRESETS, cfg.whisper_limit) ?? WHISPER_LIMIT_PRESETS[0];
  await db.setWhisperLimit(connection.id, next);
  cfg.whisper_limit = next;
  await ctx.editMessageReplyMarkup({ reply_markup: buildWhisperKeyboard(ctx, cfg) });
  log(ctx.api, connection.logsId, {
    type: "config.whisper",
    setting: "Whisper limit",
    before: String(before),
    after: String(next),
  }, { excluded: cfg.log_excluded_events });
});

feature.callbackQuery("cfg:wperiod", logHandle("callback-cfg-wperiod"), async (ctx) => {
  if (!await guardAdmin(ctx)) return;
  await ctx.answerCallbackQuery();
  const connection = ctx.session.connection!;
  const cfg = await db.getConnectionConfig(connection.id);
  const before = cfg.whisper_period_minutes;
  const next = nextInCycle(WHISPER_PERIOD_PRESETS, cfg.whisper_period_minutes) ?? WHISPER_PERIOD_PRESETS[0];
  await db.setWhisperPeriodMinutes(connection.id, next);
  cfg.whisper_period_minutes = next;
  await ctx.editMessageReplyMarkup({ reply_markup: buildWhisperKeyboard(ctx, cfg) });
  log(ctx.api, connection.logsId, {
    type: "config.whisper",
    setting: "Whisper period",
    before: formatPeriod(before),
    after: formatPeriod(next),
  }, { excluded: cfg.log_excluded_events });
});

feature.callbackQuery("cfg:wtoggle", logHandle("callback-cfg-wtoggle"), async (ctx) => {
  if (!await guardAdmin(ctx)) return;
  await ctx.answerCallbackQuery();
  const connection = ctx.session.connection!;
  const cfg = await db.getConnectionConfig(connection.id);
  const before = cfg.whisper_limit;
  if (cfg.whisper_limit === 0) {
    cfg.whisper_limit = DEFAULT_CONFIG.whisper_limit;
    cfg.whisper_period_minutes = 60;
    await Promise.all([
      db.setWhisperLimit(connection.id, cfg.whisper_limit),
      db.setWhisperPeriodMinutes(connection.id, cfg.whisper_period_minutes),
    ]);
  } else {
    cfg.whisper_limit = 0;
    await db.setWhisperLimit(connection.id, 0);
  }
  const text = buildWhisperText(ctx, cfg);
  await ctx.editMessageText(text.text, { reply_markup: buildWhisperKeyboard(ctx, cfg), entities: text.entities });
  log(ctx.api, connection.logsId, {
    type: "config.whisper",
    setting: "Whisper",
    before: before === 0 ? "disabled" : "enabled",
    after: cfg.whisper_limit === 0 ? "disabled" : "enabled",
  }, { excluded: cfg.log_excluded_events });
});

feature.callbackQuery("cfg:wtypes", logHandle("callback-cfg-wtypes"), async (ctx) => {
  if (!await guardAdmin(ctx)) return;
  await ctx.answerCallbackQuery();
  const cfg = await db.getConnectionConfig(ctx.session.connection!.id);
  await ctx.editMessageText(
    [ctx.t("settings.whisper-allowed-label"), ctx.t("settings.whisper-types-hint")].join("\n"),
    { reply_markup: buildWhisperTypesKeyboard(cfg) },
  );
});

feature.callbackQuery(/^cfg:wtype:(.+)$/, logHandle("callback-cfg-wtype"), async (ctx) => {
  if (!await guardAdmin(ctx)) return;
  await ctx.answerCallbackQuery();
  const type = ctx.match[1] as ContentType;
  const connection = ctx.session.connection!;
  const cfg = await db.getConnectionConfig(connection.id);
  const before = [...cfg.whisper_allowed_types];
  const types = cfg.whisper_allowed_types.includes(type)
    ? cfg.whisper_allowed_types.filter(t => t !== type)
    : [...cfg.whisper_allowed_types, type];
  await db.setWhisperAllowedTypes(connection.id, types as ContentType[]);
  cfg.whisper_allowed_types = types as ContentType[];
  await ctx.editMessageReplyMarkup({ reply_markup: buildWhisperTypesKeyboard(cfg) });
  log(ctx.api, connection.logsId, {
    type: "config.whisper",
    setting: "Whisper allowed types",
    before: before.join(", ") || "none",
    after: types.join(", ") || "none",
  }, { excluded: cfg.log_excluded_events });
});

feature.callbackQuery("cfg:warnings", logHandle("callback-cfg-warnings"), async (ctx) => {
  if (!await guardAdmin(ctx)) return;
  await ctx.answerCallbackQuery();
  const cfg = await db.getConnectionConfig(ctx.session.connection!.id);
  await ctx.editMessageText(ctx.t("settings.warnings-header"), { reply_markup: buildWarningsKeyboard(ctx, cfg) });
});

feature.callbackQuery("cfg:wthresh_temp", logHandle("callback-cfg-wthresh-temp"), async (ctx) => {
  if (!await guardAdmin(ctx)) return;
  await ctx.answerCallbackQuery();
  const connection = ctx.session.connection!;
  const cfg = await db.getConnectionConfig(connection.id);
  const before = cfg.warn_threshold_temp;
  cfg.warn_threshold_temp = nextInCycle(WARN_THRESHOLD_TEMP_PRESETS, cfg.warn_threshold_temp) ?? WARN_THRESHOLD_TEMP_PRESETS[0];
  await db.setWarnThresholdTemp(connection.id, cfg.warn_threshold_temp);
  await ctx.editMessageReplyMarkup({ reply_markup: buildWarningsKeyboard(ctx, cfg) });
  log(ctx.api, connection.logsId, {
    type: "config.whisper",
    setting: "Temp ban threshold",
    before: String(before),
    after: String(cfg.warn_threshold_temp),
  }, { excluded: cfg.log_excluded_events });
});

feature.callbackQuery("cfg:wthresh_perm", logHandle("callback-cfg-wthresh-perm"), async (ctx) => {
  if (!await guardAdmin(ctx)) return;
  await ctx.answerCallbackQuery();
  const connection = ctx.session.connection!;
  const cfg = await db.getConnectionConfig(connection.id);
  const before = cfg.warn_threshold_perm;
  cfg.warn_threshold_perm = nextInCycle(WARN_THRESHOLD_PERM_PRESETS, cfg.warn_threshold_perm) ?? WARN_THRESHOLD_PERM_PRESETS[0];
  await db.setWarnThresholdPerm(connection.id, cfg.warn_threshold_perm);
  await ctx.editMessageReplyMarkup({ reply_markup: buildWarningsKeyboard(ctx, cfg) });
  log(ctx.api, connection.logsId, {
    type: "config.whisper",
    setting: "Perm ban threshold",
    before: String(before),
    after: String(cfg.warn_threshold_perm),
  }, { excluded: cfg.log_excluded_events });
});

feature.callbackQuery("cfg:wban_days", logHandle("callback-cfg-wban-days"), async (ctx) => {
  if (!await guardAdmin(ctx)) return;
  await ctx.answerCallbackQuery();
  const connection = ctx.session.connection!;
  const cfg = await db.getConnectionConfig(connection.id);
  const before = cfg.temp_ban_days;
  cfg.temp_ban_days = nextInCycle(TEMP_BAN_DAYS_PRESETS, cfg.temp_ban_days) ?? TEMP_BAN_DAYS_PRESETS[0];
  await db.setTempBanDays(connection.id, cfg.temp_ban_days);
  await ctx.editMessageReplyMarkup({ reply_markup: buildWarningsKeyboard(ctx, cfg) });
  log(ctx.api, connection.logsId, {
    type: "config.whisper",
    setting: "Temp ban duration",
    before: `${before} days`,
    after: `${cfg.temp_ban_days} days`,
  }, { excluded: cfg.log_excluded_events });
});

feature.callbackQuery("cfg:logs", logHandle("callback-cfg-logs"), async (ctx) => {
  if (!await guardAdmin(ctx)) return;
  await ctx.answerCallbackQuery();
  const connection = ctx.session.connection!;
  const logsId = await db.getLogsChannel(connection.id);
  let channelDisplay: string | null = null;
  if (logsId) {
    try {
      const chatInfo = await ctx.api.getChat(logsId);
      channelDisplay = "username" in chatInfo && chatInfo.username
        ? `@${chatInfo.username}`
        : ("title" in chatInfo && chatInfo.title ? chatInfo.title : null) ?? String(logsId);
    } catch {
      channelDisplay = String(logsId);
    }
  }
  await ctx.editMessageText(buildLogsText(ctx, channelDisplay), { reply_markup: buildLogsKeyboard(ctx, logsId) });
});

feature.callbackQuery("cfg:logs:set", logHandle("callback-cfg-logs-set"), async (ctx) => {
  if (!await guardAdmin(ctx)) return;
  await ctx.answerCallbackQuery();
  await ctx.conversation.enter("logChannelConvo");
});

feature.callbackQuery("cfg:logs:clear", logHandle("callback-cfg-logs-clear"), async (ctx) => {
  if (!await guardAdmin(ctx)) return;
  await ctx.answerCallbackQuery();
  const connection = ctx.session.connection!;
  const logsId = await db.getLogsChannel(connection.id);
  const cfg = await db.getConnectionConfig(connection.id);
  // log before clearing so the message reaches the old channel
  log(ctx.api, logsId, { type: "logs.cleared" }, { excluded: cfg.log_excluded_events });
  await db.clearLogsChannel(connection.id);
  await ctx.editMessageText(ctx.t("settings.logs-remove-success"), { reply_markup: buildLogsKeyboard(ctx, null) });
});

feature.callbackQuery("cfg:logs:cancel", logHandle("callback-cfg-logs-cancel"), async (ctx) => {
  await ctx.answerCallbackQuery();
});

feature.callbackQuery("cfg:logs:filters", logHandle("callback-cfg-logs-filters"), async (ctx) => {
  if (!await guardAdmin(ctx)) return;
  await ctx.answerCallbackQuery();
  const cfg = await db.getConnectionConfig(ctx.session.connection!.id);
  await ctx.editMessageText(ctx.t("settings.logs-filters-header"), { reply_markup: buildFiltersKeyboard(cfg) });
});

feature.callbackQuery(/^cfg:logs:filter:(.+)$/, logHandle("callback-cfg-logs-filter"), async (ctx) => {
  if (!await guardAdmin(ctx)) return;
  await ctx.answerCallbackQuery();
  const connection = ctx.session.connection!;
  const filterKey = ctx.match[1];
  const types = FILTER_GROUPS[filterKey];
  if (!types) return;

  const cfg = await db.getConnectionConfig(connection.id);
  const allExcluded = types.every(t => cfg.log_excluded_events.includes(t));
  const newExcluded: LogEventType[] = allExcluded
    ? cfg.log_excluded_events.filter(t => !types.includes(t))
    : [...new Set([...cfg.log_excluded_events, ...types])];

  await db.setLogExcludedEvents(connection.id, newExcluded);
  cfg.log_excluded_events = newExcluded;
  await ctx.editMessageReplyMarkup({ reply_markup: buildFiltersKeyboard(cfg) });
});

feature.callbackQuery("cfg:close", logHandle("callback-cfg-close"), async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.deleteMessage().catch(_ => {});
});

export { composer as settingsFeature };
