# Getting Started

Odyssey Bot is a self-hosted Discord bot with a web dashboard. You create commands, ticket systems, announcements, and security rules in the dashboard, and the bot executes them in Discord.

## Quick setup

1. Install dependencies: `pnpm install`
2. Set up the database: `pnpm db:setup`
3. Register slash commands: `pnpm deploy:commands`
4. Start the bot: `pnpm bot`
5. Start the dashboard: `pnpm dashboard`
6. Open `http://127.0.0.1:3210` and log in with your `DASHBOARD_PASSWORD`

## Required environment variables

- `DISCORD_TOKEN` — Bot token from Discord Developer Portal
- `DISCORD_CLIENT_ID` — Application ID
- `DISCORD_GUILD_ID` — Optional preferred server for a new dashboard session
- `DASHBOARD_PASSWORD` — Dashboard login password (min 8 chars)
- `DATABASE_URL` — `file:./data/bot.db` for SQLite
- `TRUST_PROXY` — Set to `true` if behind Cloudflare Tunnel, nginx, or any reverse proxy

Open the dashboard's [Setup guide](/docs/setup) for the complete variable reference, including verification and optional VPN provider settings.

## Next steps

After setup, open the dashboard and configure:
- Server Settings (channels, roles)
- Ticket types and panels
- Custom commands
- Welcome messages
- Security (anti-raid / anti-nuke)
