# Roadmap
This document outlines some planned features for Kopio.

## Core Functionality
Kopio collects user submitted content (e.g. polls, messages) and schedules the submissions to be posted on a broadcast channel

Before submissions are posted, authorized moderators will review/edit these submissions, and may choose to reject them.

Posting schedule can be configured by authorized admin users.

## Bot Availability
Kopio is readily operational in most of Telegram's chat contexts
- Private chats
- Groups, supergroups, topics
- Broadcast channels

The bot may be added to any chat/group/channel, and may be made admins in groups/channels

## Bot Usage: Linking Chats/Channels
Kopio functions over defined chat connections.
A connection is a set `<broadcast, submit, logs>`, where:
- `broadcast` is a channel where Kopio broadcasts approved submissions
- `submit` is a group/topic where users can initiate submission requests
- `logs` is a channel/group/topic where actions in `broadcast` and `submit` can be logged

### Multiplicity
For distinct `<broadcast, submit, logs>` connections, the following conditions hold:
- `<broadcast, submit>` pairs are distinct
- Each `submit` is only associated with one `broadcast`
- Each `broadcast` may have multiple `submit`

### Submission Flow
When the `\start` command is sent in a `submit` chat, the bot replies with an inline link to the bot's private chat, with a connection reference. The command message is immediately deleted. The reply with the inline link is deleted one minute later.

Users who wish to post a submission on `broadcast` can use the inline link to initiate a private chat with the bot. In the private chat, the user will send one poll/message. To which the bot replies with a confirmation, and the submission is added to the approval queue for `broadcast` upon user confirmation.

- User sends `\start` in a `submit` chat
- Bot deletes command and replies with inline link to private chat, with connection reference
- User clicks link, initiates private chat with bot
  - Bot deletes the initial reply after one minute

In private chat:
- Bot prompts user of source `submit` chat and requests submission content (poll or message)
- User sends content
- Bot replies with confirmation message, showing content and source `submit` chat
- User confirms submission
- Bot adds submission to approval queue for associated `broadcast`
  - Deletes user's submission message and confirmation message in private chat

### Moderation Flow
Pending submissions in the queue are surfaced to moderators in `logs`.
Authorised moderators in `submit` can use the inline link to initiate a chat with the bot. Unlike regular users, they will be prompted if they want to "Submit" or "Approve" submissions.

Moderators can see the number of pending submissions for the associated `broadcast`.

For each submission, a moderator may:
- **Approve** — submission is placed into the posting schedule for `broadcast`
- **Reject** — submission is discarded; submitter may be notified
- **Edit** — moderator may edit the content before approving
- **Skip** - Skip processing a submission for now

### Posting/Scheduling Flow

Approved submissions are held in a queue and posted to `broadcast` according to the configured posting schedule.

Each `broadcast` defines `<queues, freq>`, where:
- Approved submissions are assigned a posting `queue`
- Each queue has a defined posting frequency: e.g. hourly, from 9am to 10pm.

For each `broadcast`, admin users may configure:
- Posting frequency (e.g. max N posts per day)
- Posting time windows (e.g. only post between 9am–9pm)
- Manual override to post immediately or defer a scheduled post

### Roles

| Role | Scope | Capabilities |
|---|---|---|
| User | Per `submit` chat | Submit content |
| Moderator | Per `broadcast` | Review and action submissions |
| Admin | Per `broadcast` | Configure schedule, manage moderators |

Channel/group owners in a `broadcast` or `submit` chat are automatically assigned an `admin` role for the associated `broadcast`

Roles are scoped to a connection. A user may hold different roles across different connections.

---

## Point System with Dynamic Multipliers
- Base 10 points per approved submission  
- +5 points if content gets >50 votes in poll  
- +15 points if post gets shared by moderator to another channel  
- +20 points if user’s content is reposted as “Top Submission of the Week”  
- **Streak bonus**: 3 consecutive days submitting = +25 bonus points  
- Points reset weekly but leaderboard persists  
- Points can be redeemed for:  
  - Priority review (skip queue)  
  - Custom badge in group  
  - Ability to submit 2 posts in one day (normally 1)  

---

**3. Smart Moderation Dashboard (For Approved Mods)**  
- **Queue view**: Submissions sorted by predicted engagement (AI score based on past performance of similar tags/content)  
- **One-click actions**: Approve, Reject, Schedule (with time picker), Send Back for Edit  
- **Auto-flagging**: Detects spam keywords, excessive caps, banned phrases, duplicate content from last 7 days  
- **Moderator reputation**: Each mod gets a “review accuracy” score based on how often their approved posts perform well (engagement > group avg). Top 3 mods get “Elite Mod” badge and bonus points.  

---

**4. Scheduled Publishing Engine**  
- Posts are queued with optimal timing based on:  
  - Historical engagement by day/time (e.g., polls perform best Tue/Thu 7–9 PM)  
  - Content type (polls scheduled 2 hours before peak traffic)  
  - Avoiding overlap with other top posts  
