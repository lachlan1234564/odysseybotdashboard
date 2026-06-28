# Bot Dashboard

Bot Dashboard is a self-hosted Discord bot dashboard built with TypeScript, `discord.js` v14, Express, pnpm, SQLite for local development, and PostgreSQL for Railway production hosting.

It gives server owners a private admin panel for tickets, transcripts, AutoMod, logging, verification, role panels, giveaways, polls, moderation, custom commands, socials, welcome/boost messages, and server settings.

## Quick Start

```bash
pnpm install
pnpm db:setup
pnpm dev
```

Open `http://127.0.0.1:3210/setup`, paste your Discord bot details, create a dashboard password, then restart the bot if it was already running without a token.
You can also open `http://127.0.0.1:3210/` first for the public Get Started page.

After setup, deploy slash commands:

```bash
pnpm deploy:commands
```

## Main Features

- Public-ready setup wizard at `/setup`
- Public home page at `/` with a Get Started flow
- Discord bot invite link generation from the setup form
- Encrypted server-side Discord bot token storage
- Dashboard login with a password created during setup
- Multi-server dashboard selection
- Tickets, ticket types, close flows, and transcripts
- Custom command builder
- Announcements and social promotion embeds
- AutoMod, anti-raid, anti-nuke, and role protection
- Server event logging
- Verification gate with Discord OAuth support
- Role panels, giveaways, polls, moderation cases, and DM tools
- Built-in Help/Docs area inside the dashboard

## Requirements

- Node.js 22+ recommended
- pnpm
- A Discord Developer Portal application
- A Discord bot token
- Discord privileged intents enabled where needed
- SQLite locally or PostgreSQL on Railway

## No Local `.env` Required For Normal Setup

Bot Dashboard can start without a bot token. If the token is missing, the dashboard opens in setup mode instead of crashing.

For normal hosted setup:

1. Deploy the app.
2. Open the public home page at `/`.
3. Click **Get Started**.
4. Create a Discord application/bot in Discord Developer Portal.
5. Paste the bot token and client/application ID into `/setup`.
6. Copy or open the generated invite link.
7. Invite the bot to your server.
8. Create the dashboard password and save setup.
9. Restart the Railway service if the bot started before setup was completed.

The token is encrypted at rest, stored server-side only, and never returned to the browser after saving.

## Important Environment Variables

Most Discord values can be entered in `/setup`. Railway still needs a few infrastructure variables:

| Variable | Required | Purpose |
| --- | --- | --- |
| `SETUP_SECRET_KEY` | Production | Encrypts stored bot tokens and OAuth secrets. Generate with `openssl rand -base64 32`. |
| `DATABASE_URL` | Railway | Railway Postgres connection string. SQLite default works locally. |
| `DATABASE_SSL` | Railway | Set `true` for Railway Postgres if needed. |
| `TRUST_PROXY` | Railway/proxy | Set `true` behind Railway or Cloudflare proxy. |
| `UPLOADS_DIR` | Optional | Use a Railway volume path if uploads/transcripts should survive deploys. |
| `PORT` | Railway | Supplied automatically by Railway. |

Optional compatibility variables still work: `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DASHBOARD_PASSWORD`, `PUBLIC_BASE_URL`, `VERIFY_PUBLIC_BASE_URL`, and `DISCORD_OAUTH_REDIRECT_URI`.

## Local Development

```bash
pnpm install
pnpm db:setup
pnpm dev
```

Useful scripts:

```bash
pnpm bot
pnpm dashboard
pnpm dashboard:no-open
pnpm deploy:commands
pnpm typecheck
pnpm test
pnpm build
pnpm start
```

`pnpm dev` runs the bot and dashboard together. `pnpm start` is the production command used by Railway.

## Railway Hosting

Recommended production setup:

- Railway service runs Bot Dashboard as a long-running Node process.
- Railway Postgres stores shared settings.
- Railway variables store `SETUP_SECRET_KEY`, database settings, and optional compatibility secrets.
- Staff open the hosted dashboard URL and log in with the dashboard password.

Railway build/start commands are already configured:

```bash
pnpm install --frozen-lockfile && pnpm build
pnpm start
```

Health check:

```text
/health
```

Full Railway guide: [RAILWAY_DEPLOYMENT.md](./RAILWAY_DEPLOYMENT.md)

## Discord Setup

In Discord Developer Portal:

1. Create an application.
2. Add a bot.
3. Copy the bot token for `/setup`.
4. Copy the Application ID for `/setup`.
5. Enable privileged intents as needed:
   - Server Members Intent
   - Message Content Intent
6. Use the generated invite link from `/setup`, or invite the bot manually with permissions for the features you use.

Common required permissions:

- View Channels
- Send Messages
- Embed Links
- Attach Files
- Manage Messages
- Manage Channels
- Manage Roles
- Moderate Members
- Kick Members / Ban Members if using moderation
- Read Message History

Move the bot role above roles it needs to assign, remove, mute, verify, or moderate.

## Security Notes

- Never commit `.env`, database files, upload folders, logs, or `node_modules`.
- Never share the Discord bot token with staff.
- Staff should get dashboard access, not Railway secret access, unless they are trusted operators.
- `SETUP_SECRET_KEY` must stay stable. Changing it prevents decrypting previously saved bot tokens.
- Use the token replacement flow if you rotate the Discord bot token.

## Troubleshooting

**Dashboard opens setup every time**

Make sure the database persists and `SETUP_SECRET_KEY` is stable across restarts.

**Bot is offline after setup**

Restart the Railway service or local process, then run:

```bash
pnpm deploy:commands
```

**Slash commands do not show**

Run:

```bash
pnpm deploy:commands
```

Then wait a moment and refresh Discord.

**Verification OAuth fails**

Make sure the redirect URI in Discord Developer Portal exactly matches:

```text
https://your-domain.example/api/verify/callback
```

**Role actions fail**

Move the bot role above the target role and check Manage Roles.

## Updating

```bash
git pull
pnpm install
pnpm db:setup
pnpm build
pnpm start
```

On Railway, pushing to the connected GitHub branch should trigger a rebuild.
