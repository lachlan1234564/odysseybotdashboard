# Download and Setup

This guide is for someone downloading Odyssey Bot from GitHub and running the bot plus dashboard for the first time.

## What Odyssey Bot Is

Odyssey Bot is a Discord administration bot with a local or hosted dashboard. It can manage tickets, custom commands, announcements, role panels, giveaways, moderation cases, verification, AutoMod, server logs, welcomes, and social promotion embeds.

The Discord bot is a long-running Node process. The dashboard is a protected web app that saves settings into the shared database.

## Requirements

- Node.js 20 or newer
- pnpm
- A Discord Developer Portal application
- A bot token
- Your application/client ID
- A Discord server where you can invite the bot
- SQLite for local use, or Railway Postgres for production
- Optional: Discord client secret and Cloudflare Tunnel for public verification links

## Download From GitHub

### Option 1: Clone With Git

```bash
git clone <YOUR_GITHUB_REPO_URL>
cd <REPO_FOLDER>
```

### Option 2: Download ZIP

1. Open the GitHub repository.
2. Click **Code**.
3. Click **Download ZIP**.
4. Unzip it.
5. Open a terminal inside the project folder.

## Install Dependencies

```bash
pnpm install
```

## Create Your Environment File

```bash
cp .env.example .env
```

Open `.env` and fill in placeholder values only on your own machine or host.

Required local values:

```dotenv
DISCORD_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_application_id
DASHBOARD_PASSWORD=choose_a_long_random_password
DATABASE_URL=file:./data/bot.db
DASHBOARD_PORT=3210
DASHBOARD_HOST=127.0.0.1
```

Optional verification values:

```dotenv
DISCORD_CLIENT_SECRET=your_oauth_client_secret
DISCORD_OAUTH_REDIRECT_URI=https://verify.example.com/api/verify/callback
VERIFY_PUBLIC_BASE_URL=https://verify.example.com
PUBLIC_BASE_URL=https://admin.example.com
TRUST_PROXY=true
```

Never share `.env` with staff. Staff should receive dashboard access only, not the Discord bot token.

## Invite the Bot

In the Discord Developer Portal:

1. Open your application.
2. Go to **OAuth2 → URL Generator**.
3. Select `bot` and `applications.commands`.
4. Add permissions needed for your features:
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
5. Open the generated URL and invite the bot to your server.

## Required Intents

In **Bot → Privileged Gateway Intents**, enable:

- Server Members Intent
- Message Content Intent

These are required for member automation, verification, logging, and AutoMod message rules.

## Set Up the Database

```bash
pnpm db:setup
```

This creates local SQLite tables. On Railway Postgres, run the same command after setting `DATABASE_URL`.

## Deploy Slash Commands

```bash
pnpm deploy:commands
```

This registers commands in every server where the bot is installed.

## Run Locally

Run the bot:

```bash
pnpm bot
```

Run the dashboard in another terminal:

```bash
pnpm dashboard
```

Or run both together:

```bash
pnpm dev
```

Open `http://127.0.0.1:3210`, log in with `DASHBOARD_PASSWORD`, choose your server, then configure channels and roles from the dashboard.

## Production Build

```bash
pnpm build
pnpm start
```

For Railway, use a long-running service, not Vercel serverless functions. Vercel is only reasonable later for a separate frontend-only dashboard.

## Updating From GitHub

```bash
git pull
pnpm install
pnpm db:setup
pnpm deploy:commands
pnpm build
```

Restart the bot/dashboard after updating.

## Common Mistakes

- Forgetting to enable privileged intents.
- Putting channel IDs or role IDs in `.env` instead of the dashboard.
- Bot role is below roles it needs to assign.
- Missing View Audit Log, so executor names show as unknown.
- Running only the dashboard but not the bot.
- Not redeploying slash commands after adding new commands.

## Useful Commands

```bash
pnpm install
pnpm db:setup
pnpm deploy:commands
pnpm dev
pnpm build
pnpm start
```

## Getting Help

Use the dashboard **Docs / Help** area for setup guides and troubleshooting. For bugs, include the terminal error, the dashboard page, and which Discord server feature you were testing.
