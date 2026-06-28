# Download and Setup

This guide walks through downloading Bot Dashboard from GitHub and running the Discord bot plus dashboard for the first time.

Bot Dashboard is a long-running Node.js Discord bot with a protected web dashboard. The bot talks to Discord. The dashboard lets you configure server settings, tickets, commands, giveaways, polls, verification, AutoMod, logging, role panels, and more. The database stores the settings for each Discord server.

## Important: Use `/setup` For Normal Setup

Bot Dashboard can start without a local `.env` bot token. The recommended flow is:

```bash
pnpm install
pnpm db:setup
pnpm dev
```

Then open `http://127.0.0.1:3210/setup`, paste the bot token and application ID, and create the dashboard password. After saving setup, restart `pnpm dev` so the bot process connects to Discord.

You can start at `http://127.0.0.1:3210/` for the public Get Started page. The setup page generates a Discord invite link after you enter the application ID.

The `.env` file is now mainly for infrastructure values such as `DATABASE_URL`, `SETUP_SECRET_KEY`, ports, proxy mode, and optional compatibility overrides.

## What You Need Before Starting

You need:

- A computer or server where you can run Node.js.
- Node.js 20 or newer.
- pnpm 10 or newer.
- A Discord account.
- A Discord server where you have permission to invite/manage bots.
- A Discord Developer Portal application.
- A bot token.
- A Discord application/client ID.
- SQLite locally, or Railway PostgreSQL for production.

Optional, only for Discord OAuth member verification:

- Discord OAuth client secret.
- A public HTTPS verification URL.
- `DISCORD_OAUTH_REDIRECT_URI`.
- Cloudflare Tunnel or another HTTPS host if running from your own machine.

## Step 1: Download From GitHub

### Option A: Download ZIP

Use this if you do not know Git yet.

1. Open the GitHub repository page.
2. Click **Code**.
3. Click **Download ZIP**.
4. Unzip the file.
5. Rename the folder if you want.
6. Open Terminal inside that folder.

### Option B: Clone With Git

Use this if you have Git installed.

```bash
git clone <YOUR_GITHUB_REPO_URL>
cd <REPO_FOLDER>
```

Replace `<YOUR_GITHUB_REPO_URL>` with the repository URL and `<REPO_FOLDER>` with the folder that was created.

## Step 2: Install Dependencies

```bash
pnpm install
```

If `pnpm` is not found, enable it through Corepack:

```bash
corepack enable
corepack prepare pnpm@latest --activate
pnpm install
```

## Step 3: Optional `.env`

For local development, you can skip this if the default SQLite database and port are fine. Create it only if you need custom local infrastructure settings:

```bash
cp .env.example .env
```

Open `.env` in your editor if you created it.

Do not upload `.env` to GitHub. Do not send it to staff. It contains secrets.

## Step 4: Create the Discord Application

