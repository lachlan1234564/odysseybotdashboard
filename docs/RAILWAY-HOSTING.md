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
SETUP_SECRET_KEY=generate_with_openssl_rand_base64_32
DATABASE_URL=${{Postgres.DATABASE_URL}}
DATABASE_SSL=true
UPLOADS_DIR=/app/uploads
NODE_ENV=production
TRUST_PROXY=true
# Optional VPN/proxy provider:
# VPN_CHECK_URL_TEMPLATE=https://provider.example/check/{ip}
# VPN_CHECK_API_KEY=your-provider-key
```

Railway supplies `PORT` automatically. Do not hardcode it. The app detects `PORT` and listens on `0.0.0.0`.

Generate the secret with:

```bash
openssl rand -base64 32
```

Keep `SETUP_SECRET_KEY` stable. It encrypts the bot token and OAuth client secret that you save from the hosted `/setup` page.

Optional compatibility variables such as `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DASHBOARD_PASSWORD`, `PUBLIC_BASE_URL`, `VERIFY_PUBLIC_BASE_URL`, and `DISCORD_OAUTH_REDIRECT_URI` still work, but the recommended public-hosting flow is to enter those values in `/setup`.

For verification, add the exact redirect URI to the application's OAuth2 redirects in Discord Developer Portal. Keep the client secret and provider key private.

## Build and start

Use:

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm start
```

The production `start` script runs database setup before starting the dashboard and Discord bot processes. It is safe to rerun because migrations are versioned.

## First-run setup

After the first deploy:

1. Open the Railway public URL.
2. Click **Get Started** on the public home page.
3. Create your Discord application and bot in Discord Developer Portal.
4. Paste the Discord bot token and application/client ID into `/setup`.
5. Copy or open the generated invite link and invite the bot to your server.
6. Add the OAuth client secret only if you will use verification.
7. Create the dashboard password.
8. Save setup.
9. Restart the Railway service if it was already running before setup was saved.

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