- Auto-reschedule if a post is rejected and re-submitted  
- “Last-Minute Emergency Post” override: mods can bypass queue for urgent announcements  

---

**5. Engagement Analytics Feed (Public in Group)**  
Every time a post goes live, bot sends a mini-report to the group:  
> 📊 *“Top Submission: ‘Should AI own copyright?’ (Poll) — 1,243 votes, 87% agree. Submitted by @user123 (+45 pts). 12 shares.”*  
> 🔥 *Trending Tags this week: #tech #debate #memes*  

This fuels FOMO and encourages more submissions.

---

**6. “Submission of the Week” Spotlight**  
Every Monday, bot auto-selects the top 3 most-engaged submissions from last week and posts them in the broadcast channel as a carousel:  
- Top poll (most votes)  
- Top text post (most reactions)  
- Most controversial (most opposing votes)  

Each gets a pinned comment: “Submitted by [@user] — 287 points this week!”  
Winner gets a custom emoji + permanent “Weekly Champion” role in group.

---

**7. Reputation & Trust System**  
- New users: 1 submission/day, no polls  
- After 5 approved posts: unlock polls + 2/day limit  
- After 10 approved + 100+ points: become “Trusted Contributor” — can submit without moderation (auto-approved)  
- 3 rejections in 30 days: 7-day submission freeze  

---

**8. Bot-Generated “Content Inspiration” Alerts**  
Every 3 days, bot DMs inactive users:  
> “Hey @user — your last post got 82 votes! Want to try a poll on ‘Best sci-fi movie of 2025’? 15 points waiting.”  

Uses past behavior to nudge users toward high-performing content types.

---

**9. Anonymous Submission Option**  
Users can choose to submit “Anonymous” — content still gets posted, but their username is hidden. Points still awarded. Appeals to users who fear backlash but still want to contribute.

---

**10. Monthly “Point Cashout” Event**  
Top 10 users by points get:  
- Real-world perks (e.g., premium Discord role, merch discount codes, shoutouts in partner channels)  
- Or: “Donate points” option — convert points to charity donation (bot partners with NGOs, e.g., 100 pts = $1 donated)  

---

This system turns passive group members into active content creators, rewards quality over quantity, and gives moderators powerful tools to scale without burnout. The point economy creates a self-sustaining loop: more submissions → more engagement → more points → more loyalty → more content.

## Expanded Message Types
Add support for different types of messages, beyond text and polls.

### Image, Video, Audio, etc.
Message content consists of file(s) uploaded to Telegram's servers, which may be downloaded/reused.
- Own download, storage of files not needed.

`file_id`s appear to be persistent but specific to each bot. When a message with media content is received, ensure `file_id` is stored for subsequent referencing.

Sending of media message will require proper dispatching of `Send` method, by media type.

## Whisper
To support anonymous posting, the bot also allows users to send anonymous responses to the connected group, via a PM.

With an active connection, send content to be posted, with confirmation.

Users can only whisper N times within a configurable period.

## Connection Configuration
Each connection has a set of configuration options available, of which, admins for the connection may modify:
- Types of content that can be supported
- User whisper limit + reset period

## Default Connection
To simplify the user experience, a default connection may be set. When a user initiates a chat with the bot without a connection reference, the bot will use the default connection for any submission.

## Queues
Group admins can define multiple queues for a broadcast channel, each with its own posting frequency. Approved submissions will be assigned to a queue, and posted according to the queue's schedule.

Moderators can choose which queue to assign an approved submission to, based on the content and desired posting frequency.

### Ordering in Queues
Within each queue, submissions are ordered by submission time. Newer submissions are added to the end of the queue. When a submission is posted, the next submission in the queue becomes the new head of the queue.

### Viewing Queues
After submissions are approved, moderators can browse and review / reedit submissions in each queue before they are posted.

## Cron
A check will be made every 30 mins to determine if there are any submissions that need to be posted to any broadcast channels, based on the posting schedule of each queue. If there are, the submission will be posted, and removed from the queue.

## Weekly Summary
Every week, a summary of the past week's submissions and their performance (e.g. engagement metrics) can be automatically generated and posted to the broadcast channel.

## Warnings
To maintain quality of submissions, the bot can issue warnings to users whose submissions are rejected. After a certain number of warnings, a user may be temporarily or permanently banned from submitting content.

### Removing warnings
Users can have warnings removed by an admin's discretion. This allows users to redeem themselves and encourages continued participation.

### Warning reasoning
When issuing a warning, the bot will log the reason for the warning (e.g. "Inappropriate content", "Spam", "Off-topic"). This helps admins track common issues and provides transparency to users.

### Warning notifications
When a user receives a warning, they will be notified via a private message from the bot, explaining the reason for the warning and how to avoid future warnings. This helps educate users on submission guidelines and promotes better content quality.

### Configurable warning thresholds and penalties
Admins can configure the number of warnings a user can receive before penalties are applied, as well as the duration of any temporary bans. This allows for flexibility in moderation policies based on the specific needs of the group.