# Security Overview

Bot Dashboard includes Anti Raid, Anti Nuke, and Role Protection. Start with alert or log-only behavior, review the logs, and tune thresholds before enabling automatic punishment.

## Anti Raid

Open **Security > Anti Raid**. It monitors join waves and can alert staff, lock channels, timeout suspicious new accounts, kick suspicious joins, or disable invites.

The Discord **Server Members Intent** must be enabled for reliable join handling.

## Anti Nuke

Open **Security > Anti Nuke**. It uses Discord audit logs to count destructive administrative actions such as channel deletion, role deletion, bans, kicks, webhook activity, and permission changes.

The bot needs **View Audit Log**. Its highest role must also be above any member it may punish.

## Role Protection

Open **Security > Role Protection**. It watches dangerous role permissions, protected-role assignments, role renames and deletions, and rapid role changes.

Keep the first test on **Log only**. The bot needs **View Audit Log**, and stronger actions need the matching Discord moderation permission.

## Safe rollout

1. Select alert and log channels.
2. Keep the action set to **Alert staff only**.
3. Enable one module at a time.
4. Perform controlled tests with trusted accounts and disposable channels.
5. Review false positives before selecting a stronger action.

## Dashboard access

Security settings are protected by the dashboard login, but the current MVP uses one shared password. Anyone with that password can edit all dashboard settings. Use a long unique password and share it only with trusted administrators.
