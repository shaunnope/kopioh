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