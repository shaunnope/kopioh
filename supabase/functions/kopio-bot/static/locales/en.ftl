# --- admin.ftl ---
admin =
  .commands-updated = Bot commands updated successfully.
  .not-authorized = You are not authorized to use this command.
  .setdefault-success = ✅ Default connection set.
  .setdefault-no-connection = ⚠️ No active connection. Use /start with a connection link first.

# --- commands.ftl ---
command =
  .confirm = ✅ Confirm
  .cancel = ✗ Cancel
  .cancelled = Cancelled operation

commands =
  .start = Start or connect to a group
  .submit = Submit a message to the connected group
  .help = Learn how to use the bot
  .ping = Check if the bot is online and measure response time
  .connect = Link this group to a broadcast channel
  .disconnect = Unlink this group from its broadcast channel
  .mod = Grant a member moderator access
  .unmod = Revoke a member's moderator access
  .resetroles = Reset all connection roles
  .settemplate = Set prefix, suffix, or counter for a queue
  .setcommands = Update the bot's command menu

command-ping =
  .ping = Ping
  .pong = Pong

# --- connect.ftl ---
connect =
  .no-connection = ⚠️ No connection active. Use /start from a registered group first.
  .not-admin = You must be a group owner to use this command.
  .bot-not-admin = Operation requires the bot to be a group admin. Please grant the bot admin rights and try again.
  .verify-prompt = It seems that you're anonymous. Tap the button below to verify you are a group owner.
  .verify-button = Verify
  .forward-prompt = 🔗 Forward this message to a broadcast channel to connect it.
  .success = ✅ Connection established.
  .already-exists = ⚠️ This chat is already linked to a broadcast channel.
  .invalid-message = ⚠️ Could not read connection data from this message.
  .disconnected = ✅ Connection removed.
  .not-connected = ⚠️ This group is not connected to any broadcast channel.
  .already-connected = ⚠️ This group is already connected to a broadcast channel. Run /disconnect to remove it first.
  .not-authorized = ⚠️ You must be an admin to use this command.
  .mod-no-target = Reply to a message or mention a user to make them a moderator.
  .mod-self = ⚠️ You cannot change your own role.
  .mod-is-admin = ⚠️ { $name } is an admin and cannot be modded or unmodded.
  .mod-success = ✅ { $name } is now a moderator.
  .unmod-success = ✅ { $name } is no longer a moderator.
  .resetroles-success = ✅ Connection roles reset.

# --- content.ftl ---
content =
  .command-not-allowed = ⚠️ Bot commands aren't allowed here.
  .text-only = Please send a text message.

content-poll = Poll
  .question = Question
  .description = Description
  .explanation = Explanation
  .options = Options
  .regular = Regular
  .quiz = Quiz

# --- export.ftl ---
export =
  .not-admin = ⚠️ You must be an admin to export submissions.
  .empty = No submissions found for this connection.
  .caption = { $count } submissions exported.

# --- help.ftl ---
help = Help
  .back-button = ← Back
  .group-redirect = Send me a PM for help!
  .group-redirect-button = Click me!

help-intro =
  ☕ Hi there! I'm KPO Bot, and I help collect and post anonymous submissions to broadcast channels.

  Members submit content through their group, moderators review it, and approved posts get published to the channel. Simple, clean, and curated.

  Here's what I can do:
  • Accept text, photos, videos, polls, and more from community members
  • Route submissions through a moderation queue before they go live
  • Let moderators approve each submission

  Helpful commands:
  /start — Starts me! If you have previously linked me to a group, you can find a summary of the group here.
  /help — Sends this message!
  /getdata — View your submission history and manage your data
  /disconnect — Clear your current group connection

  Pick a topic below to learn more, or just hit /start to get going.

help-submit = ✉️ Submitting
  .desc =
    1. In your group, tap /start to open this bot in a private chat.
    2. Send any content — text, photo, video, poll, and more.
    3. Confirm your submission. It enters a review queue and will be published if approved.

help-moderate = 🗂️ Moderation
  .desc =
    Moderators can review the pending queue after connecting via /start.

    • Approve — adds the submission to the publish queue.
    • Reject — discards it.
    • Edit & approve — lets you fix content before approving.
    • Skip — returns it to the queue for later.

    Use /post to publish the next approved submission to the channel.

