# Verification process

Odyssey Bot includes a transparent anti-alt verification system. This doc explains the full flow — from admin setup through to what the verified member sees.

---

## How the admin sets it up

### 1. Discord Developer Portal

Go to your application in the [Discord Developer Portal](https://discord.com/developers/applications).

**OAuth2 → General:**
Copy your **Client Secret** (not the Bot Token).

**OAuth2 → Redirects:**
Add the exact callback URL:
```
https://verify.YOUR_DOMAIN.com/api/verify/callback
```
or for testing:
```
http://127.0.0.1:3210/api/verify/callback
```

### 2. Environment variables

Add these to `.env`:

```bash
DISCORD_CLIENT_SECRET=your_oauth_client_secret
DISCORD_OAUTH_REDIRECT_URI=https://verify.YOUR_DOMAIN.com/api/verify/callback
VERIFY_PUBLIC_BASE_URL=https://verify.YOUR_DOMAIN.com
# Optional:
PUBLIC_BASE_URL=https://admin.YOUR_DOMAIN.com
TRUST_PROXY=true  # if behind Cloudflare Tunnel or a reverse proxy
```

If `DISCORD_CLIENT_SECRET` is not set, the entire verification feature is disabled — the dashboard shows a warning, the enable toggle is blocked, and routes return 503.

| Variable | Purpose | Fallback |
|----------|---------|----------|
| `DISCORD_CLIENT_SECRET` | Discord OAuth client secret | (none — verification disabled without it) |
| `DISCORD_OAUTH_REDIRECT_URI` | Exact OAuth callback URL | `VERIFY_PUBLIC_BASE_URL`/`api/verify/callback` |
| `VERIFY_PUBLIC_BASE_URL` | Public URL for verification links | `PUBLIC_BASE_URL` then `req.host` |
| `PUBLIC_BASE_URL` | Admin dashboard URL | (none) |
| `TRUST_PROXY` | Trust `X-Forwarded-For` from Cloudflare | `false` (auto-true in production) |
| `VPN_CHECK_URL_TEMPLATE` | VPN provider URL with `{ip}` | (none — VPN checks skipped) |
| `VPN_CHECK_API_KEY` | VPN provider API key | (none) |

### 3. Dashboard settings

Go to **Security → Verification** in the dashboard. The provider status cards show what's configured.

Fields:

| Setting | Default | What it does |
|---------|---------|--------------|
| Enabled | Off | Turn on verification for this server |
| Verified role | None | Role assigned after passing (optional) |
| Action | Flag for review | What happens when risk signals are found |
| Log channel | None | Where moderation logs go |
| Min account age (days) | 0 | Flags accounts newer than this |
| Min server time (days) | 0 | Flags members newer than this |
| VPN/proxy check | Off | Requires provider env vars |
| Fail if VPN check unavailable | Off | Block if the VPN provider is down |
| Device consistency check | Off | Flag if same device hash appears for another account |
| Record retention (hours) | 168 | Auto-delete old records after this time |

**Action modes:**
- **Allow all**: Records pass/fail but takes no action. Useful for testing.
- **Flag for review**: Default. Stores flagged records but does not block.
- **Deny**: Blocks verification if any risk signal is found.
- **Assign verified role**: Assigns the configured role on pass (falls through to flag behavior if no role set).

### 4. Creating a verification link

Click **Create link** on the dashboard. A new link appears (expires in 24 hours). Copy it and share it — post it in a welcome channel, send it via DM, or include it in server rules.

---

## What the member sees

### Step 1: The consent page

When the member opens the verification link (`https://verify.YOUR_DOMAIN.com/verify/<token>`), they see a page with:

> **What happens during verification**
> This server uses verification to reduce raids and alternate-account abuse. Verification may check your Discord account age, server membership, network risk, and device consistency signals.
>
> **What is stored**
> A salted risk record with reason codes (e.g. "new Discord account", "VPN detected"), a limited-time risk score, and your Discord user ID. No raw technical data is shown to server staff.
>
> **What is not stored**
> No raw IP addresses, no browser fingerprints, no device identifiers, and no personal information beyond what Discord already shares.

They must click **"I agree, verify me"** to proceed.

### Step 2: Discord OAuth

They are redirected to Discord to authorize the bot. The requested permissions are:
- Know who you are on Discord (`identify`)
- Know what servers you're in (`guilds.members.read`)

No bot permissions are granted. This is a read-only identity check.

### Step 3: Verification checks

After authorizing, the callback runs these checks in order:

1. **Discord identity** — confirmed via OAuth user ID
2. **Guild membership** — confirmed via Discord API. If not in the server, fails immediately.
3. **Account age** — derived from the Discord Snowflake ID (no API call needed). Flagged if below `minAccountAgeDays`.
4. **Server join time** — checked via the guild member endpoint. Flagged if below `minServerDays`.
5. **VPN/proxy check** (optional) — only runs if provider env vars are configured and the toggle is on.
6. **Device consistency check** (optional) — only runs if the toggle is on. Computes an HMAC-SHA256 hash from partial User-Agent + first 2 IP octets, salted with a server-side secret. Only the hash is stored. If the same hash exists for another Discord user in this server, it's flagged as a possible alt.

### Step 4: Result

| Status | Meaning |
|--------|---------|
| `passed` | No risk signals found |
| `flagged` | One or more risk signals found, recorded for review |
| `denied` | Risk signals found and action is set to Deny |

The member sees:
- "Verification passed. You can return to Discord." (passed/flagged)
- "Verification did not meet this server's requirements. Contact server staff if you need help." (denied)
- "Verification could not be completed. The link may have expired..." (error/expired)

### Step 5: Role assignment

If a **Verified role** is configured and the result is `passed` or `flagged`, the bot assigns that role to the member.

### Step 6: Records

The dashboard **Security → Verification** page shows a table of recent verification records:

| Column | Example |
|--------|---------|
| User | Discord user ID |
| Result | `passed` / `flagged` / `denied` |
| Reasons | `new_discord_account, vpn_proxy_detected` |
| Risk score | `70` |
| VPN | `Yes` / `No` / `N/A` |
| Device | `Recorded` / `N/A` |
| Verified | timestamp |
| Expires | timestamp |

Records auto-expire based on the retention setting. No raw technical data is ever shown in the dashboard.

---

## Reason codes

| Code | Risk Score | Trigger |
|------|-----------|---------|
| `new_discord_account` | +30 | Account younger than `minAccountAgeDays` |
| `recent_server_member` | +20 | Joined server less than `minServerDays` ago |
| `vpn_proxy_detected` | +40 | VPN/proxy provider flagged the IP |
| `vpn_check_unavailable` | +30 | VPN check failed and `vpnFailClosed` is on |
| `device_match_other_account` | +50 | Same device hash seen for another user in this guild |

---

## Error scenarios

| What the user sees | Likely cause | Fix |
|--------------------|-------------|-----|
| "Verification link expired" | Link is older than 24 hours | Create a new link in the dashboard |
| "Verification not configured" (503) | `DISCORD_CLIENT_SECRET` not set in `.env` | Add the OAuth client secret |
| "Invalid OAuth2 redirect_uri" | Redirect URL doesn't match Discord Portal | Check `DISCORD_OAUTH_REDIRECT_URI` matches exactly |
| "Could not complete the request" (500) | Server error | Check the dashboard terminal |
| Cloudflare Access login page | Admin applied Access policy to verify hostname | Remove Access from `verify.DOMAIN.com` |
| VPN check blocks everyone | Provider is down and `vpnFailClosed` is on | Turn off fail-closed or configure backup |

---

## Privacy summary

- Raw IP addresses are **never stored**. The VPN check sends the IP to the provider but does not persist it.
- Raw browser/device data is **never stored**. Only an HMAC-SHA256 hash is saved, and it is salted with a server-side secret.
- No hidden tracking. The consent page is shown before any checks run.
- All records expire automatically.
- Secrets (`DISCORD_CLIENT_SECRET`, `VPN_CHECK_API_KEY`, `DASHBOARD_PASSWORD`) are redacted from all server logs.
