# Modlogs

Odyssey Bot writes moderation, ticket, and security activity to Discord channels and stores structured records in the database where supported.

## Configure channels

Open **Server Settings**:

- **Mod log channel** receives moderation command logs.
- **Default ticket log channel** receives ticket open, claim, close, and close-request events.

Ticket types can override the default ticket log channel. Anti Raid, Anti Nuke, Role Protection, and Auto Mod can use their own log channels or fall back to the global mod log.

## What a log includes

Logs use consistent action and status fields where possible, plus relevant Discord IDs:

- action name
- completed, denied, or failed status
- moderator or executor
- target user
- ticket owner and channel
- reason
- timestamp

Discord IDs are included so staff can investigate even when a user, role, or channel is renamed.

## Dashboard history

- **Moderation** shows warning and moderation database records.
- **Tickets > History** shows ticket lifecycle records.
- **Tickets > Close Requests** shows pending, approved, and denied close requests.

The current ticket log is metadata only. Full HTML or text message transcripts are not implemented yet.
