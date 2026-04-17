# Moderation: Editing Submissions

Moderators can edit pending submissions to correct any issues before they are approved. This can include fixing formatting, correcting typos, or adding missing information.

Edits should retain the original submission type: text, media, poll, etc.

## Overview
The basic workflow for moderators is to copy the original text of the submission, make necessary edits, and confirm changes.

During the edit process, users may choose to cancel the edit if they change their mind, which will leave the original submission unchanged.

### Text Submissions
1. Select 'Edit'
2. Bot prompts for the new text content. + inline cancel
3. Moderator submits the edited text.
4. Bot prompts for confirmation
5. Mod selects 'Confirm'
6. Bot updates the submission.
    - Delete prompt sent in (2)


### Media Submissions
1. Select 'Edit'
2. Bot prompts for the new caption. + inline cancel
3. Moderator submits the edited caption.
4. Bot prompts for confirmation
5. Mod selects 'Confirm'
6. Bot updates the submission. (changes the caption)
    - Delete prompt sent in (2)

### Poll Submissions
1. Select 'Edit'
2. Bot sends a summary of the current fields of the poll. + inline keyboard
    - Summary includes:
        - Question, Description
        - List of options
    - Inline Keyboard
        - Edit question
        - Edit description
        - Edit options
        - Toggle `Multiple`
        - Approve
        - Reject
        - Discard changes
        - Cancel

On selecting an `Edit` option,
1. Bot prompts for the new (formatted) text
2. Moderator submits edited text.
3. Bot deletes the message in (2), and updates the summary message

On selecting a `Toggle`, bot toggles the current option value

On `Reject`, mark the submission as rejected
On `Approve`, check if values have been modified, save the modified content, and mark as approved

On `Cancel`, discard modifications and leave submission as pending