1. Open [Discord Developer Portal](https://discord.com/developers/applications).
2. Click **New Application**.
3. Name it, for example `Bot Dashboard`.
4. Open **General Information**.
5. Copy **Application ID**.
6. Keep it ready for the `/setup` page:

```dotenv
DISCORD_CLIENT_ID=your_application_id
```

## Step 5: Create the Bot Token

1. In the Developer Portal, open **Bot**.
2. Click **Add Bot** if needed.
3. Click **Reset Token** or **Copy Token**.
4. Keep it ready for the `/setup` page:

```dotenv
DISCORD_TOKEN=your_bot_token
```

Important: the bot token is private. Anyone with it can control your bot.
The generated invite link never includes this token.

## Step 6: Enable Privileged Intents

In **Bot → Privileged Gateway Intents**, enable:

- **Server Members Intent**
- **Message Content Intent**

These are needed for member automation, verification, welcome messages, AutoMod message checks, and some logging behavior.

## Step 7: Fill In `/setup`

After you start the dashboard in Step 13, open:

```text
http://127.0.0.1:3210/setup
```

Enter:

- Dashboard name
- Discord bot token
- Discord application/client ID
- Optional OAuth client secret for verification
- Optional preferred server ID
- Dashboard password

Optional local `.env` compatibility values still work if you prefer them:

```dotenv
DISCORD_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_application_id
DATABASE_URL=file:./data/bot.db
DATABASE_SSL=false
DASHBOARD_PORT=3210
DASHBOARD_HOST=127.0.0.1
UPLOADS_DIR=./uploads
NODE_ENV=development
```

Optional preferred server:

```dotenv
DISCORD_GUILD_ID=your_server_id
```

This only chooses the first server shown in a new dashboard session. It does not limit Bot Dashboard to one server.

## Step 8: Optional Verification Values

Only add these if you want Discord OAuth verification. You can enter them in `/setup`, or store them as private environment variables.

```dotenv
DISCORD_CLIENT_SECRET=your_oauth_client_secret
DISCORD_OAUTH_REDIRECT_URI=https://verify.example.com/api/verify/callback
VERIFY_PUBLIC_BASE_URL=https://verify.example.com
PUBLIC_BASE_URL=https://admin.example.com
TRUST_PROXY=true
```

Where to find `DISCORD_CLIENT_SECRET`:

1. Developer Portal → your app.
2. Open **OAuth2**.
3. Copy **Client Secret**.

Do not use the bot token as the client secret. They are different values.

The redirect URI must match exactly in both places:

- Discord Developer Portal → OAuth2 → Redirects
- `/setup` or environment variable → `DISCORD_OAUTH_REDIRECT_URI`

Example:

```text
https://verify.example.com/api/verify/callback
```

## Step 9: Optional VPN/Proxy Check Variables

VPN/proxy checks are off unless both values are configured and the dashboard toggle is enabled.

```dotenv
VPN_CHECK_URL_TEMPLATE=https://provider.example/check/{ip}
VPN_CHECK_API_KEY=your_provider_api_key
```

Use a provider endpoint that supports an IP placeholder. Do not store raw user IPs unnecessarily.

## Step 10: Set Up the Database

For local SQLite:

```bash
pnpm db:setup
```

This creates `data/bot.db` and applies migrations.

For Railway PostgreSQL, set `DATABASE_URL` to the Railway Postgres URL and run the same command:

```bash
pnpm db:setup
```

## Step 11: Invite the Bot

In Developer Portal:

1. Open **OAuth2 → URL Generator**.
2. Select scopes:
   - `bot`
   - `applications.commands`
3. Select bot permissions:
   - View Channels
   - Send Messages
   - Embed Links
   - Read Message History
   - Manage Messages
   - Manage Channels
   - Manage Roles
   - Moderate Members
   - Kick Members
   - Ban Members
   - View Audit Log
4. Copy the generated URL.
5. Open it in your browser.
6. Invite the bot to your server.

You can skip the manual URL Generator if you use the invite link generated by `/setup` after entering the application ID.

After inviting, move the Bot Dashboard role above roles it needs to manage. This matters for:

- Verification role assignment
- Role panels
- Muted role/timeouts
- Ticket permissions
- Moderation actions

## Step 12: Deploy Slash Commands

```bash
pnpm deploy:commands
```

This registers slash commands in every Discord server where the bot is installed.

Run it again when code changes static command definitions. You do not need to run it after changing dashboard settings.

## Step 13: Run Locally

Run both the bot and dashboard:

```bash
pnpm dev
```

Or run them in separate terminals.

Terminal 1:

```bash
pnpm bot
```

Terminal 2:

```bash
pnpm dashboard
```

Open:

```text
http://127.0.0.1:3210
```

Log in using `DASHBOARD_PASSWORD`.

## Step 14: First Dashboard Setup

After login:

1. Choose your Discord server.
2. Open **Server Settings**.
3. Set staff/admin roles.
4. Set logging channels.
5. Set announcement channel.
6. Set ticket category/transcript channel if using tickets.
7. Save settings.

Then configure the feature you want:

- Tickets → create ticket types and panels.
- Command Studio → create custom commands.
- Announcements → create templates.
- Automation → configure AutoMod, role panels, sticky messages, and schedules.
- Security → configure anti-raid, anti-nuke, role protection, and verification.
- Moderation → view warnings and cases.
- Logging → enable event categories.

## Building for Production

Compile TypeScript:

```bash
pnpm build
```

Run the compiled production app:

```bash
pnpm start
```

`pnpm start` runs database setup first, then starts the combined production bot/dashboard process.

## Railway Production Setup

Railway is recommended because the Discord bot must stay online as a long-running Node process.

Use:

- One Railway service for Bot Dashboard.
- One Railway PostgreSQL database.
- One Railway volume for uploads if you use image uploads.

Set Railway variables:

```dotenv
DISCORD_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_application_id
DASHBOARD_PASSWORD=use_a_long_unique_production_password
DATABASE_URL=${{Postgres.DATABASE_URL}}
DATABASE_SSL=true
UPLOADS_DIR=/app/uploads
NODE_ENV=production
```

Optional verification:

```dotenv
DISCORD_CLIENT_SECRET=your_oauth_client_secret
DISCORD_OAUTH_REDIRECT_URI=https://verify.example.com/api/verify/callback
VERIFY_PUBLIC_BASE_URL=https://verify.example.com
PUBLIC_BASE_URL=https://admin.example.com
TRUST_PROXY=true
```

Railway supplies `PORT` automatically. Do not hard-code it.

Build/start settings are already in `railway.json`:

```text
Build: pnpm install --frozen-lockfile && pnpm build
Start: pnpm start
Health check: /health
```

## Actual Package Scripts

These are the real scripts from `package.json`:

| Command | What it does |
|---|---|
| `pnpm setup` | Runs `pnpm install` and `pnpm db:setup`. |
| `pnpm dev` | Runs bot and dashboard together. |
| `pnpm bot` | Starts the TypeScript bot. |
| `pnpm dashboard` | Starts the dashboard and opens the browser. |
| `pnpm dashboard:no-open` | Starts the dashboard without opening the browser. |
| `pnpm deploy:commands` | Registers slash commands in Discord. |
| `pnpm db:setup` | Applies database migrations. |
| `pnpm test` | Runs tests. |
| `pnpm typecheck` | Runs TypeScript checking. |
| `pnpm build` | Compiles TypeScript. |
| `pnpm start` | Runs migrations and starts production bot/dashboard. |
| `pnpm start:bot` | Starts only the compiled bot. |
| `pnpm start:dashboard` | Starts only the compiled dashboard. |

## What Goes In `.env` vs Dashboard

Put only secrets/startup values in `.env`:

- Bot token
- Client ID
- Client secret
- Dashboard password
- Database URL
- Public URLs
- Port/host settings
- Optional VPN provider key

Configure these from the dashboard:

- Discord channel IDs
- Discord role IDs
- Ticket categories/types/panels
- Transcript channels
- Announcement templates
- Embed colors/images
- Giveaways
- Polls
- Role panels
- Logging categories
- AutoMod rules
- Verification settings
- Moderation settings

## Common Mistakes

### Bot is offline

- `pnpm bot` or `pnpm dev` is not running.
- `DISCORD_TOKEN` is wrong.
- The bot was not invited to the server.
- The token was reset in Developer Portal but `.env` was not updated.

### Slash commands do not appear

- Run `pnpm deploy:commands`.
- Make sure the bot is in the server.
- Restart Discord or wait briefly for the command list to refresh.

### Dashboard opens but bot does nothing

- The dashboard and bot are separate processes in development.
- Run `pnpm dev`, or run `pnpm bot` in a second terminal.

### Permission errors

- Move the bot role higher.
- Give the bot required permissions.
- For moderation logs, grant **View Audit Log**.
- For verification/role panels, grant **Manage Roles**.
- For tickets, grant **Manage Channels**.

### Verification fails

- Set `DISCORD_CLIENT_SECRET`.
- Set `VERIFY_PUBLIC_BASE_URL`.
- Set `DISCORD_OAUTH_REDIRECT_URI`.
- Add the exact same redirect URI in Discord Developer Portal.
- Do not put the bot token in `DISCORD_CLIENT_SECRET`.

### Uploaded images disappear in production

- Use a persistent Railway volume.
- Set `UPLOADS_DIR=/app/uploads`.

### Database errors

- Run `pnpm db:setup`.
- Check `DATABASE_URL`.
- For Railway Postgres, set `DATABASE_SSL=true` if required.

## Updating From GitHub

```bash
git pull
pnpm install
pnpm db:setup
pnpm deploy:commands
pnpm build
```

Restart the process after updating.

## Where to Read More

- [README](../README.md)
- [Dashboard guide](DASHBOARD-GUIDE.md)
- [Tickets](TICKET-PANELS.md)
- [Ticket transcripts](TICKET-TRANSCRIPTS.md)
- [Giveaways](GIVEAWAYS.md)
- [Polls](POLLS.md)
- [Role panels](ROLE-PANELS.md)
- [Moderation cases](MODERATION-CASES.md)
- [Verification](verification-process.md)
- [Logging](MODLOGS.md)
- [AutoMod](AUTO-MOD.md)
- [Railway hosting](RAILWAY-HOSTING.md)
- [Troubleshooting](TROUBLESHOOTING.md)
