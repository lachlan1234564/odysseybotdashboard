# Direct message features

CorePanel can send direct messages in three controlled situations:

- Staff use `/dm` to message one member at a time.
- Moderation actions can DM the affected user.
- Giveaway winners can receive a winner DM when a giveaway ends or is rerolled.

These features are intentionally not mass-DM tools.

## Enable the settings

1. Open the dashboard.
2. Choose the server you want to configure.
3. Open **Direct Messages** in the sidebar.
4. Save each setting after changing it.

## Staff `/dm`

The command is:

```bash
/dm user:@member message:Your message here
```

Optional fields:

- `reason`: staff-only reason stored in the audit record.
- `anonymous`: shows the sender as Server Staff.
- `embed`: sends the message as a clean embed.
- `reply_required`: tells the user staff asked for a reply.

Only trusted staff with dashboard/admin permission checks and Manage Server or Administrator can use it.

## Privacy and logging

By default, CorePanel logs that a staff DM was attempted, who sent it, who received it, and whether it was sent successfully.

The message body is not copied into logs unless **Log message preview** is enabled. Only enable that if your log channel is private and your staff understand that DM text will be visible there.

## Moderation DMs

Moderation DMs can be enabled for:

- Warnings
- Timeouts and timeout removals
- Kicks
- Bans
- Unbans
- Manual moderation cases

For kicks and bans, CorePanel attempts the DM before removing the user when possible.

Useful template variables:

- `{server}`
- `{serverName}`
- `{action}`
- `{reason}`
- `{case}`
- `{duration}`
- `{moderator}`
- `{appeal}`

If a user has DMs closed, the moderation action still continues. CorePanel logs the DM failure safely.

## Giveaway winner DMs

Enable **Giveaway winner DMs** to DM winners when a giveaway ends or is rerolled.

Use the global default message on the Direct Messages page, or set a custom winner message on an individual giveaway.

Useful variables:

- `{server}`
- `{serverName}`
- `{user}`
- `{user_id}`
- `{prize}`
- `{giveaway_id}`

## Safety notes

- Do not use `/dm` for advertising or mass messaging.
- Keep the rate limit enabled.
- Do not enable message-content logging unless the log channel is locked down.
- Staff should never receive the bot token or the `.env` file.

## Troubleshooting

If DMs fail:

1. The user may have DMs closed.
2. The user may not share a server with the bot anymore.
3. Discord may reject the DM for privacy reasons.
4. Check the configured mod/log channel for a safe failure entry.
