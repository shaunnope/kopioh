# Connection Logs Channel

Each connection can register one log channel where the bot sends a structured audit trail of events — submissions, moderation actions, role changes, config updates, and more.

---

## 1. Database

`logs_id BIGINT` already exists on the `connections` table (nullable). No migration needed.

Two new functions in `database/connection.ts`:

```typescript
setLogsChannel(connectionId: string, logsId: number): Promise<void>
clearLogsChannel(connectionId: string): Promise<void>
```

`getConnectionBySubmitId()` must be updated to also return `logs_id` — it currently omits it. Any other connection-fetching queries used in feature files need the same update.

---

## 2. Log Utility

Lives at `bot/log.ts`. Fire-and-forget — a logging failure must never interrupt the main bot flow.

```typescript
export async function log(
  api: Api,
  logsId: number | null,
  event: LogEvent,
): Promise<void> {
  if (!logsId) return;
  try {
    await api.sendMessage(logsId, formatLog(event), { parse_mode: 'HTML' });
  } catch {
    // swallow silently
  }
}
```

`LogEvent` is a discriminated union — one variant per event type (see section 3). `formatLog()` maps each variant to a formatted string.

---

## 3. Events and Log Format

Each log message follows the pattern:

```
<b>[LABEL]</b> short description
detail line (where relevant)
```

Submission IDs are truncated to 8 hex characters for readability.

### Submission lifecycle

| Event | Label | Detail |
|---|---|---|
| Submission created | `NEW` | Content type, submitter display name, short ID |
| Submission approved | `APPROVED` | Moderator name, queue name or "manual" |
| Submission edited + approved | `EDITED` | Moderator name, queue name or "manual" |
| Submission rejected | `REJECTED` | Moderator name |
| Submission skipped | `SKIPPED` | Moderator name |
| Submission posted (manual) | `POSTED` | Via `/post` command, moderator name |
| Submission posted (auto) | `AUTO-POSTED` | Queue name |

Example:
```
<b>[APPROVED]</b> Submission a1b2c3d4 approved
By: @moderator • Queue: Morning Slot
```

### Whispers

Whisper logs must not reveal the submitter's identity.

| Event | Label | Detail |
|---|---|---|
| Whisper created | `WHISPER` | Content type only — no user info |

Example:
```
<b>[WHISPER]</b> Anonymous submission received
Type: text
```

### Role management

| Event | Label | Detail |
|---|---|---|
| Role assigned | `ROLE ADDED` | Target user, role name, assigned by |
| Role removed | `ROLE REMOVED` | Target user, removed by |

### Connection

| Event | Label | Detail |
|---|---|---|
| Connection created | `CONNECTED` | Broadcast ID, submit chat ID |
| Connection deleted | `DISCONNECTED` | — |
| Log channel set | `LOGS SET` | Channel ID |
| Log channel cleared | `LOGS CLEARED` | — |

### Config changes

| Event | Label | Detail |
|---|---|---|
| Allowed types changed | `CONFIG` | Old types → new types |
| Whisper limit changed | `CONFIG` | Old value → new value |
| Whisper period changed | `CONFIG` | Old value → new value |

Example:
```
<b>[CONFIG]</b> Allowed types updated
Before: text, photo • After: text, photo, video
```

### Privacy

These log to the channel even though the user may be deleting data — the log records the action took place, not any content.

| Event | Label | Detail |
|---|---|---|
| Submissions anonymized | `PRIVACY` | "User unlinked their submissions" |
| User data deleted | `PRIVACY` | "User deleted all their data" |

### Event Filtering

Admins can suppress specific event categories. The config is a blocklist — only excluded types are stored, so an empty array means all events are logged (the default).

#### Storage

Add a column to `connection_config`:

```sql
ALTER TABLE connection_config
  ADD COLUMN log_excluded_events TEXT[] NOT NULL DEFAULT '{}';
```

New functions in `database/config.ts`:

```typescript
setLogExcludedEvents(connectionId: string, excluded: LogEventType[]): Promise<void>
```

`getConnectionConfig()` already returns the full config row — adding the column makes it available automatically.

#### Event type identifiers

Canonical string literals used as discriminant values in `LogEvent` and stored in the blocklist:

