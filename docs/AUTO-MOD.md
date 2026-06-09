# Auto Mod

## In one sentence

Auto Mod checks new messages for a small set of common problems and can delete, warn, timeout, or only log.

## Set it up

1. Open **Automation > Auto Mod**.
2. Turn on only the rules you need.
3. Choose an action.
4. Add roles or user IDs that should be ignored.
5. Use **Channels exempt from non-link rules** only for channels where caps, spam, and mass-mention checks should not run.
6. Add channel-specific link rules when a channel needs its own domain policy.
7. Choose a log channel, or use the global mod log.
8. Turn on **Enabled**.
9. Click **Save Auto Mod**.

At least one rule must be selected before Auto Mod can be enabled.

## Rules

- **Discord invites:** detects Discord invite links.
- **Suspicious links:** detects IP-address links, punycode domains, and common URL shorteners.
- **Excessive caps:** checks longer messages against your caps percentage.
- **Repeated spam:** checks repeated identical messages in a short window.
- **Mass mentions:** counts user and role mentions in one message.

Administrators are ignored automatically.

## Channel-specific link rules

Each row applies only to the selected channel:

- **Allowed domains** are exempt from the suspicious-link rule in that channel.
- **Blocked domains** are always blocked in that channel.
- Enter domains only, such as `x.com` or `twitter.com`. Do not enter a full post URL.
- Subdomains match their parent domain.

For a self-promotion channel, add `x.com` and `twitter.com` under **Allowed domains** and keep **Always block Discord invites** enabled. X/Twitter links can be posted there, while `discord.gg`, `discord.com/invite`, and `discordapp.com/invite` remain blocked.

The old channel exemption now skips only non-link checks. It does not bypass invite or domain rules.

## Actions

- **Delete message:** removes the message.
- **Delete and store a warning:** removes it and adds a warning to the database.
- **Delete and timeout member:** removes it and applies the configured timeout.
- **Log only:** records the event without deleting anything.

## Test safely

1. Start with **Log only**.
2. Use a private channel.
3. Enable one rule.
4. Send a message that should trigger it.
5. Check the mod log.
6. Change to **Delete message** only after detection looks correct.

## Important Discord setting

Enable **Message Content Intent** in Discord Developer Portal > Your Application > Bot > Privileged Gateway Intents. Without it, the bot cannot inspect normal message text.