help-queues = 📋 Queues
  .desc = 
    Admins can set up named queues that auto-post to the channel on a schedule. Moderators assign approved submissions to a queue, and the bot posts one submission per queue each time the schedule fires.

    Creating a queue (/newqueue):
    • Choose Interval to post every N minutes between a start and end time.
    • Choose Fixed times to post at specific times each day (e.g. 09:00, 18:00).
    • Set the timezone, which days of the week to post, and a low-queue alert threshold.

    Managing queues:
    /queues — list all queues for this connection
    /deletequeue <name> — delete a queue (submissions are unassigned, not deleted)
    /viewqueue <name> — browse and edit queued submissions

    Templates:
    Queue templates let you attach a prefix and/or suffix to every post. Use { "{" }counter{ "}" } in the template to automatically number posts. Prefix is sent in bold, suffix in italic.

    Low-queue alerts:
    When the number of approved submissions in a queue drops to or below the threshold, a warning is sent to the connection's log channel (once per crossing).

help-privacy = 🔒 Privacy & Data
  .desc = Use /getdata to view your submission stats or request deletion of all data associated with your account.
command-help = 
  .usage = Usage
  .example = Example
  .examples = Examples
  .command = Command

# --- import.ftl ---
import =
  .not-admin = ⚠️ You must be an admin to import submissions.
  .prompt = Send a JSON file exported from this bot to import submissions.
  .send-json = Please send a .json document.
  .not-json = ⚠️ The file must be a .json file.
  .parse-error = ⚠️ Could not parse the file. Make sure it is a valid export from this bot.
  .empty-file = The file contains no importable submissions.
  .summary = Found { $total } submissions ({ $eligible } eligible for auto-approval). Choose how to import:
  .confirm-pending = Import all as pending
  .confirm-approve = Import & auto-approve eligible ({ $count })
  .success = ✅ Imported { $imported } submissions ({ $approved } auto-approved).

# --- moderate.ftl ---
moderate =
  .no-pending = ✅ No pending submissions right now.
  .pending_count = { $count ->
      [one] There is 1 pending submission. Let's get started.
     *[other] There are { $count } pending submissions. Let's get started.
    }
  .done = ✅ All caught up — no more pending submissions.
  .submission-meta = Submitted: { $date }
  .approve-button = ✅ Approve
  .reject-button = ✗ Reject
  .edit-button = ✏️ Edit
  .skip-button = ⏭️ Skip
  .exit-button = ✕ Exit
  .approved = ✅ Approved.
  .rejected = ✗ Rejected.
  .skipped = ⏭️ Skipped.
  .exited = Exited review.
  .not-moderator = You don't have permission to do that.
  .no-approved = No approved submissions to post.
  .post-success = ✅ Posted to channel.
  .post-queue-not-found = ⚠️ No queue named "{ $name }" found.
  .post-queue-success = ✅ Posted from queue "{ $name }".

moderate-edit =
  .prompt = Send me the replacement text.
  .prompt_caption = Send the new caption, or `-` to remove it.
  .prompt-poll = Let's edit the poll step by step.
  .text-only = Please send a text message.
  .confirm-prompt = Apply this edit and approve?
  .confirm-button = ✅ Approve with edit
  .cancelled = Edit cancelled.
  .and-approved = ✅ Edited and approved.

moderate-edit-poll =
  .question = Send the new question.
  .description = Send the new description, or `-` to remove it.
  .explanation = Send the explanation, or `-` to remove it.
  .field-too-long = ⚠️ { $field } should have at most { $limit } characters.
  .field-too-many-lines = ⚠️ { $field } should have at most { $limit } lines.
  .options = Send the options, one per line (2–12).
  .options-min = ⚠️ Please provide at least 2 options.
  .options-max = ⚠️ Please provide at most 12 options.
  .multi-prompt = Currently: { $current }. Change to?
  .multi-label = Multiple
  .single-button = Single answer
  .multiple-button = Multiple answers
  .correct-prompt = Which option is correct?
  .question-label = Qn: { $v }
  .description-label = Desc: { $v }
  .explanation-label = Explanation: { $v }
  .options-label = Options:
  .summary-multiple = Multiple answers
  .summary-single = Single answer
  .q-button = ✏️ { content-poll.question }
  .desc-button = ✏️ { content-poll.description }
  .expl-button = ✏️ { content-poll.explanation }
  .opts-button = ✏️ { content-poll.options }
  .discard-button = ↩️ Discard

