# Odyssey Bot

Odyssey Bot is a modular Discord administration bot built with TypeScript, discord.js v14, a password-protected web dashboard, and a shared database. Use SQLite for local development or PostgreSQL when deploying to Railway.

This README is a quick reference. For detailed, beginner-friendly guides, see the [docs/](docs/) folder:

- **[Setup and Railway deployment](docs/SETUP.md)** — Get the bot running from scratch.
- **[Dashboard and feature guide](docs/DASHBOARD-GUIDE.md)** — Learn every dashboard page and feature.
- **[Staff dashboard access](docs/STAFF-ACCESS.md)** — Give staff safe access without leaking credentials.
- **[Troubleshooting](docs/TROUBLESHOOTING.md)** — Fix common problems step by step.

---

## Quick Start

Run these commands from `~/Desktop/rapid-discord-bot`:

```bash
pnpm install
pnpm db:setup
pnpm deploy:commands
pnpm bot
```

Open a second terminal in the same folder:

```bash
pnpm dashboard
```

`pnpm dashboard` starts the local dashboard and opens `http://127.0.0.1:3210`. Log in with `DASHBOARD_PASSWORD` from `.env`.

To run the bot and dashboard together:

```bash
pnpm dev
```

For your very first time, follow the complete walkthrough in [docs/SETUP.md](docs/SETUP.md).

---

## What the Project Does

The project has three main parts:

- **Discord bot:** Logs in to Discord, handles slash commands, creates tickets, sends announcements, runs custom actions, and performs moderation.
- **Dashboard:** A web interface with forms, Discord resource dropdowns, live previews, image uploads, and settings—without putting channel or role IDs in `.env`.
- **Database:** Stores guild settings, branding, custom commands, ticket configuration and records, announcement templates, warnings, and moderation history.

The bot and dashboard share the same TypeScript config and database layer.

---

## Current Features

### Discord Commands

| Command | Who Can Use It | What It Does |
|---------|----------------|--------------|
| `/ping` | Everyone | Confirm the bot is online and show gateway latency |
| `/help` | Everyone | List commands by category with permission labels |
| `/custom name [text] [reason] [target]` | Configurable per command | Run a dashboard-created command |
| `/ticket-panel [panel] [channel]` | Bot admins | Post a saved ticket panel |
| `/reaction-roles panel [channel]` | Bot admins | Post a saved self-service role panel |
| `/announce template [channel]` | Bot admins | Preview and confirm an announcement |
| `/close-request [reason]` | Ticket staff | Ask the ticket opener/community to approve closure |
| `/warn member reason` | Moderate Members | Store a warning |
| `/warnings member` | Moderate Members | Show recent warnings |
| `/timeout member minutes [reason]` | Moderate Members | Time out a member |
| `/kick member [reason]` | Kick Members | Kick a member |
| `/ban member [delete_days] [reason]` | Ban Members | Ban a member |
| `/clear amount` | Manage Messages | Delete recent messages |

### Dashboard Features

- **Command Studio:** Build custom actions (plain messages, embeds, channel sends, role management, ticket panels, announcements) with permissions, cooldowns, and live preview.
- **Ticket Studio:** Create ticket types with routing, staff roles, welcome messages, and lifecycle rules. Compose them into panels (dropdown or buttons) or multi-panel menus.
- **Announcements:** Save embed or plain-text templates with a preview-and-confirm flow in Discord.
- **Social Promotion:** Build and publish guild-specific embed or plain-text social directories with safe links, uploads, and live preview.
- **Automation:** Configure channel-specific link policies, invite blocking, role panels, sticky messages, and scheduled announcements.
- **Security:** Configure anti-raid, anti-nuke, role protection, and optional privacy-conscious Discord OAuth member verification.
- **Moderation:** View warnings and recorded actions.
- **Server Settings:** Configure channels, categories, staff roles, admin roles, and muted role.
- **Appearance:** Set fallback branding, colors, and images.

### Infrastructure

