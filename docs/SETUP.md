# Setup and Deployment Guide

This guide walks you through getting the bot running locally and then deploying it to Railway for production use. It is written for first-time server owners—you do not need prior Discord bot experience.

---

## Table of Contents

1. [What You Need Before Starting](#what-you-need-before-starting)
2. [Step 1: Install Required Software](#step-1-install-required-software)
3. [Step 2: Create a Discord Application](#step-2-create-a-discord-application)
4. [Step 3: Invite the Bot to Your Server](#step-3-invite-the-bot-to-your-server)
5. [Step 4: Find Your Server ID](#step-4-find-your-server-id)
6. [Step 5: Install Project Dependencies](#step-5-install-project-dependencies)
7. [Step 6: Create Your `.env` File](#step-6-create-your-env-file)
8. [Step 7: Initialize the Database](#step-7-initialize-the-database)
9. [Step 8: Register Slash Commands](#step-8-register-slash-commands)
10. [Step 9: Start the Bot](#step-9-start-the-bot)
11. [Step 10: Start the Dashboard](#step-10-start-the-dashboard)
12. [Step 11: Verify Everything Builds](#step-11-verify-everything-builds)
13. [Deploy to Railway](#deploy-to-railway)
14. [Why Not Vercel?](#why-not-vercel)

---

## What You Need Before Starting

Before you begin, make sure you have:

- **A Discord account** with permission to add bots to a server (you must be the server owner or have "Manage Server" permission).
- **Node.js 20 or newer** installed on your computer.
- **pnpm 10 or newer** installed on your computer.
- **Git** installed (only if you plan to deploy from GitHub).

If you are not sure whether Node.js or pnpm is installed, open a terminal and run:

```bash
node --version
pnpm --version
```

You should see version numbers like `v20.x.x` and `10.x.x`. If either command is not found, install them first:

- **Node.js**: Download from [https://nodejs.org](https://nodejs.org) (choose the LTS version).
- **pnpm**: Run `npm install -g pnpm` after installing Node.js.

---

## Step 1: Install Required Software

This project uses Node.js and pnpm. Do not use `npm install` and `pnpm install` interchangeably—that creates competing lockfiles and can cause errors.

Check your versions:

```bash
node --version
pnpm --version
```

Both must meet the minimum requirements above.

---

## Step 2: Create a Discord Application

A Discord application is the container that holds your bot. You create it once in the Discord Developer Portal.

1. Open [https://discord.com/developers/applications](https://discord.com/developers/applications) in your browser.
2. Click **New Application** in the top-right corner.
3. Give it a name, such as `Odyssey Bot`, and click **Create**.
4. You are now on the **General Information** page.
5. Copy the **Application ID** (a long number near the top). This is your `DISCORD_CLIENT_ID`.
6. On the left sidebar, click **Bot**.
7. If Discord asks whether to create a bot user, click **Yes, do it!**
8. Under the bot username, click **Reset Token** or **Copy** the existing token. This is your `DISCORD_TOKEN`.
9. Scroll down to **Privileged Gateway Intents** and enable:
   - **Server Members Intent** for welcome messages and member protection.
   - **Message Content Intent** for dashboard-configured Auto Mod rules.

> **Security warning:** Your bot token is like a password. Anyone who has it can control your bot. Never paste it into chat, screenshots, or public repositories. Store it only in your `.env` file.

---

## Step 3: Invite the Bot to Your Server

The bot must be a member of your Discord server before it can do anything.

1. In the Discord Developer Portal, with your application open, click **OAuth2** on the left sidebar.
2. Click **URL Generator**.
3. Under **Scopes**, check these two boxes:
   - `bot`
   - `applications.commands`
4. Under **Bot Permissions**, check these permissions for the complete feature set:
   - View Channels
   - Send Messages
   - Embed Links
   - Attach Files
   - Read Message History
   - Attach Files
   - Manage Channels
   - Manage Messages
   - Manage Roles
   - View Audit Log
   - Moderate Members
   - Kick Members
   - Ban Members
5. Copy the generated URL at the bottom of the page.
6. Paste that URL into a new browser tab and follow the prompts to add the bot to your server.

> **Important:** After the bot joins your server, go to **Server Settings > Roles**, find the bot's role (it usually has the same name as your application), and drag it above any roles the bot needs to manage. For example, if the bot should be able to time out members with the "Member" role, the bot's role must be higher in the list than "Member."

---

## Step 4: Find Your Server ID

Your server has a unique ID number that the bot needs to know.

1. In Discord, click the **User Settings** gear icon next to your username.
2. Scroll down to **App Settings > Advanced**.
3. Toggle **Developer Mode** to ON.
4. Close settings.
5. Right-click your server icon in the left sidebar.
6. Click **Copy Server ID**.

This long number can be used as the optional `DISCORD_GUILD_ID` preference. Odyssey Bot still discovers and manages every server where it is installed.

---

## Step 5: Install Project Dependencies

Open a terminal and navigate to the project folder:

```bash
cd ~/Desktop/rapid-discord-bot
```

Install the project's dependencies:

```bash
pnpm install
```

This downloads all the libraries the bot and dashboard need. It may take a minute or two.

There is also a shorthand command that installs dependencies and initializes the database in one step:

```bash
pnpm setup
```

---

## Step 6: Create Your `.env` File

The `.env` file stores secrets and startup settings. The repository includes an example file called `.env.example`.

1. Copy the example file to create your real `.env`:

```bash
cp .env.example .env
```

> **Do not run this command if `.env` already exists.** It would overwrite your current values.

2. Open `.env` in a text editor and fill in the values you collected:

```dotenv
DISCORD_TOKEN=your_bot_token_here
DISCORD_CLIENT_ID=your_application_id_here
# Optional member verification:
# DISCORD_CLIENT_SECRET=your_oauth_client_secret
# DISCORD_OAUTH_REDIRECT_URI=https://your-domain.example/api/verify/callback
# Optional preferred dashboard server:
DISCORD_GUILD_ID=your_server_id_here
DASHBOARD_PASSWORD=make_this_long_and_random
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

### Environment Variable Reference

| Variable | Required? | What It Does | Example |
|----------|-----------|--------------|---------|
| `DISCORD_TOKEN` | **Yes** | The secret token from Developer Portal > Bot | `MTAx...` |
| `DISCORD_CLIENT_ID` | **Yes** | The Application ID from Developer Portal > General Information | `1234567890123456789` |
| `DISCORD_CLIENT_SECRET` | Verification only | OAuth client secret used by the optional member verification flow. Never share it. | — |
| `DISCORD_OAUTH_REDIRECT_URI` | Verification only | Exact OAuth callback registered in Discord Developer Portal. | `https://bot.example/api/verify/callback` |
| `DISCORD_GUILD_ID` | No | Preferred server selected for a new dashboard session. It does not limit the bot to one server. | `9876543210987654321` |
| `DASHBOARD_PASSWORD` | **Yes** | The shared password for logging into the web dashboard. Minimum 8 characters. | `my-s3cur3-pass` |
| `DATABASE_URL` | **Yes** | Where the database lives. Use SQLite locally, PostgreSQL on Railway. | `file:./data/bot.db` |
| `DATABASE_SSL` | No | Whether to use SSL for the database. `false` locally, `true` on Railway. | `false` |
| `DASHBOARD_PORT` | No | The port the dashboard listens on locally. | `3210` |
| `DASHBOARD_HOST` | No | The network address the dashboard binds to. `127.0.0.1` means only your computer. | `127.0.0.1` |
| `UPLOADS_DIR` | No | Where uploaded images are stored. | `./uploads` |
| `NODE_ENV` | No | `development` locally, `production` on Railway. | `development` |
| `PUBLIC_BASE_URL` | Hosted verification only | Public HTTPS dashboard URL used when creating verification links. | `https://bot.example` |
| `VPN_CHECK_URL_TEMPLATE` | No | Optional provider endpoint with `{ip}` placeholder. Leave unset to disable VPN checks. | `https://provider.example/check/{ip}` |
| `VPN_CHECK_API_KEY` | No | Secret key for the optional VPN/proxy provider. | — |
| `PORT` | Railway only | Supplied automatically by Railway. **Do not set this locally.** | — |

### What Should NOT Go in `.env`

Do not put Discord channel IDs, role IDs, ticket categories, colors, images, or announcement settings in `.env`. The dashboard saves those to the database. Only secrets and process startup values belong in `.env`.

---

## Step 7: Initialize the Database

Run the database setup command:

```bash
pnpm db:setup
```

With `DATABASE_URL=file:./data/bot.db`, this creates a local SQLite database file in the `data/` folder. The command is safe to run again—only pending migrations are applied, so nothing is duplicated.

---

## Step 8: Register Slash Commands

Register the bot's slash commands with Discord so they appear in your server:

```bash
pnpm deploy:commands
```

Because the project uses guild-scoped commands, they usually appear in your server within seconds.

> **When to run this again:** Only when static command definitions in `src/bot/commands.ts` change. Creating a custom command or ticket panel in the dashboard does **not** require redeployment, because `/custom`, `/announce`, and `/ticket-panel` load saved data at runtime.

---

## Step 9: Start the Bot

Start the bot process:

```bash
pnpm bot
```

Keep this terminal window open. A successful login prints something like:

```
Odyssey Bot connected to Discord.
```

Test the bot in Discord by typing:

```
/ping
```

If the bot replies with a pong and a latency number, it is working.

---

## Step 10: Start the Dashboard

Open a **second terminal** in the same folder and run:

```bash
pnpm dashboard
```

This starts the local dashboard and opens your browser to `http://127.0.0.1:3210`.

Log in with the value you set for `DASHBOARD_PASSWORD` in `.env`.

### Alternative ways to start the dashboard

- Start without opening a browser:
  ```bash
  pnpm dashboard:no-open
  ```
- Run both the bot and dashboard together in one terminal:
  ```bash
  pnpm dev
  ```

---

## Step 11: Verify Everything Builds

Before deploying to production, confirm the project compiles without errors:

```bash
pnpm typecheck
pnpm build
```

- `pnpm typecheck` checks TypeScript for errors without creating files.
- `pnpm build` compiles the project into the `dist/` folder.

Production uses the compiled output:

```bash
pnpm start
```

This applies database migrations and then starts both the bot and dashboard as one long-running service.

---

## Deploy to Railway

Railway is the recommended hosting platform because this bot needs a continuously running process (Discord gateway connection) and a web dashboard.

### A. Put the Code in GitHub

1. Create a **private** repository on GitHub.
2. Push the project to that repository.
3. Confirm `.env` is **not** tracked by Git. The `.gitignore` file already excludes it.

Railway receives secrets through its Variables page, not from your Git repository.

### B. Create the Railway Project

1. Go to [https://railway.app](https://railway.app) and create a new project.
2. Add a service from your GitHub repository.
3. Add a **PostgreSQL** database service to the same project.
4. Keep **one application replica** for this MVP.

Railway's builder reads `packageManager` from `package.json`, runs the build command in `railway.json`, and starts the service with `pnpm start`.

### C. Add Railway Environment Variables

On the application service, go to **Variables** and add these:

```dotenv
DISCORD_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_application_id
# Optional preferred dashboard server:
DISCORD_GUILD_ID=your_server_id
DASHBOARD_PASSWORD=use_a_long_unique_production_password
DATABASE_URL=${{Postgres.DATABASE_URL}}
DATABASE_SSL=true
NODE_ENV=production
UPLOADS_DIR=/app/uploads
# Required only when member verification is enabled:
# DISCORD_CLIENT_SECRET=your_oauth_client_secret
# DISCORD_OAUTH_REDIRECT_URI=https://your-railway-domain/api/verify/callback
# PUBLIC_BASE_URL=https://your-railway-domain
# Optional VPN/proxy provider:
# VPN_CHECK_URL_TEMPLATE=https://provider.example/check/{ip}
# VPN_CHECK_API_KEY=your_provider_api_key
```

- **Do not set `PORT`**—Railway injects it automatically.
- `DASHBOARD_PORT` and `DASHBOARD_HOST` are **not needed** when `PORT` exists.
- If your PostgreSQL service is named something other than `Postgres`, use that name in the reference.

### D. Add Persistent Upload Storage

PostgreSQL stores configuration and records, but uploaded image files are still files on disk. Without a volume, uploads disappear during redeployment.

1. In Railway, attach a **volume** to the application service.
2. Mount it at `/app/uploads`.
3. Keep `UPLOADS_DIR=/app/uploads` in your variables.

If you only use public HTTPS image URLs, you do not need a volume.

### E. Deploy and Check Health

Deploy the staged changes. `railway.json` configures:

- **Build:** `pnpm install --frozen-lockfile && pnpm build`
- **Start:** `pnpm start`
- **Health check:** `/health`
- **Restart on failure**

The application reads Railway's `PORT` and binds to `0.0.0.0`. In deployment logs, look for the dashboard listening message and the Discord bot login.

### F. Run Migrations on Railway

The normal `pnpm start` script automatically applies database migrations before starting the bot and dashboard.

For a manual migration from a linked Railway CLI session:

```bash
railway run pnpm db:setup
```

If your Railway variables are sealed and unavailable to `railway run`, open an SSH session to the deployed application service and run:

```bash
node dist/database/setup.js
```

The migration table prevents already-applied versions from running twice.

### G. Generate the Dashboard URL

1. Open the application service in Railway.
2. Go to **Settings > Networking > Public Networking**.
3. Click **Generate Domain**.
4. Open the generated `https://...railway.app` URL.
5. Log in with your `DASHBOARD_PASSWORD`.

Give this URL and password to trusted staff. **Never** give staff the bot token, `.env` file, or Railway database credentials.

### H. Register Commands After Deployment

Guild commands belong to the Discord application, not to one machine. This command discovers every server where the bot is installed and registers the commands in each one:

```bash
pnpm deploy:commands
```

Run it locally with the same Discord application token and client ID from your `.env`. You can also SSH into the Railway application service and run:

```bash
node dist/bot/deploy-commands.js
```

Do not run command deployment on every application startup. Static commands only need redeployment when `src/bot/commands.ts` changes.

### Railway Notes

- Use **one bot process**. Multiple replicas would process the same Discord events, and the current in-memory sessions and cooldowns are not shared.
- A service restart logs dashboard users out and clears custom command cooldowns.
- Use PostgreSQL rather than SQLite in production so data survives container replacement.
- Add database backups and Discord OAuth before expanding access broadly.

Current Railway references:

- [Railway PostgreSQL](https://docs.railway.com/databases/postgresql/)
- [Railway public networking](https://docs.railway.com/reference/public-networking)
- [Railway health checks](https://docs.railway.com/reference/healthchecks)
- [Railway volumes](https://docs.railway.com/volumes)
- [Railway config as code](https://docs.railway.com/config-as-code/reference)

---

## Why Not Vercel?

Vercel is suitable for a **frontend-only dashboard** in a future split deployment. It is **not recommended** for the main Discord bot because serverless functions do not provide the continuously running gateway process this bot needs.