# --- privacy.ftl ---
privacy =
  .summary =
    🔒 Your data:
    Submissions: { $total } total ({ $approved } approved, { $pending } pending)
    Session: { $session }
  .session-active = connected to { $group }
  .session-none = no active session
  .unlink-button = 🔓 Unlink my submissions
  .deleteall-button = 🗑️ Delete all my data
  .unlink-prompt = This will remove your identity from { $count } submission(s). This cannot be undone.
  .deleteall-prompt = ⚠️ This will permanently delete all your data: your submissions will be anonymised, your account and roles will be removed. This cannot be undone.
  .unlink-success = ✅ Done. Your identity has been removed from { $count } submission(s).
  .deleteall-success = ✅ Done. All your data has been deleted.

# --- queue.ftl ---
queue =
  .created = ✅ Queue "{ $name }" created ({ $schedule }).
  .name-taken = ⚠️ A queue named "{ $name }" already exists.
  .not-found = ⚠️ Queue not found. Use /queues to see available queues.
  .deleted = ✅ Deleted queue: { $name }
  .none = No queues set up yet. Use /newqueue to create one.
  .list-header = 📋 Queues:
  .list-item = • { $name } — every { $interval } min { $auto ->
      [true]  (auto-post on)
     *[false] (auto-post off)
    }
  .select-prompt = Which queue should this go to?
  .no-queue-button = ↷ No queue
  .not-admin = ⚠️ You need admin access to manage queues.
  .deletequeue-usage = Usage: /deletequeue <name>
  .viewqueue-usage = Usage: /viewqueue <name>
  .view-item = { $position }/{ $total } in queue
  .view-empty = 📭 No approved submissions waiting in this queue.
  .view-done = ✅ Reviewed all { $total } submission(s) in this queue.
  .edit-button = ✏️ Edit
  .skip-button = ⏭️ Skip
  .exit-button = ✕ Exit
  .edit-saved = ✅ Updated.
  .edit-cancelled = Cancelled.
  .create-name-prompt = Enter a name for the new queue:
  .create-schedule-prompt = Choose a schedule type:
  .schedule-interval-button = ⏱ Interval
  .schedule-fixed-button = 📌 Fixed times
  .create-interval-prompt = Enter posting interval in minutes (must be a multiple of 30, e.g. 60):
  .create-interval-invalid = ⚠️ Must be a positive multiple of 30 (e.g. 30, 60, 90). Try again:
  .create-start-prompt = Enter start time in HH:MM (e.g. 08:00):
  .create-end-prompt = Enter end time in HH:MM (e.g. 23:00):
  .create-time-invalid = ⚠️ Invalid time. Use HH:MM format (e.g. 09:30). Try again:
  .create-times-prompt = Enter posting times as comma-separated HH:MM (e.g. 09:00,12:00,18:00):
  .create-times-invalid = ⚠️ Invalid times. Use comma-separated HH:MM values (e.g. 09:00,12:00). Try again:
  .create-timezone-prompt = Enter a timezone (e.g. Asia/Singapore, America/New_York), or tap UTC for the default:
  .create-timezone-invalid = ⚠️ Unknown timezone. Try again (e.g. Asia/Singapore):
  .create-days-prompt = Which days should this queue post? Tap "Every day" or type day names (e.g. Mon,Tue,Wed,Thu,Fri):
  .create-days-everyday = 📅 Every day
  .create-days-invalid = ⚠️ Invalid days. Use day names separated by commas (e.g. Mon,Tue,Fri) or type "all". Try again:
  .create-threshold-prompt = How many submissions remaining should trigger a low-queue alert?
  .create-threshold-default = 5 (default)
  .create-threshold-off = 0 (off)
  .empty-warning = ⚠️ { $remaining } submission(s) left in queue { $name }.
  .settemplate-usage = Usage: /settemplate <queue name>
  .template-header = Template for "{ $name }":
  .template-current-prefix = Prefix: { $value }
  .template-current-suffix = Suffix: { $value }
  .template-counter-on = Counter: on
  .template-counter-off = Counter: off
  .template-none = (none)
  .template-prefix-prompt = Enter a new prefix, or tap a button:
  .template-suffix-prompt = Enter a new suffix, or tap a button:
  .template-counter-prompt = Use auto-incrementing { "{counter}" } placeholder?
  .template-skip-button = → Keep current
  .template-clear-button = ✕ Clear
  .template-yes-button = ✓ Yes
  .template-no-button = ✕ No
  .template-cancel-button = ✕ Cancel
  .template-saved = ✅ Template saved.