- Guild-scoped slash commands registered to every server where the bot is installed
- Authenticated dashboard server switcher with isolated settings and content per guild
- Live custom command, embed, announcement, and ticket previews
- Authenticated test sends to a selected Discord channel
- Image URLs and local PNG, JPEG, GIF, or WebP uploads up to 8 MB
- Local SQLite and Railway PostgreSQL support

---

## MVP Limitations

- Dashboard-created commands run through `/custom`. They do not automatically become new top-level commands such as `/rules`. To add true top-level commands, edit `src/bot/commands.ts` and run `pnpm deploy:commands`.
- The dashboard uses one shared admin password. Discord OAuth is available only for member verification; per-staff OAuth dashboard accounts are not implemented yet.
- Dashboard sessions and command cooldowns are stored in memory and reset when the process restarts.
- Uploaded files require a persistent Railway volume in production.
- Ticket logging records events and can export the newest 100 messages to a downloadable transcript card.
- Use one Railway application replica. The bot and dashboard can manage multiple Discord servers from that process.
- The `deleteUsage` custom command option is stored for future message/prefix command support. Discord slash-command invocations cannot be deleted like messages.

---

## Environment Variables

Create `.env` in the project root. Do not commit or share it.

```dotenv
DISCORD_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_application_id
# Optional member verification:
# DISCORD_CLIENT_SECRET=your_oauth_client_secret
# DISCORD_OAUTH_REDIRECT_URI=https://your-domain.example/api/verify/callback
# Optional preferred dashboard server:
DISCORD_GUILD_ID=your_server_id
DASHBOARD_PASSWORD=use_a_long_random_password
DATABASE_URL=file:./data/bot.db
DATABASE_SSL=false
DASHBOARD_PORT=3210
DASHBOARD_HOST=127.0.0.1
UPLOADS_DIR=./uploads
NODE_ENV=development
# PUBLIC_BASE_URL=https://your-domain.example
# VPN_CHECK_URL_TEMPLATE=https://provider.example/check/{ip}
# VPN_CHECK_API_KEY=your_provider_api_key
```

Only secrets and process startup values belong in `.env`. Configure Discord channels, roles, colors, images, ticket settings, and announcements in the dashboard.

For a complete variable reference, see [docs/SETUP.md](docs/SETUP.md).

---

## First Dashboard Configuration

Follow these steps to get from a fresh install to a working server. For detailed explanations of every field, see [docs/DASHBOARD-GUIDE.md](docs/DASHBOARD-GUIDE.md).

### Step 1: Configure Server Settings

1. Open the dashboard and go to **Server Settings**.
2. Select:
   - **Mod log channel** — where moderation actions are logged.
   - **Announcement channel** — default channel for announcements.
   - **Default ticket category** — where ticket channels are created.
   - **Default ticket log channel** — where ticket events are logged.
   - **Staff roles** — who can manage tickets and use staff commands.
   - **Bot admin roles** — who can run `/ticket-panel`, `/reaction-roles`, and `/announce`.
3. Click **Save server settings**.

### Step 2: Set Appearance

1. Go to **Appearance**.
2. Enter your **Server / bot name**.
3. Choose a **Default announcement color**.
4. Optionally upload a logo for the **Embed icon**.
5. Click **Save appearance**.

### Step 3: Create a Ticket Type

1. Go to **Ticket Studio > Ticket types**.
2. Fill in:
   - **Label** — what members see (e.g., `General support`).
   - **Category** — where the private channel is created.
   - **Staff roles** — who can view and close the ticket.
   - **Welcome message** — the first message inside the ticket.
3. Click **Save ticket type**.

### Step 4: Create a Ticket Panel

1. Go to **Ticket Studio > Panels**.
2. Enter an **Internal name** (e.g., `Main support`).
3. Choose **Dropdown menu** or **Buttons**.
4. Select the ticket type you just created.
5. Design the title, description, and color.
6. Keep **Active** enabled.
7. Click **Save ticket panel**.

### Step 5: Post the Panel in Discord

1. In Discord, run:
   ```
   /ticket-panel
   ```
2. Choose your saved panel.
3. Select the channel where members should see it.
4. The panel appears with a dropdown or buttons.

### Step 6: Create a Custom Command

