import { Api } from "grammy";
import { logger } from "../logger.ts";
import db from "../database/index.ts";
import { sendContent } from "../bot/helper/send_content.ts";
import type { Queue, QueueTemplate } from "../database/queue.ts";
import { fmt, FormattedString, TextWithEntities } from "grammy_parse_mode";
import { MessageEntity } from "grammy/types";
import i18n from "../bot/i18n.ts";
import { DEFAULT_LANGUAGE_CODE } from "../bot/helper/bot_commands.ts";

// --- Schedule helpers ---

function parseTimeMins(timeStr: string): number {
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + m;
}

function getLocalInfo(now: Date, tz: string): { dow: number; mins: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    weekday: "long",
    hour12: false,
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const dow = days.indexOf(get("weekday"));
  const hour = parseInt(get("hour"), 10) % 24; // guard against "24" for midnight
  const minute = parseInt(get("minute"), 10);
  return { dow, mins: hour * 60 + minute };
}

function isDue(queue: Queue, now: Date): boolean {
  const { dow, mins } = getLocalInfo(now, queue.timezone);

  if (queue.days_of_week && !queue.days_of_week.includes(dow)) return false;

  // Deduplication: if we already posted within the current minute, skip.
  const slotStartMs = now.getTime() - (now.getSeconds() * 1000 + now.getMilliseconds());
  if (queue.last_posted_at && new Date(queue.last_posted_at).getTime() >= slotStartMs) return false;

  if (queue.schedule_type === "interval") {
    const start = parseTimeMins(queue.start_time!);
    const end = parseTimeMins(queue.end_time!);
    if (mins < start || mins > end) return false;
    if ((mins - start) % queue.interval_minutes! !== 0) return false;
    return true;
  }

  // Fixed: match any slot within ±1 minute
  return (queue.times ?? []).some((t) => Math.abs(mins - parseTimeMins(t)) <= 1);
}

// --- Template helpers ---

function applyTemplate(
  content: Record<string, unknown>,
  template: QueueTemplate | null,
  counter: number | null,
): Record<string, unknown> {
  if (!template || (!template.prefix && !template.suffix)) return content;

  const resolve = (s: string | null) =>
    s ? s.replace("{counter}", counter !== null ? String(counter) : "") : "";

  const prefix = resolve(template.prefix);
  const suffix = resolve(template.suffix);

  const applyToText = (text: TextWithEntities): FormattedString => {
    let msg = fmt`${text}`

    if (prefix) {
      msg = FormattedString.b(prefix).plain("\n").concat(msg)
    }
    if (suffix) {
      msg = msg.plain("\n").i(suffix)
    }
    return msg
  };

  const c = content;
  const isCaptioned = c.photo || c.video || c.audio || c.voice || c.animation || c.document;

  if (isCaptioned) {
    const { text: caption, entities: captionEntities } = applyToText({
      text: (c.caption as string) ?? "",
      entities: (c.caption_entities as MessageEntity[]) ?? [],
    });
    return { ...c, caption, caption_entities: captionEntities };
  }

  if (c.poll) {
    const poll = c.poll as Record<string, unknown>;
    const { text: description, entities: descriptionEntities } = applyToText({
      text: poll.description as string,
      entities: poll.description_entities as MessageEntity[] | undefined,
    });
    return { ...c, poll: { ...poll, description, description_entities: descriptionEntities } };
  }

  // Sticker: template text sent as separate follow-up (handled in caller)
  if (c.sticker) return c;

  // Plain text message
  const { text, entities } = applyToText({
    text: c.text as string,
    entities: c.entities as MessageEntity[] | undefined,
  });
  return { ...c, text, entities };
}

// --- Cron handler ---

export async function handleCronPost(api: Api): Promise<Response> {
  const allQueues = await db.getAllQueuesWithPending();
  const now = new Date();
  const dueQueues = allQueues.filter((q) => isDue(q, now));

  logger.info({ msg: "cron.post", total: allQueues.length, due: dueQueues.length });

  const results = await Promise.allSettled(
    dueQueues.map(async (queue) => {
      const submission = await db.dequeueFromQueue(queue.id);
      if (!submission) return false;

      const template = await db.getQueueTemplate(queue.id);
      const counter = template?.use_counter ? await db.incrementCounter(queue.id) : null;
      const content = applyTemplate(submission.content, template, counter);

      await sendContent(api, queue.broadcast_id, content);
      await db.updateLastPosted(queue.id);

      logger.info({
        msg: "cron.posted",
        queue_id: queue.id,
        broadcast_id: queue.broadcast_id,
        submission_id: submission.id,
      });

      // Sticker: send template as a separate follow-up message
      if (content.sticker && template && (template.prefix || template.suffix)) {
        const resolve = (s: string | null) =>
          s ? s.replace("{counter}", counter !== null ? String(counter) : "") : "";
        const msg = [resolve(template.prefix), resolve(template.suffix)].filter(Boolean).join("\n");
        if (msg) api.sendMessage(queue.broadcast_id, msg).catch(() => {});
      }

      // Low-queue alert (once per crossing, only if a logs channel is configured)
      const remaining = await db.countQueueApproved(queue.id);
      if (
        queue.logs_id &&
        queue.low_submission_threshold > 0 &&
        remaining <= queue.low_submission_threshold &&
        !queue.low_alert_sent_at
      ) {
        const alertText = i18n.t(DEFAULT_LANGUAGE_CODE, "queue.empty-warning", { remaining, name: queue.name })
        api.sendMessage(queue.logs_id, alertText).catch(() => {});
        await db.markLowAlertSent(queue.id);
      }

      return true;
    }),
  );

  const posted = results.filter(r => r.status === "fulfilled" && r.value === true).length;
  const failed = results.filter(r => r.status === "rejected").map(r => r.reason);

  if (failed.length > 0) {
    logger.warn({ msg: "cron.post.partial_failure", failed, total: dueQueues.length });
  }

  return new Response(JSON.stringify({ posted, failed }), {
    headers: { "Content-Type": "application/json" },
  });
}
