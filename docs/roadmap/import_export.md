# Import/Export
## Overview
The import/export feature allows group admins to manage submissions in bulk. Admins can import a list of submissions from a CSV file, which will be added to the submission queue for the specified broadcast channel. This is useful for onboarding existing content or migrating from another system.

## Export
Admins can export all submissions for a broadcast channel, along with their metadata (e.g. submission time, approval status, submitter username) in an appropriate format: CSV, json etc.

At the end of each week, the bot automatically sends group admins an export of all submissions from the past week, along with their performance metrics (e.g. engagement, points awarded). This allows admins to maintain backups, analyze trends and identify top contributors.

## Import
Admins can import previously exported data, or appropriately formatted data to populate the moderation queue. Optionally, can auto approve imported submissions that have already been approved/posted, and add them to existing queues, if matched, or the default manual queue.