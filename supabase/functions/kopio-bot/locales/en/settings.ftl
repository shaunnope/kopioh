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