1. Go to **Command Studio**.
2. Click **New command**.
3. Enter `rules` as the name.
4. Choose **Reply with a plain message**.
5. Type your server rules.
6. Set **Who can use it?** to **Everyone**.
7. Click **Save command**.
8. In Discord, test with `/custom name:rules`.

### Step 7: Create an Announcement

1. Go to **Announcements**.
2. Choose **Embed** or **Plain text / no embed**.
3. Enter a **Template name** and **Body**. Embed templates also require a title.
4. Select a **Target channel**.
5. Click **Save announcement**.
6. In Discord, run:
   ```
   /announce
   ```
7. Select your template, review the preview, and click **Post announcement**.

---

## Package Scripts

| Command | Purpose |
|---------|---------|
| `pnpm setup` | Install dependencies and initialize the database |
| `pnpm db:setup` | Apply pending SQLite or PostgreSQL migrations |
| `pnpm deploy:commands` | Register guild commands in every server where the bot is installed |
| `pnpm bot` | Run the bot from TypeScript |
| `pnpm dashboard` | Run the dashboard and open a browser |
| `pnpm dashboard:no-open` | Run the dashboard without opening a browser |
| `pnpm dev` | Run the bot and dashboard together |
| `pnpm typecheck` | Check TypeScript without producing output |
| `pnpm build` | Compile TypeScript into `dist/` |
| `pnpm start` | Apply migrations and run bot plus dashboard in production |
| `pnpm start:bot` | Run only the compiled bot |
| `pnpm start:dashboard` | Run only the compiled dashboard |

Run `pnpm deploy:commands` after changing static definitions in `src/bot/commands.ts`. Editing dashboard content does not require redeployment because `/custom`, `/announce`, `/ticket-panel`, and `/reaction-roles` load saved data at runtime.

---

## Railway Production

The repository includes `railway.json` and a production `pnpm start` script. The recommended production layout is:

- One long-running Railway service running the bot and dashboard
- One Railway PostgreSQL service
- A Railway public HTTPS domain for staff dashboard access
- One Railway volume mounted at `/app/uploads` if local uploads must persist

Railway supplies `PORT`; the dashboard listens on it and binds to `0.0.0.0`. The `/health` endpoint is used by Railway during deployment.

See the full deployment walkthrough in [docs/SETUP.md#deploy-to-railway](docs/SETUP.md#deploy-to-railway).

Vercel can host a separate frontend-only dashboard later, but it is not recommended for this bot process. The Discord gateway connection needs a long-running Node service rather than a serverless function.

---

## Documentation

- **[Setup and Railway deployment](docs/SETUP.md)** — Complete first-time setup with step-by-step instructions.
- **[Dashboard and feature guide](docs/DASHBOARD-GUIDE.md)** — Detailed walkthroughs for every feature.
- **[Staff dashboard access](docs/STAFF-ACCESS.md)** — How to give staff access safely.
- **[Troubleshooting](docs/TROUBLESHOOTING.md)** — Fix common problems with step-by-step solutions.

---

## Project Structure

```text
src/
  bot/                 Discord commands and interaction handlers
  dashboard/
    public/            Browser dashboard HTML, CSS, and JavaScript
    api.ts             Authenticated dashboard API
    server.ts          Express server and login session
  database/
    adapter.ts         SQLite/PostgreSQL adapter
    index.ts           Shared queries and repositories
    schema.ts          SQLite migrations
    schema-postgres.ts PostgreSQL migrations
  shared/              Config, types, placeholders, and validation
  production.ts        Combined production entrypoint
docs/                  Beginner documentation
scripts/rapidbot.mjs   Optional local CLI wrapper
railway.json           Railway build and deployment configuration
```

---

## Security Basics

- `.env`, `data/`, `uploads/`, and build output are ignored by Git.
- Never give staff the bot token or the `.env` file.
- Use the hosted dashboard URL and dashboard password for staff access.
- Keep the local dashboard on `127.0.0.1` unless you intentionally enable trusted local-network access.
- Use a strong unique production password and Railway HTTPS.
- Plan Discord OAuth, CSRF protection, a persistent session store, and per-user audit identity before treating the dashboard as a public SaaS app.