# --- settings.ftl ---
settings =
  .title = ⚙️ Settings — { $group }
  .summary = { $enabled }/{ $total } content types enabled • Whisper: { $whisper }
  .is-disabled = Disabled


  .whisper-active-label = { $limit } per { $period }
  .whisper-is-disabled = { settings.is-disabled }

  .types-header = 📋 Content Types
  .types-hint = Toggle which types users may submit and whisper.
  .section-types = 📋 Types
  .section-whisper = { whisper.title }

  .whisper-header = { settings.section-whisper } Settings

  .whisper-disabled-desc = Users cannot post anonymous messages to this group.

  .whisper-desc = Users can post anonymous messages to the group. The rate limit controls how many whispers a user may send within a given time period.

  .whisper-allowed-label = Allowed types:

  .whisper-enable-button = 🔔 Enable Whisper
  .whisper-disable-button = 🔇 Disable Whisper
  .whisper-limit-button = Limit: { $limit } →
  .whisper-period-button = Period: { $period } →
  .whisper-types-button = Set Types
  .whisper-types-hint = Toggle which types users may whisper.

  .section-warnings = ⚠️ Warnings
  .warnings-header = ⚠️ Warning Settings
  .warn-threshold-temp-button = Temp Ban after: { $threshold } warnings →
  .warn-threshold-perm-button = Perm Ban after: { $threshold } warnings →
  .temp-ban-days-button = Temp Ban Duration: { $days } days →

  .section-logs = 📋 Log channel

  .logs-header = 📋 Log Channel
  .logs-none = No log channel configured.
  .logs-active = Currently logging to: { $channel }
  .logs-set-button = Set log channel
  .logs-change-button = Change channel
  .logs-remove-button = ✕ Remove log channel
  .logs-filters-button = ⚙️ Event filters

  .logs-forward-prompt = Forward any message from the channel you want to use as the log channel.
  .logs-forward-invalid = ⚠️ That doesn't look like a channel message. Please forward a message directly from a Telegram channel.
  .logs-no-permission = ⚠️ The bot can't post to that channel. Add the bot as an admin and try again.
  .logs-set-success = ✅ Log channel set to { $channel }.
  .logs-remove-success = ✅ Log channel removed.

  .logs-filters-header = ⚙️ Event Filters
  .warnings-summary = ⚠️ Temp: { $temp } warns • Perm: { $perm } warns • { $days }d temp ban
  .logs-summary-none = 📋 Log channel: not configured
  .logs-summary-active = 📋 Log channel: active

  .back-button = ← Back
  .close-button = ✕ Close
  .not-admin = ⚠️ You need admin access to change settings.
  .type-not-allowed = ⚠️ That content type is not allowed here. Please send something else.

# --- submit.ftl ---
submit =
  .prompt = What would you like to submit?
  .send-content = Please send a message or poll, not a command.
  .type-not-allowed = ⚠️ That content type isn't allowed here. Please send something else.
  .confirm-prompt = Ready to submit this?
  .confirm-button = ✅ Submit

  .success = ✅ Your submission is now under review.
  .cancelled = Submission cancelled.

# --- symbols.ftl ---
sym =
  .warning = ⚠️
  .success = ✅
  .cancel = ✗
  .skip = ⏭️
  .return = ↩️

# --- unhandled.ftl ---
unhandled = Try /start
  .command = Unrecognized command. {unhandled}
  .text = Unrecognized input. {unhandled}

# --- units.ftl ---
unit =
  .ms = ms

# --- userinfo.ftl ---
userinfo = User
  .button = 👤 User Info
  .header = 👤 User
  .role = Role:
  .warnings = Warnings:
  .stats = Submissions: { $total } total · { $approved } approved · { $pending } pending
  .forward-hidden = This user's account is hidden here — their ID is not available.
  .not-admin = You must be a connection admin to use this.

