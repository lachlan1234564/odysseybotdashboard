# Railway Hosting

Railway is the intended production host because the Discord bot needs a long-running Node process and a persistent WebSocket connection.

## Recommended layout

- One Railway service runs the bot and dashboard with `pnpm start`.
- Railway PostgreSQL stores shared settings and records.
- A Railway volume mounted at `/app/uploads` stores uploaded images.
- Staff open the generated HTTPS dashboard URL and sign in with the dashboard password.

## Required variables

Add these in the Railway application service:

```dotenv
DISCORD_TOKEN=your-secret-bot-token
DISCORD_CLIENT_ID=your-application-id
# Optional preferred dashboard server:
DISCORD_GUILD_ID=your-server-id
DASHBOARD_PASSWORD=a-long-unique-password
DATABASE_URL=${{Postgres.DATABASE_URL}}
DATABASE_SSL=true
UPLOADS_DIR=/app/uploads
NODE_ENV=production
# Required only for Security > Verification:
# DISCORD_CLIENT_SECRET=your-oauth-client-secret
# DISCORD_OAUTH_REDIRECT_URI=https://your-railway-domain/api/verify/callback
# VERIFY_PUBLIC_BASE_URL=https://verify.YOUR_DOMAIN.com
# PUBLIC_BASE_URL=https://your-railway-domain
# Optional VPN/proxy provider:
# VPN_CHECK_URL_TEMPLATE=https://provider.example/check/{ip}
# VPN_CHECK_API_KEY=your-provider-key
# Optional Cloudflare Tunnel / reverse proxy:
# TRUST_PROXY=true
```

Railway supplies `PORT` automatically. Do not hardcode it. The app detects `PORT` and listens on `0.0.0.0`.

For verification, add the exact `DISCORD_OAUTH_REDIRECT_URI` to the application's OAuth2 redirects in Discord Developer Portal. Keep the client secret and provider key in Railway Variables only.

## Build and start

Use:

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm start
```

The production `start` script runs database setup before starting the dashboard and Discord bot processes. It is safe to rerun because migrations are versioned.

## Register Discord commands

After setting the production variables, run this once from a Railway shell or from your local project using the same Discord application values:

```bash
pnpm deploy:commands
```

The deploy script registers commands in every server where the bot is installed. Run it again only when the static definitions in `src/bot/commands.ts` change. Dashboard-created `/custom` content does not need command redeployment.

## Staff access

1. Generate a Railway public domain.
2. Open the HTTPS URL and verify the login page.
3. Give trusted staff only the URL and dashboard password.
4. Never give staff `DISCORD_TOKEN`, the `.env` file, or database credentials.

Use one service replica for this MVP. Multiple replicas would create duplicate bot connections and do not share the in-memory dashboard session store or command cooldown map.

## Upload persistence

Mount a Railway volume at `/app/uploads` and keep `UPLOADS_DIR=/app/uploads`. Without a volume, uploaded files may disappear during redeployment.

## Vercel note

Vercel can host a frontend-only dashboard later if the API is separated. It is not recommended for the main Discord bot process because that process must stay connected continuously.
