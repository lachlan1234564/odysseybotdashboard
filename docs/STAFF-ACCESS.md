# Staff Dashboard Access

This guide explains how staff can access the dashboard, what they should receive, and what must stay private.

---

## Table of Contents

1. [Local Dashboard Limits](#local-dashboard-limits)
2. [Recommended Staff Setup](#recommended-staff-setup)
3. [What to Share With Staff](#what-to-share-with-staff)
4. [What Staff Must Never Receive](#what-staff-must-never-receive)
5. [Current Authentication Limits](#current-authentication-limits)
6. [Local Network Option (Temporary Only)](#local-network-option-temporary-only)
7. [Railway Staff Access](#railway-staff-access)
8. [Railway Roles vs. Dashboard Access](#railway-roles-vs-dashboard-access)

---

## Local Dashboard Limits

By default, the dashboard binds to:

```
127.0.0.1
```

This address is reachable **only from the computer running the dashboard**. Other staff members normally cannot open it from their own computers, even if they know the password.

This is **intentional** for local development.

---

## Recommended Staff Setup

For staff to access the dashboard, host the application on Railway:

1. Railway runs the Discord bot and dashboard as one long-running Node service.
2. Railway PostgreSQL stores shared settings and records.
3. Railway provides an HTTPS dashboard domain.
4. Staff open that URL in their normal browser.
5. Staff log in with the dashboard password.

The bot stays online even when your personal computer is turned off.

See [SETUP.md](SETUP.md#deploy-to-railway) for the full deployment walkthrough.

---

## What to Share With Staff

Give trusted staff **only** these three things:

1. The hosted dashboard HTTPS URL (e.g., `https://your-project.railway.app`)
2. The dashboard password
3. Instructions for which settings they are allowed to change

---

## What Staff Must Never Receive

**Never** give staff any of the following:

- `DISCORD_TOKEN`
- Your `.env` file
- Railway PostgreSQL credentials
- Railway project owner access (unless they actually administer hosting)
- Your Discord Developer Portal account

Staff need dashboard access, not direct bot credentials. The bot token is equivalent to full control of the bot. If it leaks, someone can modify your server without your knowledge.

---

## Current Authentication Limits

The current MVP uses **one shared password**:

- It does **not** identify individual staff members.
- Saved dashboard changes use `local-dashboard` as the audit actor.
- Dashboard sessions are stored in memory and reset on deployment.
- Changing `DASHBOARD_PASSWORD` invalidates the derived session secret after a restart.
- There is **no** password reset email, multi-factor authentication, or OAuth.

**Best practice:** Use a long unique password and share it only with trusted staff. Rotate it when a staff member should lose access.

### Recommended Next Upgrade

The recommended authentication upgrade is **Discord OAuth2** with:

- Discord identity per staff member
- Guild membership checks
- Required staff/admin role checks
- Per-user audit logs
- CSRF protection
- A persistent session store

---

## Local Network Option (Temporary Only)

The app supports a local-network bind for temporary trusted-network use.

In `.env`, change:

```dotenv
DASHBOARD_HOST=0.0.0.0
```

Then run:

```bash
pnpm dashboard:no-open
```

Find the computer's local IP address and give staff a URL such as:

```
http://192.168.1.50:3210
```

This works only when:

- Staff are on the same local network or VPN
- Your firewall permits the port
- The router/network does not isolate devices
- The dashboard process remains running

### ⚠️ Local Network Security Warnings

- This local URL uses **HTTP, not HTTPS**.
- Anyone on the reachable network can attempt the login page.
- The current shared-password auth is **not designed for broad exposure**.
- **Do not** port-forward `3210` from your router to the public internet.
- **Do not** use a public tunnel as a permanent production deployment.
- Return `DASHBOARD_HOST` to `127.0.0.1` after temporary testing.

**Railway with HTTPS is the safer and more convenient staff-access path.**

---

## Railway Staff Access

After deployment:

1. Generate a public domain in the Railway application service.
2. Open the `https://...railway.app` URL.
3. Confirm the login page appears.
4. Give the URL and dashboard password to trusted staff.
5. Keep the bot token only in Railway Variables and your private local `.env`.

Use **one Railway application replica** for this MVP. Multiple replicas would create duplicate Discord bot processes and would not share in-memory sessions or cooldowns.

If uploads are used, attach a volume at `/app/uploads`; otherwise uploaded branding can disappear after a deployment.

---

## Railway Roles vs. Dashboard Access

Railway project membership and dashboard login are **separate**:

- A dashboard staff member does **not** need Railway access.
- A Railway collaborator can potentially change service variables and should be treated as **infrastructure administration**.
- Discord **Staff roles** and **Bot admin roles** control bot commands, not the dashboard password.

**Keep infrastructure access narrower than normal bot-management access.**

---

## Vercel Note

Vercel can host a frontend-only dashboard later if the API and bot are split into separate services. It is **not recommended** for the main Discord bot process, which requires a long-running connection to Discord.

Useful Railway references:

- [Public networking](https://docs.railway.com/reference/public-networking)
- [PostgreSQL](https://docs.railway.com/databases/postgresql/)
- [Volumes](https://docs.railway.com/volumes)
