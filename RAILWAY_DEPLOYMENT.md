# Railway Deployment Guide

This guide explains how to host CorePanel publicly on Railway.

CorePanel is a long-running Discord bot plus dashboard backend. Railway is a good fit because the bot needs a persistent Node process. Vercel-style serverless functions are not recommended for the main bot process.

## 1. Create Railway Services

Create:

1. One Railway **Application Service** for this repository.
2. One Railway **Postgres** database.
3. Optional Railway **Volume** for uploads/transcripts.

## 2. Required Railway Variables

Add these variables to the Railway application service:

```bash
COREPANEL_SECRET_KEY=replace_with_output_from_openssl_rand_base64_32
DATABASE_URL=${{Postgres.DATABASE_URL}}
DATABASE_SSL=true
NODE_ENV=production
TRUST_PROXY=true
```

Generate the secret key locally:

```bash
openssl rand -base64 32
```

Keep `COREPANEL_SECRET_KEY` stable. If you change it later, CorePanel cannot decrypt the saved bot token or OAuth client secret.

Railway provides `PORT` automatically.

Optional:

```bash
UPLOADS_DIR=/app/uploads
PUBLIC_BASE_URL=https://your-app.up.railway.app
VERIFY_PUBLIC_BASE_URL=https://your-app.up.railway.app
DISCORD_OAUTH_REDIRECT_URI=https://your-app.up.railway.app/api/verify/callback
```

You can also enter the Discord token, client ID, dashboard password, and OAuth values from `/setup` instead of Railway variables.

## 3. Build And Start

This repo includes `railway.json`.

Build command:

```bash
pnpm install --frozen-lockfile && pnpm build
```

Start command:

```bash
pnpm start
```

Health check:

```text
/health
```

`pnpm start` runs database setup and then starts both the dashboard and bot process.

## 4. First-Run Setup

After Railway deploys:

1. Open your Railway public URL.
2. Go to `/setup`.
3. Paste your Discord bot token.
4. Paste your Discord client/application ID.
5. Add the Discord client secret if you will use verification.
6. Add public URLs if you know them.
7. Choose the dashboard name and bot display name.
8. Create the dashboard password.
9. Save setup.
10. Restart the Railway service if it started before the token was saved.

The bot token is encrypted server-side only. CorePanel shows only a masked token after saving.

## 5. Deploy Slash Commands

After setup, deploy commands from a Railway shell or from your local machine connected to the same database/config:

```bash
pnpm deploy:commands
```

This registers the slash commands in every Discord server where the bot is installed.

## 6. Invite The Bot

In Discord Developer Portal:

1. Open your application.
2. Go to **OAuth2 → URL Generator**.
3. Select `bot` and `applications.commands`.
4. Choose permissions for the features you use.
5. Open the generated URL and invite the bot.

Recommended permissions:

- View Channels
- Send Messages
- Embed Links
- Attach Files
- Read Message History
- Manage Messages
- Manage Channels
- Manage Roles
- Moderate Members
- Kick Members
- Ban Members

Enable privileged intents:

- Server Members Intent
- Message Content Intent

## 7. Staff Access

Give staff the hosted dashboard URL and dashboard password only.

Do not give staff:

- Discord bot token
- `COREPANEL_SECRET_KEY`
- Railway database credentials
- `.env` files
- Railway owner/admin access unless they are trusted operators

## 8. Token Rotation

If you reset the bot token in Discord:

1. Log in to CorePanel.
2. Use the token replacement flow when available, or return to `/setup` after a setup reset.
3. Paste the new token.
4. Restart the Railway service.
5. Run `pnpm deploy:commands` if commands need to be refreshed.

## 9. Troubleshooting

**Setup says encryption is not ready**

Set `COREPANEL_SECRET_KEY` in Railway and redeploy.

**Dashboard keeps returning to setup**

Check that Railway Postgres is connected and `DATABASE_URL` points to the Postgres service.

**Bot is offline**

Check Railway logs. Confirm setup has a token and restart the service.

**Slash commands are missing**

Run:

```bash
pnpm deploy:commands
```

**Verification redirect mismatch**

The Discord Developer Portal redirect must exactly match:

```text
https://your-domain.example/api/verify/callback
```

**Uploads disappear after deploy**

Attach a Railway volume and set:

```bash
UPLOADS_DIR=/app/uploads
```
