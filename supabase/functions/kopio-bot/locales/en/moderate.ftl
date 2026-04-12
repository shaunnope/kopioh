moderate =
  .no_pending = ✅ No pending submissions right now.
  .pending_count = { $count ->
      [one] There is 1 pending submission. Let's get started.
     *[other] There are { $count } pending submissions. Let's get started.
    }
  .done = ✅ All caught up — no more pending submissions.
  .submission_text = { $text }
  .submission_poll = 📊 Poll: { $question }
  .submission_media = { $type }: { $caption }
  .submission_no_caption = { $type } (no caption)
  .approve_button = ✅ Approve
  .reject_button = ✗ Reject
  .edit_button = ✏️ Edit
  .skip_button = ⏭️ Skip
  .exit_button = ✕ Exit
  .approved = ✅ Approved.
  .rejected = ✗ Rejected.
  .skipped = ⏭️ Skipped.
  .exited = Exited review.
  .edit_prompt = Send me the edited content.
  .edit_confirm_prompt = Apply this edit and approve?
  .edit_confirm_button = ✅ Approve with edit
  .edit_cancel_button = ✗ Cancel
  .edit_cancelled = Edit cancelled.
  .edited_and_approved = ✅ Edited and approved.
  .not_moderator = You don't have permission to do that.
  .no_approved = No approved submissions to post.
  .post_success = ✅ Posted to channel.
