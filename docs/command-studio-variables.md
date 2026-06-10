# Command Studio variables

When building custom commands or templates in the dashboard, you can use placeholders like `{user}` that are replaced with real values when the command runs.

---

## All available variables

### User and member variables

| Variable | Meaning | Works in | Example output |
|----------|---------|----------|---------------|
| `{user}` | @mention of the command caller | Commands, welcome, tickets | `@Lachlan` |
| `{username}` | Discord username of caller | Commands, welcome, tickets | `lachlan` |
| `{target}` | @mention of the `/custom target` option | Commands only | `@MemberName` |
| `{user_name}` | Caller's username | Commands, tickets | `lachlan` |
| `{user_id}` | Caller's Discord user ID | Commands, tickets | `345678901234567890` |
| `{user_avatar}` | Caller's avatar URL | Commands, tickets | `https://cdn.discordapp.com/...` |
| `{text}` | Value of the `/custom text` option | Commands only | `hello world` |
| `{reason}` | Value of the `/custom reason` option | Commands only | `broke rule 3` |
| `{createdAt}` | Account creation date | Welcome only | `January 15, 2023` |
| `{memberCount}` | Approximate server member count | Welcome only | `1,234` |

### Server variables

| Variable | Meaning | Example output |
|----------|---------|---------------|
| `{server}` | Current server name | `My Discord Server` |
| `{server_name}` | Current server name | `My Discord Server` |
| `{server_id}` | Current server ID | `123456789012345678` |
| `{server_member_count}` | Approximate member count | `1,234` |
| `{server_created_at}` | Server creation date | `January 1, 2022` |
| `{server_icon}` | Server icon URL | `https://cdn.discordapp.com/...` |

### Channel variables

| Variable | Meaning | Example output |
|----------|---------|---------------|
| `{channel}` | #mention of the current channel | `#general` |
| `{channel_name}` | Current channel name | `general` |
| `{channel_id}` | Current channel ID | `234567890123456789` |

### Ticket variables

| Variable | Meaning | Example output |
|----------|---------|---------------|
| `{ticket_id}` | Database ticket ID | `42` |
| `{ticket_category}` | Ticket type label | `General Support` |
| `{created_at}` | When the ticket was opened | `June 7, 2026` |
| `{closed_at}` | When the ticket was closed | `Not closed` |

---

## Where variables work

| Context | Available variables |
|---------|-------------------|
| Custom commands (`/custom`) | All standard user/server/channel variables + `{text}`, `{reason}`, `{target}` |
| Ticket welcome messages | `{user}`, `{username}`, `{ticket_id}`, `{ticket_category}`, `{server_name}`, `{user_name}`, `{user_id}`, `{created_at}` |
| Ticket close messages | Same as ticket welcome |
| Welcome messages | `{user}`, `{username}`, `{server}`, `{memberCount}`, `{createdAt}`, `{server_name}`, `{user_name}` |
| Announcements | `{user}`, `{username}`, `{server}` (when posted via command) |
| Social promotions | No variables replaced (static content) |
| Sticky messages | No variables replaced (static content) |

---

## Using variables in the dashboard

When editing a custom command in **Command Studio**, variable hints appear below the message/description fields:

- Message field: `{user} {username} {server} {channel} {text} {reason} {target}`
- Ticket welcome: `{user} {username} {ticket_id} {ticket_category}`

Variable suggestions in the dashboard show example values so you can preview how they'll look.

---

## Notes

- Variables are case-sensitive. Use `{user}` not `{User}`.
- Undefined variables are left as-is (e.g. `{unknown}` stays as `{unknown}`).
- `{memberCount}` and `{createdAt}` only work in welcome messages.
- `{text}`, `{reason}`, and `{target}` only work in custom commands.
- Direct Discord embeds (Announcements, Social Promotion) support fewer variables — stick to `{user}`, `{username}`, `{server}`.
