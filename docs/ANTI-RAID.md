# Anti-raid Protection

Anti-raid detects suspicious join waves and responds automatically.

## How it works

The bot tracks joins over a sliding time window. If the join threshold is exceeded, it triggers the configured action.

## Settings

- **Join threshold** — Number of joins in the time window to trigger. Default: 10.
- **Time window** — Seconds to look back. Default: 60.
- **Action** — Alert, lockdown, timeout, kick, or disable invites.
- **Lockdown duration** — How long channels stay locked. Default: 300s.
- **Minimum account age** — Accounts younger than this are flagged. Default: 0 (disabled).
- **Block no-avatar** — Flags accounts without a profile picture.
- **Bypass roles / users** — Whitelisted members are ignored.

## Security note

Defaults are conservative. Start with **Alert only** and tune thresholds before enabling stronger actions.