| Category | Type string |
|---|---|
| Submission | `submission.new`, `submission.approved`, `submission.edited`, `submission.rejected`, `submission.skipped`, `submission.posted`, `submission.auto_posted` |
| Whisper | `whisper.new` |
| Queue | `queue.low` |
| Role | `role.added`, `role.removed` |
| Connection | `connection.created`, `connection.deleted`, `logs.set`, `logs.cleared` |
| Config | `config.allowed_types`, `config.whisper` |
| Privacy | `privacy.anonymized`, `privacy.deleted` |

#### Log utility integration

`log()` gains an `excludedEvents` parameter. The check is a fast array inclusion test before any formatting work:

```typescript
export async function log(
  api: Api,
  logsId: number | null,
  excludedEvents: LogEventType[],
  event: LogEvent,
): Promise<void> {
  if (!logsId || excludedEvents.includes(event.type)) return;
  try {
    await api.sendMessage(logsId, formatLog(event), { parse_mode: 'HTML' });
  } catch { /* swallow */ }
}
```

Callers already hold the connection config object, so `excludedEvents` is available alongside `logs_id` at every call site.

If no `connection_config` row exists yet (e.g., during `connection.created`), treat `excludedEvents` as `[]`.

#### Settings UI

Toggle grid grouped by category, displayed under the log channel screen:

```
Event filters
──────────────────
Submissions
[✅ New] [✅ Approved] [✅ Rejected] [✅ Skipped] [✅ Posted]

Whispers & Queues
[✗ Whisper new] [✅ Queue low]

Roles & Config
[✅ Role changes] [✅ Config changes]

Privacy
[✅ Privacy actions]

[← Back]
```

Tapping a button toggles the type in/out of the exclusion list and calls `setLogExcludedEvents()`. `whisper.new` is excluded by default — it can be noisy on high-volume connections. `queue.low` is enabled by default since it requires action.

---

## 4. Log Channel Registration

### Setting the channel
In the settings menu, add a "Log channel" entry. Flow:

1. Admin taps **[Log channel]** in settings
2. Bot replies: "Forward any message from the channel you want to use as the log channel."
3. Admin forwards a message from the target Telegram channel
4. Bot reads `forward_origin.chat.id` from the forwarded message
5. Bot validates it can post there by sending and immediately deleting a test message
6. On success: calls `setLogsChannel(connectionId, chatId)`, sends confirmation, and emits a `LOGS SET` log entry
7. On failure (bot lacks permissions): bot reports the error and prompts admin to add it as an admin to the channel first

### Clearing the channel
Settings menu shows **[Remove log channel]** when one is set. Tapping it calls `clearLogsChannel()` and confirms.

### Settings menu display
```
Log channel
──────────────────
Currently logging to: @mychannel_logs

[Change channel]  [Remove log channel]  [← Back]
```

If none is set:
```
Log channel
──────────────────
No log channel configured.

[Set log channel]  [← Back]
```

---

## 5. Wiring Events

Each feature file gains a `log(ctx.api, connection.logs_id, event)` call after each state-mutating operation. Since `logs_id` must now be returned by connection queries, feature files that already have the connection object get it for free.

Files to update:

| File | Events to wire |
|---|---|
| `submit.ts` | `NEW` |
| `whisper.ts` | `WHISPER` |
| `moderate.ts` / `moderateV2.ts` | `APPROVED`, `EDITED`, `REJECTED`, `SKIPPED`, `POSTED` |
| `connect.ts` | `CONNECTED`, `DISCONNECTED`, `ROLE ADDED`, `ROLE REMOVED` |
| `settings.ts` | `CONFIG` (all config mutations), `LOGS SET`, `LOGS CLEARED` |
| `privacy.ts` | `PRIVACY` |
| Cron handler (future) | `AUTO-POSTED`, `LOW QUEUE` |

---

## 6. Implementation Order

1. **Migration** — add `log_excluded_events TEXT[]` to `connection_config`
2. **Database** — update connection queries to return `logs_id`; add `setLogsChannel` / `clearLogsChannel`; add `setLogExcludedEvents`
3. **Log utility** — `bot/log.ts`: `LogEvent` union + `LogEventType` literals, `formatLog()`, `log()`
4. **Settings UI** — log channel section + event filter toggles in `settings.ts`
5. **Event wiring** — add `log()` calls in each feature file

---

## Open Questions

- **Message threading**: If the log channel is a supergroup with topics, should logs go to a specific topic? (Omit for v1 — post to the default/general topic.)
