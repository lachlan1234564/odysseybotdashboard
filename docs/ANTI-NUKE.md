# Anti-nuke Protection

Anti-nuke monitors dangerous administrative actions and responds to abuse.

## Monitored events

- Channel delete/create spam
- Role delete/create spam
- Mass bans/kicks
- Webhook creation/deletion
- Permission changes
- Bot additions
- Administrator role changes

## How it works

The bot reads the Discord audit log for each event and counts actions per executor within the time window. If the threshold is exceeded, it takes the configured action.

## Trusted users/roles

The server owner is always trusted. You can add additional trusted users and roles in the database. Trusted executors are never punished.

## Role hierarchy check

Before removing roles, timing out, kicking, or banning, the bot checks that its highest role is above the target's highest role. If not, it falls back to alert-only.

## Default behavior

Anti-nuke defaults to **alert-only**. You must explicitly choose stronger actions in the dashboard. We strongly recommend testing with alert-only first.
