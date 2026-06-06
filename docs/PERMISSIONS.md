# Permissions & Discord Role Hierarchy

Discord has strict rules about what bots can do. Understanding them prevents many common errors.

## Role hierarchy

A bot can only assign, remove, or manage roles that are **below** its highest role in the server role list. This applies to moderation actions, role commands, and anti-nuke responses.

## Required bot permissions by feature

| Feature | Required permissions |
|---------|---------------------|
| Basic commands | Send Messages, Embed Links |
| Role actions | Manage Roles |
| Tickets | Manage Channels, Send Messages, Read Message History |
| Timeouts | Moderate Members |
| Kick / Ban | Kick Members / Ban Members |
| Purge | Manage Messages |
| Anti-raid lockdown | Manage Channels |
| Anti-raid disable invites | Manage Guild |
| Welcome auto-roles | Manage Roles |

## Common mistake

Inviting the bot without `applications.commands` scope means slash commands won't appear. Re-invite with the correct OAuth2 URL.
