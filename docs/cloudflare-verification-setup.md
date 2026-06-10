# Cloudflare Tunnel verification setup

This guide explains how to run Odyssey Bot behind a Cloudflare Tunnel with separate public/private hostnames so the admin dashboard stays protected and the verification page is accessible to your members.

---

## Accounts you need

| Service | Why | Cost |
|---------|-----|------|
| **Discord Developer Portal** | Bot token, OAuth client secret, redirect URL | Free |
| **Cloudflare account** | Tunnel, DNS, Access policies | Free tier works |
| **A domain on Cloudflare** | `admin.example.com` and `verify.example.com` | ~$10/year |
| **IP risk provider** (optional) | VPN/proxy checking during verification | Free tier available |
| **Cloudflare Turnstile** (optional) | Extra bot protection on the verify page | Free |

---

## Step 1: Discord Developer Portal

1. Go to [discord.com/developers/applications](https://discord.com/developers/applications) and open your bot application.
2. Under **OAuth2 → Redirects**, add:
   ```
   https://verify.YOUR_DOMAIN.com/api/verify/callback
   ```
   This is the ONLY redirect URL you need. Do not add `admin.YOUR_DOMAIN.com` here.
3. Copy your **Client Secret** (not the Bot Token) from the OAuth2 page. You'll put this in `.env` as `DISCORD_CLIENT_SECRET`.

---

## Step 2: Install and authenticate Cloudflare Tunnel

```bash
# macOS/Linux
brew install cloudflared
# or download from https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/

# Authenticate
cloudflared tunnel login
```

Create the tunnel:

```bash
cloudflared tunnel create odyssey-bot
```

This outputs a tunnel UUID. Save it.

---

## Step 3: Configure Cloudflare DNS

In the Cloudflare dashboard → DNS, add two CNAME records pointing to your tunnel:

| Type | Name | Target |
|------|------|--------|
| CNAME | `admin` | `TUNNEL_UUID.cfargotunnel.com` |
| CNAME | `verify` | `TUNNEL_UUID.cfargotunnel.com` |

Turn the orange cloud (proxy) ON for both records.

---

## Step 4: Cloudflare Access for the admin dashboard

The verification hostname (`verify.YOUR_DOMAIN.com`) must remain **public** with no Access policy. The admin dashboard (`admin.YOUR_DOMAIN.com`) must be **protected**.

1. Go to Cloudflare Zero Trust → Access → Applications.
2. Click **Add an application** → **Self-hosted**.
3. Application name: `Odyssey Bot Admin`
4. Subdomain: `admin`
5. Domain: `YOUR_DOMAIN.com`
6. Under **Identity providers**, choose One-time PIN (simplest) or add Google/GitHub.
7. Create the policy, then save.

> **Critical:** Do NOT create an Access policy for `verify.YOUR_DOMAIN.com`. The verification page MUST be publicly accessible so Discord OAuth can redirect back to it.

---

## Step 5: Configure the tunnel

Create `~/.cloudflared/config.yml`:

```yaml
tunnel: TUNNEL_UUID
credentials-file: /Users/YOU/.cloudflared/TUNNEL_UUID.json

ingress:
  - hostname: admin.YOUR_DOMAIN.com
    service: http://127.0.0.1:3210
  - hostname: verify.YOUR_DOMAIN.com
    service: http://127.0.0.1:3210
  - service: http_status:404
```

Start the tunnel:

```bash
cloudflared tunnel run odyssey-bot
```

---

## Step 6: `.env` configuration

```bash
# --- Required for the bot ---
DISCORD_TOKEN=your_bot_token_here
DISCORD_CLIENT_ID=your_application_id_here

# --- Required for the dashboard ---
DASHBOARD_PASSWORD=your_strong_password_here

# --- Database ---
DATABASE_URL=file:./data/bot.db

# --- Verification (OAuth) ---
DISCORD_CLIENT_SECRET=your_oauth_client_secret_here
DISCORD_OAUTH_REDIRECT_URI=https://verify.YOUR_DOMAIN.com/api/verify/callback
VERIFY_PUBLIC_BASE_URL=https://verify.YOUR_DOMAIN.com
# Optional admin dashboard URL:
# PUBLIC_BASE_URL=https://admin.YOUR_DOMAIN.com

# --- Required for Cloudflare Tunnel ---
TRUST_PROXY=true

# --- Optional: VPN/proxy risk provider ---
# VPN_CHECK_URL_TEMPLATE=https://pro.ip-api.com/json/{ip}?fields=proxy,hosting
# VPN_CHECK_API_KEY=your_provider_api_key_here

# --- Required: listen on 0.0.0.0 for the tunnel ---
PORT=3210
```

> **Why `PORT=3210`?** When `PORT` is set, the dashboard listens on `0.0.0.0:3210` instead of `127.0.0.1:3210`, which Cloudflare Tunnel needs to reach it. Alternatively, set `DASHBOARD_HOST=0.0.0.0` instead of `PORT`.
>
> **Why `TRUST_PROXY=true`?** Without it, Express ignores `X-Forwarded-For` headers from Cloudflare. The bot will see Cloudflare's IP instead of the real user IP, breaking VPN checks and IP-based logging.

---

## Step 7: Discord OAuth redirect URL — the exact value

Registered in Discord Developer Portal → OAuth2 → Redirects:

```
https://verify.YOUR_DOMAIN.com/api/verify/callback
```

Set in `.env`:

```
DISCORD_OAUTH_REDIRECT_URI=https://verify.YOUR_DOMAIN.com/api/verify/callback
```

These must match exactly. If they don't, Discord returns "Invalid OAuth2 redirect_uri."

---

## Local testing

You can test everything locally before deploying:

```bash
# Start bot + dashboard
pnpm dev

# In another terminal, start a Cloudflare Tunnel for testing
cloudflared tunnel --url http://127.0.0.1:3210

# The tunnel prints a temporary URL like https://random-name.trycloudflare.com
# Use that as both VERIFY_PUBLIC_BASE_URL and DISCORD_OAUTH_REDIRECT_URI for local testing
```

For local dev without a tunnel (no OAuth testing), leave `DISCORD_CLIENT_SECRET` unset. The dashboard still works for tickets, automod, socials, etc. Only verification is disabled.

---

## Common mistakes

| Mistake | What happens | Fix |
|---------|-------------|-----|
| Wrong redirect URI in Discord Portal | OAuth returns "Invalid redirect_uri" | Must be `https://verify.DOMAIN.com/api/verify/callback` exactly |
| Protecting verify hostname with Access | "Cloudflare Access" login shown to Discord servers, OAuth fails | Remove Access policy from `verify.DOMAIN.com` |
| Using bot token as `DISCORD_CLIENT_SECRET` | OAuth token exchange fails | Bot token ≠ Client Secret. Find the secret under OAuth2 → Client Secret |
| Not setting `PORT=3210` or `DASHBOARD_HOST=0.0.0.0` | Tunnel can't reach `127.0.0.1` | Set `PORT=3210` or `DASHBOARD_HOST=0.0.0.0` in `.env` |
| Not setting `TRUST_PROXY=true` | VPN checks see Cloudflare's IP, not the real user IP | Set `TRUST_PROXY=true` in `.env` |
| `VERIFY_PUBLIC_BASE_URL` points to admin domain | Verification links and OAuth callbacks use wrong hostname | Must use `https://verify.DOMAIN.com` |
| Exposing dashboard publicly without Access | Anyone at `admin.DOMAIN.com` can brute-force the dashboard password | Always protect with Cloudflare Access |
| Tunnel not running | Both sites return 502 | Keep `cloudflared tunnel run` running |
| CSP blocks Cloudflare scripts | Dashboard layout broken | The CSP is set to `'self'` only; if you use Turnstile or Cloudflare widgets, you will need to allow their domains |
