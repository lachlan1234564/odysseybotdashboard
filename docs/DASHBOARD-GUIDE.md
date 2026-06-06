# Dashboard and Feature Guide

This guide explains what each dashboard page does and walks through common setups. It is written for first-time server owners—you do not need prior bot experience.

---

## Table of Contents

1. [How to Log In](#how-to-log-in)
2. [Dashboard Pages Overview](#dashboard-pages-overview)
3. [Custom Commands](#custom-commands)
4. [Tickets](#tickets)
5. [Announcements](#announcements)
6. [Moderation](#moderation)
7. [Server Settings](#server-settings)
8. [Appearance](#appearance)
9. [Image URLs and Uploads](#image-urls-and-uploads)
10. [Testing Safely](#testing-safely)

---

## How to Log In

### Local Development

Start the local dashboard:

```bash
cd ~/Desktop/rapid-discord-bot
pnpm dashboard
```

Your browser opens `http://127.0.0.1:3210`. Enter the value of `DASHBOARD_PASSWORD` from `.env`.

The password is checked by the backend and is **never sent back to the browser**.

### Railway Production

Open your Railway service's generated HTTPS domain and use the production dashboard password.

---

## Dashboard Pages Overview

### Overview

The first page you see after logging in. It shows counts for:

- Custom commands
- Ticket types
- Ticket panels
- Open tickets
- Announcements
- Warnings

It also includes a **Launch checklist** with shortcuts to the most important setup steps.

### Command Studio

Build custom actions that members run through:

```
/custom name:<command-name>
```

The builder includes identity, action type, embed design, permissions, cooldowns, a live preview, test sending, editing, enabling/disabling, and deletion.

### Ticket Studio

Contains three tabs:

- **Panels:** Reusable public ticket entry messages (dropdowns or buttons).
- **Ticket types:** Routing, permissions, welcome messages, and lifecycle rules.
- **History:** Recent ticket records with status, user, and claim information.

**Important:** Create ticket types **before** panels, because a panel must contain one or more saved ticket types.

### Announcements

Save reusable announcement templates with a title, body, color, image, thumbnail, footer, and target channel. In Discord, `/announce` shows an ephemeral preview and asks for confirmation before posting.

### Moderation

View recent warnings and moderation actions recorded by the bot. Moderation commands (`/warn`, `/warnings`, `/timeout`, `/kick`, `/ban`, `/clear`) are run directly in Discord.

### Server Settings

Configure shared Discord routing and access defaults:

- Moderation log channel
- Announcement channel
- Default ticket category
- Default ticket log channel
- Muted role
- Staff roles
- Bot admin roles

Ticket types and announcement templates can override some of these defaults.

### Appearance

Set fallback branding:

- Server or bot name
- Footer text and embed icon
- Legacy ticket title, description, color, and banner
- Default announcement color, image, and thumbnail

New ticket panels and types also have their own visual settings that override these defaults.

### Documentation

The built-in help page inside the dashboard. It mirrors much of this guide.

---

## Custom Commands

### What Are Custom Commands?

Custom commands are actions you design in the dashboard that members run with `/custom name:<command>`. They let you create rich responses, role assignments, channel messages, ticket panels, and announcements **without** registering new Discord slash commands every time.

> **Limitation:** Dashboard-created commands run through `/custom`. They do not automatically become new top-level commands like `/rules`. To add a true top-level command, you must edit `src/bot/commands.ts` and run `pnpm deploy:commands`.

### Command Name Rules

Names may contain only:

- Lowercase letters (`a-z`)
- Numbers (`0-9`)
- Hyphens (`-`)
- Underscores (`_`)

Names are limited to **32 characters**. The dashboard normalizes input before saving.

**Example:**

| What You Type | Normalized Result |
|---------------|-------------------|
| `Say hi` | `say-hi` |
| `Server Info` | `server-info` |
| `FAQ 2` | `faq-2` |

If a name becomes empty after normalization, the form shows a validation message and does not save.

### How to Create a Plain Text Command (e.g., `rules`)

1. Open **Command Studio**.
2. Click **New command**.
3. Enter `rules` as the command name.
4. Add a description, such as `Shows the server rules`.
5. Leave **Enabled** turned on.
6. Choose **Reply with a plain message**.
7. Type the rules into the **Message** field.
8. Set **Who can use it?** to **Everyone**.
9. Set **Reply visibility** to **Public** or **Private / ephemeral**.
10. Click **Save command**.

Test in Discord:

```
/custom name:rules
```

The command appears through autocomplete. You do **not** need to run `pnpm deploy:commands` after adding dashboard content.

### How to Create an Embed Command (e.g., `server-info`)

1. Open **Command Studio**.
2. Click **New command**.
3. Enter `server-info`.
4. Choose **Reply with an embed**.
5. Fill in the embed title and description.
6. Choose a color using the color picker.
7. Optionally add an image, thumbnail, footer, or fields.
8. Set permissions (e.g., **Everyone** or **Configured staff roles**).
9. Click **Save command**.

Test with `/custom name:server-info`.

### How to Create a Channel Announcement Command

1. Create a command named `announce-update`.
2. Choose **Send a message/embed to a channel**.
3. Select the announcements channel.
4. Fill in the embed title, description, color, image, and footer.
5. Set access to **Bot admins only** or **Configured staff roles**.
6. Optionally add a cooldown to prevent accidental repeats.
7. Save and test with `/custom name:announce-update`.

For a safer confirmation flow, use the **Announcements** page with `/announce` instead.

### Command Action Templates

| Action | What It Does |
|--------|--------------|
| **Reply with a plain message** | Replies in the current Discord channel. Private visibility makes the response ephemeral (only the caller sees it). |
| **Reply with an embed** | Builds a rich embed in the current channel. |
| **Send a message/embed to a channel** | Sends to a fixed destination channel. The user gets a private confirmation. |
| **Give or remove a role** | Adds or removes the selected role from the person running `/custom`. The bot's role must be above the target role. |
| **Post a saved ticket panel** | Posts the selected panel in the current channel. The panel must already exist and be active. |
| **Send a saved announcement** | Sends a saved template immediately. The dedicated `/announce` command is safer because it includes preview and confirmation. |

### Placeholders

Use these variables in message and embed text:

| Placeholder | Replaced With |
|-------------|---------------|
| `{user}` | Mention of the person running the command |
| `{username}` | Their Discord username |
| `{server}` | Current server name |
| `{channel}` | Mention of the current channel |
| `{text}` | Optional `/custom` `text` input |
| `{reason}` | Optional `/custom` `reason` input |
| `{target}` | Optional `/custom` target member, otherwise the caller |

**Example command text:**

```
Hello {user}. You asked in {channel}: {text}
```

**Example use:**

```
/custom name:question text:When is the next event?
```

Placeholders are simple text replacement. They are not a scripting language and cannot run arbitrary code.

### Command Permissions

#### Who Can Use It?

| Access Mode | Meaning |
|-------------|---------|
| **Everyone** | Any member can use it unless allow/block lists restrict it. |
| **Bot admins only** | Requires Discord's **Manage Server** permission or a configured bot admin role. |
| **Configured staff roles** | Requires a role saved in **Server Settings > Staff roles**. |
| **Selected roles** | Requires at least one role chosen in the command's **Allowed roles**. |

#### Allow and Block Lists

Rules are evaluated in this order:

1. A **blocked channel** denies use.
2. A **non-empty allowed-channel list** permits only listed channels.
3. A **blocked role** denies use.
4. A **non-empty allowed-role list** requires at least one listed role.
5. The main **access mode** is checked.

**Block lists win over allow lists.** Leaving an allow list empty means there is no extra restriction.

### Cooldowns

| Cooldown Type | Behavior |
|---------------|----------|
| **No cooldown** | Every permitted use runs immediately. |
| **Per user** | Each person has a separate timer. |
| **Whole server** | One use starts the timer for everyone in the guild. |

Enter the length in seconds, from `0` to `86400` (24 hours).

> **Warning:** Cooldowns are held in bot memory, so restarting the bot clears them. Do not use them as a durable quota or security control.

---

## Tickets

### What Are Tickets?

Tickets are private Discord channels created when a member needs help. The bot creates the channel, grants access to the member and staff, sends a welcome message, and logs the event.

### Step 1: Create a Ticket Type

A ticket type defines routing, permissions, and the welcome message.

1. Open **Ticket Studio > Ticket types**.
2. Configure these fields:

| Field | What It Does | Example |
|-------|--------------|---------|
| **Label** | The name members see. | `Billing support` |
| **Emoji** | Optional emoji shown in menus. | `💳` |
| **Menu description** | Short text shown in dropdowns. | `Payment and subscription issues` |
| **Category** | Where the private channel is created. | `# Tickets` |
| **Transcript channel override** | Where ticket events are logged for this type. | `# ticket-logs` |
| **Staff roles** | Can view, write, claim, and close. | `@Support Team` |
| **Ping roles on open** | Mentioned in the first message. | `@On-Call Staff` |
| **Welcome message** | First embed inside the ticket channel. | `Thanks for contacting us...` |
| **Allowed roles** | Optional allowlist for opening this type. | (leave empty for everyone) |
| **Blocked roles** | Always denied. | `@Banned` |
| **Max open per user** | Separate limit for this type. | `1` |
| **Auto-close after inactivity** | Hours before automatic close. `0` disables. | `24` |
| **Channel naming** | Supports `{username}`, `{type}`, `{userId}`. | `ticket-{username}` |
| **Claim button** | Staff can take ownership. | ✅ |
| **Close button** | Creator and staff can close. | ✅ |
| **Require close reason** | Shows a modal before closing. | (optional) |

3. Click **Save ticket type**.

### Step 2: Create a Ticket Panel

A panel is the public entry point members see.

1. Open **Ticket Studio > Panels**.
2. Enter an internal name, such as `Main support`.
3. Select a target channel if the panel normally belongs in one place.
4. Choose **Ticket type panel** (or **Multi-panel menu** for a menu of panels).
5. Choose **Dropdown menu** or **Buttons**.
6. Select one or more ticket types.
7. Set the public title, description, color, images, footer, and placeholder.
8. Keep **Active** enabled.
9. Click **Save ticket panel**.

The live preview updates while you edit.

### Multiple Ticket Types Example

Create three types:

- `General support`
- `Billing`
- `Report a member`

Then create one `Main support` panel and select all three types. Members choose the appropriate route from the dropdown or buttons.

### Multi-Panel Menu

A multi-panel is a menu of other standard panels:

1. Create the individual standard panels first.
2. Create a new panel.
3. Set **Panel kind** to **Multi-panel menu**.
4. Select the child panels.
5. Save and post the multi-panel.

Selecting a child presents that panel's ticket choices ephemerally (only the user sees it).

### How to Post a Ticket Panel

**From Discord:**

```
/ticket-panel
```

Choose a saved panel from autocomplete and optionally override the destination channel. If no panel is selected, the bot uses the first active saved panel.

Only members with **Manage Server** or a configured bot admin role can use this command.

**From the dashboard:**

Save the panel first, select a test channel, then click **Send saved panel**.

### Ticket Lifecycle

When a member opens a ticket:

1. The bot checks allowed and blocked roles.
2. It checks the per-type open-ticket limit.
3. It creates a private text channel in the configured category.
4. It grants access to the creator, bot, and staff roles.
5. It stores the ticket record.
6. It sends the welcome embed and optional role mentions.
7. It logs the open event.

Staff can **claim** a ticket. The creator or staff can **close** it. If a close reason is required, Discord displays a modal. The channel is deleted **five seconds** after closing.

Auto-close checks run approximately every 15 minutes.

> **Note:** Ticket logging records events (open, claim, close), but a full message transcript exporter is not implemented yet.

---

## Announcements

### What Are Announcements?

Announcement templates let you prepare consistent broadcast messages in the dashboard and send them from Discord with a confirmation step.

### How to Create an Announcement Template

1. Open **Announcements**.
2. Enter a **template name** (for your reference).
3. Select a **target channel**.
4. Fill in the **title** and **body**.
5. Choose a **color**.
6. Optionally add an **image**, **thumbnail**, and **footer**.
7. Click **Save announcement**.

### How to Send an Announcement

1. In Discord, run:
   ```
   /announce
   ```
2. Select the template from autocomplete.
3. Optionally override the channel.
4. Review the private preview.
5. Click **Post announcement** or **Cancel**.

Only members with **Manage Server** or a configured bot admin role can use `/announce`.

---

## Moderation

### What Is Recorded?

The bot records warnings and moderation actions in the database. You can view them on the **Moderation** dashboard page.

### Discord Commands

| Command | Permission Required | What It Does |
|---------|---------------------|--------------|
| `/warn member reason` | Moderate Members | Stores a warning |
| `/warnings member` | Moderate Members | Shows recent warnings |
| `/timeout member minutes [reason]` | Moderate Members | Times out a member |
| `/kick member [reason]` | Kick Members | Kicks a member |
| `/ban member [delete_days] [reason]` | Ban Members | Bans a member |
| `/clear amount` | Manage Messages | Deletes recent messages |

All moderation actions are logged to the configured **mod log channel** in **Server Settings**.

---

## Server Settings

### What This Page Does

Server Settings stores shared Discord routing and access defaults used across the bot.

### Field-by-Field Guide

| Field | What It Does | When to Use It | What Happens If Blank |
|-------|--------------|----------------|----------------------|
| **Mod log channel** | Where moderation actions are logged. | Always configure this first. | Moderation actions are still recorded in the database but not sent to Discord. |
| **Announcement channel** | Default channel for `/announce` when no override is set. | Configure if you use announcements. | `/announce` requires a channel override or template target channel. |
| **Default ticket category** | Where ticket channels are created if a type has no category. | Configure if most tickets go to the same category. | Ticket types must each specify a category. |
| **Default ticket log channel** | Where ticket events are logged if a type has no override. | Configure for centralized logging. | Ticket types must each specify a log channel. |
| **Muted role** | The role used for muting members. | If you use a mute role in your server. | Mute-related features will not work. |
| **Staff roles** | Roles that can use staff-level commands and manage tickets. | Add all support/moderation roles. | Staff-mode commands and ticket management may fail. |
| **Bot admin roles** | Roles that can use admin-level commands (`/ticket-panel`, `/announce`). | Add owner and lead admin roles. | Only users with **Manage Server** permission can run admin commands. |

---

## Appearance

### What This Page Does

Appearance sets fallback branding used when a specific panel, type, or template does not provide its own visual settings.

### Field-by-Field Guide

| Field | What It Does | When to Use It | What Happens If Blank |
|-------|--------------|----------------|----------------------|
| **Server / bot name** | Displayed in footers and logs. | Always set this. | Falls back to generic text. |
| **Footer text** | Default footer for embeds. | Set a branded footer. | No footer appears unless specified elsewhere. |
| **Embed icon** | Small icon in embed footers. | Upload your server logo. | No icon appears. |
| **Legacy ticket title** | Fallback title for old ticket panels. | Kept for backward compatibility. | Uses the panel's own title. |
| **Legacy ticket color** | Fallback color for old panels. | Kept for backward compatibility. | Uses the panel's own color. |
| **Default announcement color** | Fallback color for announcements. | Set a brand color. | Uses `#5865F2` (Discord blurple). |
| **Default announcement image/thumbnail** | Fallback media for announcements. | Set branded images. | No image/thumbnail appears unless specified in the template. |

---

## Image URLs and Uploads

Every media field in the dashboard accepts:

- A public `https://` image URL
- A local file upload

### How to Upload

1. Click **Upload** next to a media field.
2. Choose a PNG, JPEG, GIF, or WebP file up to 8 MB.
3. The dashboard inserts an `/uploads/...` path into the field.
4. The bot attaches that file when sending to Discord.

### Where Uploads Are Stored

- **Local:** `UPLOADS_DIR` (default `./uploads`)
- **Railway:** Mount a volume at `/app/uploads` and set `UPLOADS_DIR=/app/uploads`

Without a Railway volume, uploaded images disappear after redeployment. A public HTTPS image URL is a useful fallback.

If a URL is used, Discord must be able to fetch it without authentication.

---

## Testing Safely

Before using features in your real server, test them privately:

1. Create private channels named `bot-testing` and `ticket-testing`.
2. Restrict them to yourself and trusted staff.
3. Use **Send test** in Command Studio for message and embed drafts.
4. Use **Send saved panel** only after saving the panel.
5. Test role actions with a harmless test role placed below the bot role.
6. Test ticket categories and permissions with a non-admin test account.
7. Use short cooldowns during testing, then raise them for production.
8. Keep moderation testing away from real members.

**Important:** The Command Studio test button sends only the current message/embed draft. Role, ticket, and announcement workflow actions must be tested through Discord.

---

## Edit or Delete Saved Content

Saved libraries appear beside each builder. Select an item to load it into the form, make changes, and save.

**Deletion warnings:**

- Deleting a ticket type used by a panel removes that option from the panel.
- Deleting an announcement or panel used by a custom action makes that action unavailable until edited.
- Deleting a command, panel, or announcement is permanent.
