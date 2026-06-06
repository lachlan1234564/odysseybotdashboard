# Troubleshooting

## Commands not appearing in Discord

- Run `pnpm deploy:commands` after any command definition change.
- Confirm `DISCORD_GUILD_ID` matches the server you're testing in.
- Make sure the bot was invited with the `applications.commands` scope.

## Role actions failing

- Check that the bot's role is above the target role in Server Settings > Roles.
- Verify the bot has Manage Roles permission.

## Tickets not creating

- Check that a category is configured and the bot has Manage Channels.
- Verify the ticket type is active and has staff roles set.
- Make sure the user hasn't hit the max open tickets limit.

## Anti-raid not triggering

- Ensure the feature is enabled in the Security dashboard.
- Check that the bot has the Guild Members intent enabled in the Developer Portal.
- Verify alert/log channels are configured and the bot can write to them.

## Anti-nuke not detecting events

- The bot needs **View Audit Log** permission.
- Audit logs may be delayed. The bot reads recent entries within 5 seconds of an event.
- Very high-rate abuse may outpace the audit log. Consider stronger Discord native protections for extreme cases.

## Welcome messages not sending

- Ensure welcome is enabled and a channel is selected.
- The bot needs **Guild Members** intent and **Send Messages** in the welcome channel.
- DM welcome fails silently if the user has DMs disabled. This is expected behavior.
