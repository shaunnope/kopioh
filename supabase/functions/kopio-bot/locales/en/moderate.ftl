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
