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
| Role Protection detection | View Audit Log |
| Role Protection permission/role removal | Manage Roles |
| Auto Mod message checks | Message Content Intent |
| Auto Mod deletion | Manage Messages |
| Role panels | Manage Roles |
| Post role panel with `/reaction-roles` | Manage Server or configured bot admin role |
| Sticky messages | Send Messages, Read Message History, Manage Messages |
| Scheduled announcements | Send Messages, Embed Links |
| Scheduled `@here` / `@everyone` | Mention Everyone |
| Ticket transcript export | Read Message History, Attach Files |

## Ticket close-request roles

- `/close-request` is for ticket staff.
- **Request Staff Close** is for the ticket opener or an Allowed / community role.
- A community-created request must be reviewed by staff.
- A staff-created request must be reviewed by the ticket opener or an Allowed / community role.
- The requester cannot approve or deny their own request.

## Common mistake

Inviting the bot without `applications.commands` scope means slash commands won't appear. Re-invite with the correct OAuth2 URL.
