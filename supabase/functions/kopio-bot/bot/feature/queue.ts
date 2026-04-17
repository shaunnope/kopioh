import { Composer, InlineKeyboard } from "grammy";
import { Context, Conversation, ConversationContext } from "../context.ts";
import { logHandle } from "../helper/logging.ts";
import { sendContent } from "../helper/send_content.ts";
import { awaitTextMessage, detectContentType } from "../helper/content_type.ts";
import { requireModerator } from "./moderate.ts";
import db from "../../database/index.ts";
import { isConnected } from "../helper/connection.ts";

const composer = new Composer<Context>();
const feature = composer.chatType("private");

// --- Input helpers ---

function parseTimeInput(s: string): string | null {
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}:00`;
}

function parseTimesInput(s: string): string[] | null {
  const parts = s.split(",").map((x) => x.trim());
  const results: string[] = [];
  for (const p of parts) {
    const t = parseTimeInput(p);
    if (!t) return null;
    results.push(t);
  }
  return results.length > 0 ? results : null;
}

function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const DAY_NAMES: Record<string, number> = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tuesday: 2,
  wed: 3, wednesday: 3,
  thu: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
};

/** Returns number[] for specific days, null for "all", or false for invalid input. */
function parseDaysInput(s: string): number[] | null | false {
  if (s.toLowerCase() === "all") return null;
  const parts = s.split(",").map((x) => x.trim().toLowerCase());
  const days: number[] = [];
  for (const p of parts) {
    const d = DAY_NAMES[p];
    if (d === undefined) return false;
    if (!days.includes(d)) days.push(d);
  }
  return days.length > 0 ? days.sort((a, b) => a - b) : false;
}

// TODO: use i18n
function formatSchedule(q: ReturnType<typeof Object.create>): string {
  if (q.schedule_type === "interval") {
    return `every ${q.interval_minutes} min, ${q.start_time?.slice(0, 5)}–${q.end_time?.slice(0, 5)} (${q.timezone})`;
  }
  const slots = (q.times as string[] ?? []).map((t: string) => t.slice(0, 5)).join(", ");
  return `fixed: ${slots} (${q.timezone})`;
}

// --- Commands ---

feature.command("newqueue", logHandle("command-newqueue"), requireModerator, async (ctx) => {
  await ctx.conversation.enter("newQueueConvo");
});

feature.command("queues", logHandle("command-queues"), requireModerator, async (ctx) => {
  const connection = ctx.session.connection!;
  const queues = await db.getQueuesForConnection(connection.id);

  if (queues.length === 0) {
    await ctx.reply(ctx.t("queue.none"));
    return;
  }

  const lines = queues.map((q) => `• ${q.name} — ${formatSchedule(q)}`);
  await ctx.reply([ctx.t("queue.list-header"), ...lines].join("\n"));
});

feature.command("deletequeue", logHandle("command-deletequeue"), requireModerator, async (ctx) => {
  const connection = ctx.session.connection!;
  const name = (ctx.match ?? "").trim();

  if (!name) {
    await ctx.reply(ctx.t("queue.deletequeue-usage"));
    return;
  }

  const isAdmin = await db.isUserAdmin(ctx.from!.id, connection.id);
  if (!isAdmin) {
    await ctx.reply(ctx.t("queue.not-admin"));
    return;
  }

  const queues = await db.getQueuesForConnection(connection.id);
  const queue = queues.find((q) => q.name.toLowerCase() === name.toLowerCase());

  if (!queue) {
    await ctx.reply(ctx.t("queue.not-found"));
    return;
  }

  await db.deleteQueue(queue.id);
  await ctx.reply(ctx.t("queue.deleted", { name: queue.name }));
});

feature.command("viewqueue", logHandle("command-viewqueue"), requireModerator, async (ctx) => {
  await ctx.conversation.enter("viewQueueConvo");
});

export { composer as queueFeature };

//--- Conversation: create a new queue ---//

export async function newQueueConvo(conversation: Conversation, ctx0: ConversationContext) {
  const maybeConnection = await conversation.external((ctx) => ctx.session.connection);
  if (!isConnected(ctx0, maybeConnection)) return;
  const connection = maybeConnection!

  const isAdmin = await conversation.external(() => db.isUserAdmin(ctx0.from!.id, connection.id));
  if (!isAdmin) {
    await ctx0.reply(ctx0.t("queue.not-admin"));
    return;
  }

  const cancelKb = new InlineKeyboard().text(ctx0.t("command.cancel"), "newqueue:cancel");

  // Step 1: Name
  const nameMsg = await ctx0.reply(ctx0.t("queue.create-name-prompt"), { reply_markup: cancelKb });
  const nameInput = await awaitTextMessage(conversation, "newqueue:cancel");
  await ctx0.api.deleteMessage(nameMsg.chat.id, nameMsg.message_id).catch(() => {});
  if (!nameInput) return;
  const name = nameInput.text.trim();

  // Step 2: Schedule type
  const scheduleKb = new InlineKeyboard()
    .text(ctx0.t("queue.schedule-interval-button"), "newqueue:interval")
    .text(ctx0.t("queue.schedule-fixed-button"), "newqueue:fixed")
    .row()
    .text(ctx0.t("command.cancel"), "newqueue:cancel");
  const scheduleMsg = await ctx0.reply(ctx0.t("queue.create-schedule-prompt"), { reply_markup: scheduleKb });
  const scheduleCtx = await conversation.waitForCallbackQuery(/^newqueue:(interval|fixed|cancel)$/);
  await scheduleCtx.answerCallbackQuery();
  await ctx0.api.deleteMessage(scheduleMsg.chat.id, scheduleMsg.message_id).catch(() => {});
  const scheduleType = scheduleCtx.callbackQuery.data.split(":")[1];
  if (scheduleType === "cancel") return;

  let intervalMinutes: number | undefined;
  let startTime: string | undefined;
  let endTime: string | undefined;
  let times: string[] | undefined;

  if (scheduleType === "interval") {
    // Interval minutes (must be multiple of 30)
    let intervalMsg = await ctx0.reply(ctx0.t("queue.create-interval-prompt"), { reply_markup: cancelKb });
    while (true) {
      const input = await awaitTextMessage(conversation, "newqueue:cancel");
      await ctx0.api.deleteMessage(intervalMsg.chat.id, intervalMsg.message_id).catch(() => {});
      if (!input) return;
      const v = parseInt(input.text.trim(), 10);
      if (!isNaN(v) && v >= 30 && v % 30 === 0) { intervalMinutes = v; break; }
      intervalMsg = await ctx0.reply(ctx0.t("queue.create-interval-invalid"), { reply_markup: cancelKb });
    }

    // Start time
    let startMsg = await ctx0.reply(ctx0.t("queue.create-start-prompt"), { reply_markup: cancelKb });
    while (true) {
      const input = await awaitTextMessage(conversation, "newqueue:cancel");
      await ctx0.api.deleteMessage(startMsg.chat.id, startMsg.message_id).catch(() => {});
      if (!input) return;
      const t = parseTimeInput(input.text.trim());
      if (t) { startTime = t; break; }
      startMsg = await ctx0.reply(ctx0.t("queue.create-time-invalid"), { reply_markup: cancelKb });
    }

    // End time
    let endMsg = await ctx0.reply(ctx0.t("queue.create-end-prompt"), { reply_markup: cancelKb });
    while (true) {
      const input = await awaitTextMessage(conversation, "newqueue:cancel");
      await ctx0.api.deleteMessage(endMsg.chat.id, endMsg.message_id).catch(() => {});
      if (!input) return;
      const t = parseTimeInput(input.text.trim());
      if (t) { endTime = t; break; }
      endMsg = await ctx0.reply(ctx0.t("queue.create-time-invalid"), { reply_markup: cancelKb });
    }
  } else {
    // Fixed times (comma-separated HH:MM)
    let timesMsg = await ctx0.reply(ctx0.t("queue.create-times-prompt"), { reply_markup: cancelKb });
    while (true) {
      const input = await awaitTextMessage(conversation, "newqueue:cancel");
      await ctx0.api.deleteMessage(timesMsg.chat.id, timesMsg.message_id).catch(() => {});
      if (!input) return;
      const parsed = parseTimesInput(input.text.trim());
      if (parsed) { times = parsed; break; }
      timesMsg = await ctx0.reply(ctx0.t("queue.create-times-invalid"), { reply_markup: cancelKb });
    }
  }

  // Step 3: Timezone
  const tzKb = new InlineKeyboard()
    .text("UTC", "newqueue:tz:utc")
    .text(ctx0.t("command.cancel"), "newqueue:cancel");
  const tzMsg = await ctx0.reply(ctx0.t("queue.create-timezone-prompt"), { reply_markup: tzKb });
  let timezone = "UTC";
  while (true) {
    const next = await conversation.wait();
    if (next.callbackQuery?.data === "newqueue:cancel") {
      await next.answerCallbackQuery();
      await ctx0.api.deleteMessage(tzMsg.chat.id, tzMsg.message_id).catch(() => {});
      return;
    }
    if (next.callbackQuery?.data === "newqueue:tz:utc") {
      await next.answerCallbackQuery();
      timezone = "UTC";
      break;
    }
    if (next.message?.text && !next.message.text.startsWith("/")) {
      const tz = next.message.text.trim();
      if (isValidTimezone(tz)) { timezone = tz; break; }
      await ctx0.reply(ctx0.t("queue.create-timezone-invalid"));
    }
  }
  await ctx0.api.deleteMessage(tzMsg.chat.id, tzMsg.message_id).catch(() => {});

  // Step 4: Days of week
  const daysKb = new InlineKeyboard()
    .text(ctx0.t("queue.create-days-everyday"), "newqueue:days:all")
    .text(ctx0.t("command.cancel"), "newqueue:cancel");
  const daysMsg = await ctx0.reply(ctx0.t("queue.create-days-prompt"), { reply_markup: daysKb });
  let daysOfWeek: number[] | null = null;
  while (true) {
    const next = await conversation.wait();
    if (next.callbackQuery?.data === "newqueue:cancel") {
      await next.answerCallbackQuery();
      await ctx0.api.deleteMessage(daysMsg.chat.id, daysMsg.message_id).catch(() => {});
      return;
    }
    if (next.callbackQuery?.data === "newqueue:days:all") {
      await next.answerCallbackQuery();
      daysOfWeek = null;
      break;
    }
    if (next.message?.text && !next.message.text.startsWith("/")) {
      const parsed = parseDaysInput(next.message.text.trim());
      if (parsed !== false) { daysOfWeek = parsed; break; }
      await ctx0.reply(ctx0.t("queue.create-days-invalid"));
    }
  }
  await ctx0.api.deleteMessage(daysMsg.chat.id, daysMsg.message_id).catch(() => {});

  // Step 5: Low-queue alert threshold
  const threshKb = new InlineKeyboard()
    .text(ctx0.t("queue.create-threshold-default"), "newqueue:thresh:5")
    .text(ctx0.t("queue.create-threshold-off"), "newqueue:thresh:0")
    .row()
    .text(ctx0.t("command.cancel"), "newqueue:cancel");
  const threshMsg = await ctx0.reply(ctx0.t("queue.create-threshold-prompt"), { reply_markup: threshKb });
  let lowThreshold = 5;
  while (true) {
    const next = await conversation.wait();
    if (next.callbackQuery?.data === "newqueue:cancel") {
      await next.answerCallbackQuery();
      await ctx0.api.deleteMessage(threshMsg.chat.id, threshMsg.message_id).catch(() => {});
      return;
    }
    if (next.callbackQuery?.data?.startsWith("newqueue:thresh:")) {
      await next.answerCallbackQuery();
      lowThreshold = parseInt(next.callbackQuery.data.split(":")[2], 10);
      break;
    }
    if (next.message?.text && !next.message.text.startsWith("/")) {
      const n = parseInt(next.message.text.trim(), 10);
      if (!isNaN(n) && n >= 0) { lowThreshold = n; break; }
    }
  }
  await ctx0.api.deleteMessage(threshMsg.chat.id, threshMsg.message_id).catch(() => {});

  // Create the queue
  const queue = await conversation.external(() =>
    db.createQueue({
      connectionId: connection.id,
      name,
      scheduleType: scheduleType as "interval" | "fixed",
      timezone,
      intervalMinutes,
      startTime,
      endTime,
      times,
      daysOfWeek,
      lowSubmissionThreshold: lowThreshold,
    })
  );

  if (!queue) {
    await ctx0.reply(ctx0.t("queue.name-taken", { name }));
    return;
  }

  await ctx0.reply(ctx0.t("queue.created", { name: queue.name, schedule: formatSchedule(queue) }));
}

//--- Conversation: browse queue submissions ---//

export async function viewQueueConvo(conversation: Conversation, ctx0: ConversationContext) {
  const connection = await conversation.external((ctx) => ctx.session.connection);
  if (!isConnected(ctx0, connection)) return;

  const moderatorId = ctx0.from!.id;
  const name = ((ctx0.match ?? "") as string).trim();

  if (!name) {
    await ctx0.reply(ctx0.t("queue.viewqueue-usage"));
    return;
  }

  const isMod = await conversation.external(() => db.isUserModerator(moderatorId, connection!.id));
  if (!isMod) {
    await ctx0.reply(ctx0.t("moderate.not-moderator"));
    return;
  }

  const queues = await conversation.external(() => db.getQueuesForConnection(connection!.id));
  const queue = queues.find((q) => q.name.toLowerCase() === name.toLowerCase());

  if (!queue) {
    await ctx0.reply(ctx0.t("queue.not-found"));
    return;
  }

  const seen = new Set<string>();

  while (true) {
    const all = await conversation.external(() => db.getQueueSubmissions(queue.id));
    const remaining = all.filter((s) => !seen.has(s.id));

    if (remaining.length === 0) {
      await ctx0.reply(ctx0.t("queue.view-done", { total: seen.size }));
      return;
    }

    const submission = remaining[0];
    const position = seen.size + 1;
    const total = seen.size + remaining.length;

    const contentMsg = await sendContent(ctx0.api, ctx0.chat!.id, submission.content);

    const contentType = detectContentType(submission.content);
    const canEdit = contentType !== "sticker" && contentType !== "poll";
    const kb = new InlineKeyboard();
    if (canEdit) kb.text(ctx0.t("queue.edit-button"), "queue:edit");
    kb.text(ctx0.t("queue.skip-button"), "queue:skip")
      .row()
      .text(ctx0.t("queue.exit-button"), "queue:exit");

    const infoMsg = await ctx0.reply(
      ctx0.t("queue.view-item", { position, total }),
      { reply_markup: kb },
    );

    const cleanup = () => Promise.all([
      ctx0.api.deleteMessage(contentMsg.chat.id, contentMsg.message_id).catch(() => {}),
      ctx0.api.deleteMessage(infoMsg.chat.id, infoMsg.message_id).catch(() => {}),
    ]);

    const pattern = canEdit ? /^queue:(edit|skip|exit)$/ : /^queue:(skip|exit)$/;
    const actionCtx = await conversation.waitForCallbackQuery(pattern);
    await actionCtx.answerCallbackQuery();
    const action = actionCtx.callbackQuery.data.split(":")[1];

    if (action === "exit") {
      await cleanup();
      return;
    }

    if (action === "skip") {
      await cleanup();
      seen.add(submission.id);
      continue;
    }

    // edit
    await cleanup();

    const isCaptioned = (["photo", "video", "audio", "voice", "animation", "document"] as string[])
      .includes(contentType);
    const promptKey = isCaptioned ? "moderate-edit.prompt_caption" : "moderate-edit.prompt";
    const cancelKb = new InlineKeyboard().text(ctx0.t("command.cancel"), "queue:edit:cancel");
    const promptMsg = await ctx0.reply(ctx0.t(promptKey), { reply_markup: cancelKb });

    const newText = await awaitTextMessage(conversation, "queue:edit:cancel");
    await ctx0.api.deleteMessage(promptMsg.chat.id, promptMsg.message_id).catch(() => {});

    if (!newText) {
      await ctx0.reply(ctx0.t("queue.edit-cancelled"));
      continue;
    }

    const newContent = isCaptioned
      ? {
          ...submission.content,
          caption: newText.text === "-" ? undefined : newText.text,
          caption_entities: newText.entities,
        }
      : { ...submission.content, ...newText };

    await conversation.external(() => db.editAndApproveSubmission(submission.id, moderatorId, newContent));
    await ctx0.reply(ctx0.t("queue.edit-saved"));
    seen.add(submission.id);
  }
}
