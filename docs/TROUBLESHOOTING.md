# Troubleshooting

Start with the exact error shown in the dashboard. Save and test errors now include the reason returned by the API.

## Discord readiness issues

Discord readiness warnings usually mean the dashboard could not fetch live Discord channels, roles, emojis, or permissions in time. You can still edit saved settings, but dropdowns and permission checks may be degraded.

1. Confirm the bot process is running.
2. Confirm the bot is installed in the selected server.
3. Refresh the dashboard after the bot reconnects.
4. Check the dashboard terminal for the route name, guild ID, duration, and Discord error.
5. If only ticket types or one feature area failed, use that page's local warning instead of treating the whole dashboard as broken.

## OAuth redirect issues

OAuth redirect errors come from a mismatch between Discord Developer Portal and your environment variables.

1. In Discord Developer Portal → OAuth2 → Redirects, use `https://verify.YOUR_DOMAIN.com/api/verify/callback`.
2. In `.env`, set `DISCORD_OAUTH_REDIRECT_URI` to that exact same value.
3. Set `VERIFY_PUBLIC_BASE_URL=https://verify.YOUR_DOMAIN.com`.
4. Do not point verification URLs at the protected admin hostname.
5. Do not use the bot token as `DISCORD_CLIENT_SECRET`.

## Cloudflare tunnel issues

Cloudflare Tunnel problems usually show up as 502 errors, redirects that never return, or a verification page hidden behind Access.

1. Keep `cloudflared tunnel run corepanel-bot` running.
2. Point both `admin` and `verify` DNS records at the tunnel UUID.
3. Protect only the admin hostname with Cloudflare Access.
4. Leave the verification hostname public.
5. Set `TRUST_PROXY=true` when the dashboard is behind Cloudflare.

## Missing permissions

Most failed sends, role changes, ticket creation, and moderation actions are permission problems.

1. Put the CorePanel role above roles it needs to assign or moderate.
2. Give the bot View Channel and Send Messages where it must post.
3. Give the bot Embed Links where embeds are enabled.
4. Give the bot Manage Channels for tickets and verification setup.
5. Give the bot View Audit Log for executor-aware logging and security features.

## Bot offline

If the bot is offline or Discord says an application did not respond:

1. Start the bot with `pnpm bot` or start both processes with `pnpm dev`.
2. Check that `DISCORD_TOKEN` is set in `.env`.
3. Make sure Message Content Intent and Server Members Intent are enabled if you use AutoMod, welcome messages, or verification.
4. Run `pnpm deploy:commands` after command changes.
5. On Railway, confirm the service uses the long-running `pnpm start` script.

## Role hierarchy issues

Discord blocks actions against roles or members above the bot.

1. Move the CorePanel role above staff, verified, muted, ticket, and self-service roles it must manage.
2. Do not use managed integration roles for bot-managed actions.
3. Remember that the server owner cannot be moderated by the bot.
4. Re-test role panels, verification, and moderation after moving the role.

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
- If a server is missing, confirm CorePanel is installed there, then refresh the dashboard.

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
- Set `VERIFY_PUBLIC_BASE_URL` to the public verification hostname. The gate does not fall back to the protected admin hostname.
- If behind Cloudflare Tunnel or a reverse proxy, set `TRUST_PROXY=true` so `X-Forwarded-For` headers are trusted for proper IP logging and VPN checks.
- Configure both VPN provider variables (`VPN_CHECK_URL_TEMPLATE` and `VPN_CHECK_API_KEY`) before enabling the optional VPN/proxy toggle.
- Choose a verified/community role and move the CorePanel role above it.
- Give the bot Manage Channels, Manage Roles, View Channel, Send Messages, Embed Links, and Read Message History.

## Verification setup only changes some channels

- Save the dashboard form before running the dry run or setup.
- Permission-synced child channels inherit their category changes and are intentionally skipped.
- Explicit channel selections override category visibility.
- Hidden selections override public selections.
- Check the setup result for channel-specific failures, then fix the bot's access and rerun setup.

## Verification passed but no role was assigned

- Confirm the member is still in the server.
- Confirm the verified role still exists and is not managed by an integration.
- Move the CorePanel role above the verified role.
- Grant Manage Roles.
- Check the configured verification log channel for the role-assignment failure.

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
