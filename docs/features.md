# Kopio Bot Documentation

## Core Architecture

Kopio collects user-submitted content (polls, messages, media) and schedules it for broadcast to channels after moderator review.

### Connections

A connection is a triple `<broadcast, submit, logs?>` where:
- **broadcast**: Channel for approved submissions
- **submit**: Group/topic where users initiate submissions
- **logs**: Channel for action logging (optional)

Multiplicity rules: `<broadcast, submit>` pairs are distinct; each `submit` links to one `broadcast`; each `broadcast` may have multiple `submit` chats [2].

### Roles

| Role | Scope | Capabilities |
|------|-------|--------------|
| User | Per submit chat | Submit content |
| Moderator | Per broadcast | Review/action submissions |
| Admin | Per broadcast | Configure schedule, manage moderators |

Channel/group owners automatically receive admin role.

---

## Submission Flow

1. User sends `/start` in submit chat → bot deletes command, replies with inline link to private chat (reply deleted after 1 min)
2. User clicks link → private chat opens with connection reference
3. User sends content (poll/message/media)
4. Bot shows confirmation with content preview
5. User confirms → submission enters approval queue
6. Bot deletes submission and confirmation messages

### Content Types

- Text, polls, images, video, audio
- Media uses Telegram `file_id` (persistent per bot, no local storage needed)

### Whispers (Anonymous Submissions)

- Users can anonymously post to connected group via PM
- Configurable limit N per period
- Logs do not reveal submitter identity

---

## Moderation

### Review Actions

Moderators may: **Approve**, **Reject**, **Edit**, **Skip** pending submissions

### Editing Submissions

**Text/Media:**
1. Select 'Edit' → bot prompts for new text/caption (with inline cancel)
2. Moderator submits edited content
3. Confirm → bot updates submission, deletes prompt

**Polls:**
1. Select 'Edit' → bot shows summary (question, description, options) with inline keyboard
2. Edit options: question, description, options, toggle `Multiple`
3. Actions: Approve (saves changes), Reject, Discard changes, Cancel

### Warnings System

- Issued for rejected submissions with logged reasons
- Configurable thresholds and penalties (temporary/permanent bans)
- Admins can remove warnings at their discretion
- Users notified via PM with reason and guidance

---

## Posting & Scheduling

### Queues

- Multiple queues per broadcast, each with posting frequency
- FIFO ordering by submission time
- Moderators assign submissions to queues
- Moderators can browse/re-edit queued submissions

### Cron

Every 30 minutes, check for submissions due for posting based on queue schedules.

---

## Connection Logs

### Setup

Each connection can register one log channel for structured audit trail.

**Setting up:**
1. Admin taps [Log channel] in settings
2. Bot requests forwarded message from target channel
3. Bot reads `forward_origin.chat.id`, validates write permissions (test message)
4. On success: saves channel ID, emits `LOGS SET` log entry
5. On failure: prompts admin to add bot as channel admin

### Log Format

```
#LABEL
info1: value
info2: value
⋮
```

Submission IDs truncated to 8 hex characters.

### Event Types

| Category | Events |
|----------|--------|
| **Submission** | `NEW`, `APPROVED`, `REJECTED`, `SKIPPED`, `POSTED` (manual), `AUTO-POSTED` |
| **Whisper** | `WHISPER` (content type only, no user info) |
| **Role** | `ROLE ADDED`, `ROLE REMOVED` |
| **Connection** | `CONNECTED`, `DISCONNECTED`, `LOGS SET`, `LOGS CLEARED` |
| **Config** | Allowed types, whisper limit/period changes |
| **Privacy** | Submissions anonymized, user data deleted |

### Event Filtering

Blocklist-based: empty array = all events logged. Storage in `connection_config.log_excluded_events TEXT[]`

Defaults: `whisper.new` excluded (noisy), `queue.low` enabled (actionable).

Settings UI: toggle grid grouped by category.

---

## Configuration

### Per-Connection Options (Admin)
- Allowed content types
- Whisper limit + reset period
- Default connection (for users without connection reference)
- Log channel + event filters

### Per-Broadcast Options
- Posting frequency (max posts/day)
- Time windows (e.g. 9am–9pm)
- Manual override (post immediately/defer)

---

## Import/Export

### Export
- Export all submissions with metadata (time, status, submitter) as CSV/JSON
- Weekly auto-export with performance metrics to admins

### Import
- Import CSV to populate moderation queue
- Option to auto-approve previously approved/posted submissions
- Match to existing queues or assign to default manual queue

---

## Database Notes

- `logs_id BIGINT` exists on `connections` table (nullable)
- Connection queries must return `logs_id`
- `connection_config` table includes `log_excluded_events TEXT[]`

### Key Functions

**Connection logging:**
```typescript
setLogsChannel(connectionId, logsId)
clearLogsChannel(connectionId)
setLogExcludedEvents(connectionId, excluded)
```

**Log utility** (`bot/log.ts`): fire-and-forget, failures never interrupt main flow.

---

## Planned Features

- Point system with dynamic multipliers and streak bonuses
- Smart moderation dashboard (AI engagement scoring, auto-flagging)
- Engagement analytics feed
- Weekly "Submission of the Week" spotlight
- Reputation & trust system (progressive privileges)
- Weekly summary with performance metrics