userinfo-ban = Ban:
  .none = none
  .temp = until { $date }
  .perm = permanent

command-userinfo = userinfo
  .usage = /{ command-userinfo } <user_id>

# --- warn.ftl ---
warn =
  .reject-warn-button = ⚠️ Warn
  .reason-prompt = Enter a reason for this warning, or tap Skip:
  .skip-reason-button = Skip
  .issued = ⚠️ Warning { $count }/{ $threshold }.
  .banned-temp = 🚫 Temporarily banned ({ $count } warnings). Expires { $date }.
  .banned-perm = 🚫 Permanently banned ({ $count } warnings).
  .submit-banned-temp = 🚫 You are temporarily banned from submitting. Your ban expires on { $date }.
  .submit-banned-perm = 🚫 You have been permanently banned from submitting content.
  .notify-issued = ⚠️ You received a warning ({ $count }/{ $threshold }). Reason: { $reason }
  .notify-temp = 🚫 You have been temporarily banned ({ $count } warnings). Ban expires: { $date }. Reason: { $reason }
  .notify-perm = 🚫 You have been permanently banned ({ $count } warnings). Reason: { $reason }
  .notify-no-reason = No reason given.
  .remove-success = ✅ Removed { $removed } warning(s). User now has { $remaining } warning(s).
  .remove-none = ℹ️ This user has no warnings to remove.
  .unwarn-invalid-id = ⚠️ Usage: /unwarn <user_id>
  .clearwarns-invalid-id = ⚠️ Usage: /clearwarns <user_id>

# --- welcome.ftl ---
welcome =
  👋🏻 Hi there! I'm <b>KPO Bot</b>.
  I help collect and moderate anonymous submissions for Telegram channels.

  To get started, open a group that uses me and use /start — it'll bring you right back here with everything set up.
  Use /help to learn more.
  .commands = COMMANDS
  .help = 👋🏻 Hi there! To use me, send me a private message.
  .not-connected-prompt = This group isn't connected to a broadcast channel yet. Use /connect to set it up.
  .help-button = Open private chat
  .submit-ready = 👋🏻 Hi there! You're all set to submit a post.
  .connected-to = 📌 { $group }
  .choose = What would you like to do?
  .choose-submit = ✉️ Submit
  .choose-whisper = 💬 Whisper
  .choose-review = 🗂️ Review
  .choose-settings = ⚙️ Settings
  .choose-disconnect = 🔌 Disconnect
  .user-stats = Your submissions: { $pending } pending • { $approved } approved
  .mod-pending = Pending review: { $count }
  .disconnect-confirm = Disconnect from this group? You can reconnect anytime via /start in the group.
  .disconnect-confirm-button = Yes, disconnect
  .disconnected = ✅ Disconnected. To connect again, use /start in a group with me.

welcome-choose = What would you like to do?
  .submit = ✉️ Submit
  .whisper = 💬 Whisper
  .review = 🗂️ Review
  .settings = ⚙️ Settings
  .disconnect = 🔌 Disconnect

# --- whisper.ftl ---
whisper = Whisper
  .header = 💬
  .title = { whisper.header } { whisper }
  .prompt = 💬 Send your whisper. It will be posted anonymously in the group.
  .confirm-prompt = Post this anonymously to the group?
  .success = ✅ Your whisper has been posted.
  .rate_limited = You've reached your whisper limit ({ $limit } per { $period }). Try again later.
  .disabled = ⚠️ Whispers are disabled for this group.
  .anonymous-label = 💬 Anonymous

setwhisper =
  .arg-limit = limit
  .arg-period = period
  .desc-limit = 
  whole number, 1-100
  The maximum number of whispers allowed per user within the configured period.
  .desc-period = number + unit
  The period of consideration when limiting whispers. Should be an interval less than 3 months.
  Allowed units: 
  .desc-omit_unit = Omit unit → minutes
  .desc-omit_period = Omit period → 1h
  .invalid-period = ⚠️ Invalid period. Use a number with a unit: 
  .invalid-limit = ⚠️ Limit must be a whole number from 0 to 100.
  .period-too-long = ⚠️ Period cannot exceed 3 months.
  .not-admin = ⚠️ You need admin access to change whisper settings.
  .success = ✅ Whisper limit set: { $limit } per { $period }.
