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

warn-appeal = 📣 Appeal
  .prompt = Describe why you believe this warning was issued in error:
  .sent = ✅ Your appeal has been submitted. You'll be notified of the outcome.
  .already = ℹ️ You've already submitted an appeal for this warning.
  .notify-lifted = ✅ Your appeal was accepted. The warning has been removed.
  .notify-rejected = ❌ Your appeal was rejected. Reason: { $reason }

warn-appeal-info = 📣 Appeal from
  .warning-label = Warning:
  .appeal-label = Appeal:
  .lift-button = ✅ Lift Warning
  .reject-button = ❌ Reject Appeal
  .lifted = ✅ Warning lifted. User has been notified.
  .reject-prompt = Enter a reason for rejecting this appeal:
  .reject-success = ✅ Appeal rejected. User has been notified.
  .expired = ℹ️ This appeal is no longer active.

warnings = ⚠️ Warnings
  .none = No warnings.
  .count = { $count } warning(s)
  .appeal-pending = [appeal: pending]
  .appeal-lifted = [appeal: lifted]
  .appeal-rejected = [appeal: rejected]
  .appeal-rejected-reason = [appeal: rejected — { $reason }]
  .not-admin = You must be a connection admin to look up other users' warnings.

command-warnings =
  .usage = /warnings <user_id>
