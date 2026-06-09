# Action Templates

Every custom command picks one action type. Here is the full list:

## Messages

- **Reply with a plain message** — Sends text back in the channel where the command ran.
- **Reply with an embed** — Sends a rich embed with optional fields, images, and timestamps.
- **Send a message/embed to a channel** — Posts to a different channel than where the command ran. Choose no ping, `@everyone`, or `@here`.
- **Send an ephemeral reply** — Visible only to the command user. Good for sensitive info.
- **Send a DM to a user** — Direct messages the configured target user.

## Roles

- **Give / Remove / Toggle a role** — Works on the command user or a configured target user.
- **Give / Remove multiple roles** — Batch role changes.

## Tickets

- **Post a saved ticket panel** — Sends a ticket panel into the current channel.
- **Create a ticket channel** — Creates a private ticket channel with permissions.
- **Request to close the ticket** — Uses the community flow: the opener or an Allowed / community role asks ticket staff to accept or deny closure. Staff use the dedicated `/close-request` command for the reverse flow.

## Channel management

- **Lock / Unlock channel** — Toggles @everyone SendMessages permission.
- **Rename channel** — Changes the current channel name. Supports variables.
- **Move channel** — Moves the current channel to a different category.
- **Add / Remove user from channel** — Grants or revokes ViewChannel for a specific user.

## Moderation

- **Timeout / Remove timeout** — Times out a member or clears their timeout.
- **Kick / Ban / Unban user** — Standard moderation actions with optional reason.
- **Purge messages** — Bulk-deletes recent messages (max 100, 14 days).

## Requirements & logging

- **Require a role** — Blocks the rest of the command unless the user has the role.
- **Require a permission** — Blocks unless the user has the Discord permission flag.
- **Log to moderation log** — Sends an embed to the configured log channel.

## Advanced

- **Send a saved announcement** — Posts a pre-built announcement template. Its custom-command ping selector controls whether the custom action pings.

Pings are sent as normal message content outside the embed. Dashboard previews and test messages never ping. Real pings require the bot's **Mention @everyone, @here, and All Roles** permission in the destination channel.
- **Run multiple actions in sequence** — Chains up to 10 actions in order.
