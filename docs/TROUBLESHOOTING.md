# Troubleshooting

Start with the exact error shown in the dashboard. Save and test errors now include the reason returned by the API.

## A dashboard save did nothing

1. Look for a success or error message in the bottom-right corner.
2. Open **Overview** and check **Recent dashboard activity**.
3. If the save button still says `Saving...`, check the terminal running the dashboard.
4. Refresh once and try again. Buttons are disabled during a request to prevent double-submits.

## Commands not appearing in Discord

- Run `pnpm deploy:commands` after any command definition change.
- Confirm the bot is installed in the server and was invited with the `applications.commands` scope.
- The deploy script registers commands in every server the bot can access; `DISCORD_GUILD_ID` is only an optional dashboard preference.

## Dashboard shows the wrong server

- Use the **Active server** selector near the top of the sidebar.
- Each server has separate settings, commands, panels, announcements, and history.
- If a server is missing, confirm Odyssey Bot is installed there, then refresh the dashboard.

## Role actions failing

- Check that the bot's role is above the target role in Server Settings > Roles.
- Verify the bot has Manage Roles permission.

## Role Protection does not identify the executor

- Give the bot **View Audit Log**.
- Keep the bot online while performing the test.
- Use a normal test account, not the server owner or the bot itself.
- Audit log entries can arrive a moment after the Discord event.

## Auto Mod does not read messages

- Enable **Message Content Intent** in Discord Developer Portal > Bot.
- Restart the bot after changing the intent.
- Confirm Auto Mod and at least one rule are enabled.
- Confirm the test channel, role, or user is not in an ignored list.

## Auto Mod allows or blocks the wrong links

- Enter domains only, such as `x.com`, without `https://` or a path.
- Keep **Always block Discord invites** enabled if invite links must be blocked in promotion channels.
- The channel exemption list skips only caps, spam, and mass mentions. Link rules still run there.
- Use one channel-specific link rule per channel.

## Social Promotion will not save or send

- Every link must use HTTPS.
- Localhost and private-network URLs are rejected.
- Choose a text channel from the active server.
- Save before clicking **Send socials embed**; the send action publishes the saved version.
- Check View Channel, Send Messages, and Embed Links permissions.

## Verification cannot be enabled

- Set `DISCORD_CLIENT_SECRET` in `.env` (the OAuth client secret, not the bot token).
- Register the exact callback URL in Discord Developer Portal → OAuth2 → Redirects.
- Set `DISCORD_OAUTH_REDIRECT_URI` to that same URL.
- Set `VERIFY_PUBLIC_BASE_URL` (or `PUBLIC_BASE_URL`) to the hosted verification URL.
- If behind Cloudflare Tunnel or a reverse proxy, set `TRUST_PROXY=true` so `X-Forwarded-For` headers are trusted for proper IP logging and VPN checks.
- Configure both VPN provider variables (`VPN_CHECK_URL_TEMPLATE` and `VPN_CHECK_API_KEY`) before enabling the optional VPN/proxy toggle.

## A role panel button fails

- Give the bot **Manage Roles**.
- Move the bot role above the role shown on the button.
- Do not use managed integration roles or the server's `@everyone` role.

## A sticky message does not move

- Confirm it is enabled and saved for the correct channel.
- Give the bot **Send Messages**, **Read Message History**, and **Manage Messages**.
- Wait for the configured minimum repost delay.

## A schedule did not send

- Confirm the bot process stayed online.
- Confirm the schedule is enabled and its time is correct.
- Confirm the announcement template and target channel still exist.
- A due schedule is checked about every 30 seconds.
- `@here` and `@everyone` require **Mention Everyone**.

## A ticket transcript is missing

- Choose a default ticket log channel in **Server Settings**, or an override on the ticket type.
- Give the bot **Read Message History** in the ticket.
- Give the bot **Attach Files** in the transcript channel.

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

## Welcome or goodbye messages not sending

- Ensure the relevant welcome/goodbye toggle is enabled and its channel is selected.
- The bot needs **Guild Members** intent and **Send Messages** in the welcome channel.
- If an embed is enabled, the bot also needs **Embed Links**.
- DM welcome fails silently if the user has DMs disabled. This is expected behavior.
