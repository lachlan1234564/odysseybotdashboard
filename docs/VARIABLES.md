# Variables / Placeholders

## What is a placeholder?

A placeholder is a short code that the bot replaces with real Discord or ticket information.

Example:

```text
Hello {user_name}. Welcome to {server_name}.
```

This may become:

```text
Hello lachlan. Welcome to Rapid Community.
```

## Common command placeholders

| Placeholder | Result |
|---|---|
| `{user}` | Mention of the person running the command |
| `{username}` | Their Discord username |
| `{server}` | Current server name |
| `{channel}` | Mention of the current channel |
| `{text}` | The optional `/custom` `text` input |
| `{reason}` | The optional `/custom` `reason` input |
| `{target}` | The optional `/custom` target member |
| `{memberCount}` | Server member count |
| `{createdAt}` | Current user's Discord account creation time |

## Server information

| Placeholder | Result |
|---|---|
| `{server_name}` | Server name |
| `{server_id}` | Server ID |
| `{server_member_count}` | Approximate member count |
| `{server_created_at}` | Server creation date and time |
| `{server_icon}` | Server icon URL, or blank when no icon exists |

## Channel and user information

| Placeholder | Result |
|---|---|
| `{channel_name}` | Current channel name |
| `{channel_id}` | Current channel ID |
| `{user_name}` | Current user's Discord username |
| `{user_id}` | Current user's Discord ID |
| `{user_avatar}` | Current user's avatar URL |

## Ticket information

These values are filled when the message or custom command runs inside a registered ticket:

| Placeholder | Result |
|---|---|
| `{ticket_id}` | Bot Dashboard's database ticket number |
| `{ticket_category}` | Ticket type label, such as `Billing` |
| `{created_at}` | Ticket or event creation time |
| `{closed_at}` | Ticket closure time when available |

Outside a ticket, ticket-only placeholders become blank.

## Where they work

They work in bot-rendered message content, embed text, custom-command reasons, ticket panel text, ticket welcome messages, announcements, and welcome messages.

For an image field, use a URL placeholder such as `{server_icon}` or `{user_avatar}` only when that URL is expected to exist.

## Safe test

Create a private custom command with:

```text
Server: {server_name} ({server_id})
Channel: {channel_name} ({channel_id})
User: {user_name} ({user_id})
Ticket: {ticket_id} / {ticket_category}
```

Run it in a normal channel and then inside a test ticket to see which ticket values are available.
