import { Api } from "grammy";
import type { LogEventType } from "../database/config.ts";
import { FormattedString } from "grammy_parse_mode";
import { logger } from "../logger.ts";

export type LogEvent =
  | { type: "submission.new"; id: string; contentType: string; }
  | { type: "submission.approved"; id: string; moderatorName: string; queueName: string | null; edited: boolean }
  | { type: "submission.rejected"; id: string; moderatorName: string }
  | { type: "submission.posted"; id: string; moderatorName: string }
  | { type: "submission.auto_posted"; id: string; queueName: string }
  | { type: "whisper.new"; contentType: string }
  | { type: "queue.low"; queueName: string; remaining: number }
  | { type: "role.added"; targetName: string; roleName: string; byName: string }
  | { type: "role.removed"; targetName: string; byName: string }
  | { type: "role.reset"; byName: string }
  | { type: "connection.created"; broadcastId: number; submitId: number }
  | { type: "connection.deleted" }
  | { type: "logs.set"; channelId: number }
  | { type: "logs.cleared" }
  | { type: "config.allowed_types"; before: string[]; after: string[] }
  | { type: "config.whisper"; setting: string; before: string; after: string }
  | { type: "privacy.anonymized" }
  | { type: "privacy.deleted" };

export function userName(user: { first_name: string; username?: string }): string {
  return user.username ? `@${user.username}` : user.first_name;
}

function shortId(id: string): string {
  return id.replace(/-/g, "").slice(0, 8);
}

function formatLog(event: LogEvent): FormattedString {
  let log = new FormattedString("");
  switch (event.type) {
    case "submission.new":
      log = log.plain("#NEW\n")
      .b("ID: ").code(shortId(event.id)).plain("\n")
      .b("Type: ").plain(event.contentType)
      break;
    case "submission.approved":
      log = log.plain("#APPROVED\n")
      .b("ID: ").code(shortId(event.id))
      if (event.edited) log = log.i(" (edited)")
      
      log = log.plain("\n")
      .b("By: ").plain(event.moderatorName).plain("\n")
      .b("Queue: ").plain(event.queueName ?? "-")
      break;
    case "submission.rejected":
      log = log.plain("#REJECTED\n")
      .b("ID: ").code(shortId(event.id)).plain("\n")
      .b("By: ").plain(event.moderatorName)
      break;
    case "submission.posted":
      log = log.plain("#POSTED\n")
      .b("ID: ").code(shortId(event.id)).plain("\n")
      .b("By: ").plain(event.moderatorName).plain(" (manual)")
      break;
    case "submission.auto_posted":
      log = log.plain("#POSTED\n")
      .b("ID: ").code(shortId(event.id)).plain("\n")
      .b("Queue: ").plain(event.queueName)
      break;
    case "whisper.new":
      log = log.plain("#WHISPER\n")
      .b("Type: ").plain(event.contentType)
      break;
    case "queue.low":
      log = log.plain("#QUEUE_LOW\n")
      .b("Queue: ").plain(event.queueName).plain("\n")
      .b("Remaining: ").plain(String(event.remaining))
      break;
    case "role.added":
      log = log.plain("#ROLE\n")
      .plain(event.targetName).plain(" added as ").b(event.roleName).plain("\n")
      .b("By: ").plain(event.byName)
      break;
    case "role.removed":
      log = log.plain("#ROLE\n")
      .plain(event.targetName).plain(" removed\n")
      .b("By: ").plain(event.byName)
      break;
    case "role.reset":
      log = log.plain("#ROLE\n")
      .plain("All roles reset\n")
      .b("By: ").plain(event.byName)
      break;
    case "connection.created":
      log = log.plain("#CONNECTION\n")
      .b("Broadcast: ").plain(String(event.broadcastId)).plain("\n")
      .b("Group: ").plain(String(event.submitId))
      break;
    case "connection.deleted":
      log = log.plain("#CONNECTION\n")
      .plain("Connection removed")
      break;
    case "logs.set":
      log = log.plain("#LOGS\n")
      .b("Channel: ").plain(String(event.channelId))
      break;
    case "logs.cleared":
      log = log.plain("#LOGS\n")
      .plain("Log channel removed")
      break;
    case "config.allowed_types":
      log = log.plain("#CONFIG\n")
      .b("Before: ").plain(event.before.join(", ") || "none").plain("\n")
      .b("After: ").plain(event.after.join(", ") || "none")
      break;
    case "config.whisper":
      log = log.plain("#CONFIG\n")
      .b(event.setting).plain("\n")
      .b("Before: ").plain(event.before).plain("\n")
      .b("After: ").plain(event.after)
      break;
    case "privacy.anonymized":
      log = log.plain("#PRIVACY\n")
      .plain("User unlinked their submissions")
      break;
    case "privacy.deleted":
      log = log.plain("#PRIVACY\n")
      .plain("User deleted all their data")
      break;
  }

  return log;
}

export async function log(
  api: Api,
  logsId: number | null | undefined,
  event: LogEvent,
  excludedEvents?: { excluded?: LogEventType[], get?: () => Promise<LogEventType[]> },
): Promise<void> {
  if (!logsId) return;
  if (excludedEvents && (
    (excludedEvents.excluded || (excludedEvents.get && await excludedEvents.get()))?.includes(event.type)
  )) return;
  
  try {
    const log = formatLog(event)
    await api.sendMessage(logsId, log.text, { entities: log.entities });
  } catch (e) { 
      logger.error(`Error emitting connection log: ${e}`)
   }
}
