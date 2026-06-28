# Getting Started

CorePanel is a self-hosted Discord bot with a web dashboard. You create commands, ticket systems, announcements, and security rules in the dashboard, and the bot executes them in Discord.

## Quick setup

1. Install dependencies: `pnpm install`
2. Set up the database: `pnpm db:setup`
3. Start the bot/dashboard: `pnpm dev`
4. Open `http://127.0.0.1:3210/setup`
5. Paste the Discord bot token and application ID, then create the dashboard password
6. Restart `pnpm dev`
7. Register slash commands: `pnpm deploy:commands`

## Setup values

- Bot token — from Discord Developer Portal
- Application/client ID — from Discord Developer Portal
- Dashboard password — created on `/setup`
- `DATABASE_URL` — optional locally; defaults to `file:./data/bot.db`
- `COREPANEL_SECRET_KEY` — required on Railway to encrypt stored secrets
- `TRUST_PROXY` — set to `true` behind Railway, Cloudflare Tunnel, nginx, or another reverse proxy

Optional env compatibility values still work, but the dashboard setup wizard is the recommended path.

Open the dashboard's [Setup guide](/docs/setup) for the complete setup reference, including verification and optional VPN provider settings.

## Next steps

After setup, open the dashboard and configure:
- Server Settings (channels, roles)
- Ticket types and panels
- Custom commands
- Welcome messages
- Security (anti-raid / anti-nuke)
