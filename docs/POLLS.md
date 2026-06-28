# Polls

Polls let staff post a clean Discord button vote, store votes in the database, and keep the poll working after CorePanel restarts.

## What exists now

- Dashboard poll builder with a live Discord-style preview.
- Button voting with up to 10 options.
- Optional emoji on each option button.
- Draft polls that can be published later.
- Scheduled polls that publish automatically while the bot is running.
- Optional end time, or manual close.
- Single-choice polls where clicking another button changes the member's vote.
- Multiple-choice polls where members can toggle more than one option.
- Optional required role.
- Optional anonymous dashboard results.
- Public live results, results after close, or hidden public results.
- Slash commands for quick staff use.

## Create a poll from the dashboard

1. Open **Polls** in the dashboard.
2. Add a short title, such as `Frontier Poll #47`.
3. Choose the Discord channel where the poll should be posted.
4. Write the poll question.
5. Add 2 to 10 answer options.
6. Optionally add an emoji for each option. Unicode emoji and Discord custom emoji are supported.
7. Check the live preview. The public message will show the title, question, options, buttons, and optional vote counts.
8. Click **Save poll**.
9. Click **Publish** in the Open polls list when you are ready.

## Advanced settings

Open **Advanced scheduling and voting controls** when you need more control.

- **Save mode:** choose Draft or Scheduled.
- **Starts at:** required for scheduled polls.
- **Ends at:** optional. Leave it blank for a manual-close poll.
- **Required role:** only members with this role can vote.
- **Result visibility:** choose live public results, results after close, or hidden public results.
- **Multiple choice:** lets voters toggle multiple buttons.
- **Anonymous dashboard results:** hides voter IDs in dashboard result responses.
- **Update live message:** refreshes the Discord message after votes when public live results are enabled.

Scheduled polls only publish while the bot process is running. If the bot is offline at the scheduled time, it will publish the next time the scheduler sweep runs after startup.

## Button voting

Polls use buttons instead of dropdown menus.

- Each option gets one button.
- Buttons are labelled `1`, `2`, `3`, and so on.
- If an option has an emoji, that emoji appears on the matching button.
- In a single-choice poll, clicking a different option replaces the old vote.
- In a multiple-choice poll, clicking an option toggles that option on or off.
- When a poll ends or is cancelled, the buttons are disabled.

Votes are stored in the database by poll ID, guild ID, and user ID, so they survive bot restarts.

## Public results

The public poll embed is intentionally simple.

It shows:

- Poll title or poll number
- Question
- Options
- Vote bars and counts only when public results are enabled
- Footer with the poll number
- `Poll ended` or `Poll cancelled` in the title after close

It does not show setup metadata like access mode, privacy, manual close, starts at, or internal status. Staff can still use the dashboard or `/poll results` for stored details.

## Dashboard controls

- **Publish / Publish now:** posts a draft or scheduled poll immediately.
- **End:** closes an active poll and disables the buttons.
- **Cancel:** cancels a draft, scheduled, or active poll.
- **Open polls:** shows drafts, scheduled polls, and active polls.
- **Ended and cancelled:** shows archived poll result summaries.

## Discord commands

```text
/poll create
/poll list
/poll results
/poll end
/poll cancel
```

Slash command polls publish immediately. Use the dashboard when you need scheduling, option emojis, hidden results, or a cleaner setup flow.

## Required permissions

CorePanel needs these permissions in the poll channel:

- View Channel
- Send Messages
- Embed Links
- Use External Emojis, if using custom emoji from another server

## Troubleshooting

- If a scheduled poll does not publish, make sure CorePanel is running.
- If a poll does not publish, confirm the channel belongs to the selected server.
- If voting says a role is required, make sure the member has that role.
- If the buttons are disabled, the poll has ended or was cancelled.
- If live results do not update, check that the original poll message still exists and the bot can edit its own messages.
- If a custom emoji does not show, make sure the emoji format is valid, such as `<:vote:123456789012345678>`, and that the bot can use it.
