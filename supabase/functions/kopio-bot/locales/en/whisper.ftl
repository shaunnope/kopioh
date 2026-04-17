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
