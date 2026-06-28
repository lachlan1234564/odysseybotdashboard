# Verification and Privacy

## Discord fingerprint or alt detection

Bot Dashboard does **not** fingerprint browsers or claim to detect alternate accounts.

A website cannot reliably prove that two Discord accounts belong to the same person. Browser fingerprints, IP addresses, VPN checks, and similar signals are invasive, can be inaccurate, and can punish people who share devices or networks.

## Current privacy-respecting verification

Bot Dashboard includes an optional Discord OAuth2 verification page. It collects only:

- The Discord user ID from the `identify` scope.
- Basic account creation age calculated from the Discord ID.
- Optional membership in the selected server, checked by the bot.
- Verification time and status.
- A short pass/flag/fail reason, optional risk score, and an expiry time.

It does not create browser fingerprints, derive device hashes, or store device identifiers, advertising IDs, or raw IP addresses. Verification records expire after the configured retention period.

## Configure Discord OAuth

1. Open Discord Developer Portal and select the Bot Dashboard application.
2. Add this redirect URL under OAuth2:

   `https://verify.YOUR_DOMAIN.com/api/verify/callback`

3. Set `DISCORD_CLIENT_SECRET` to the application's OAuth client secret.
4. Set `DISCORD_OAUTH_REDIRECT_URI` to the exact redirect URL from step 2.
5. Set `VERIFY_PUBLIC_BASE_URL` to `https://verify.YOUR_DOMAIN.com` (or `PUBLIC_BASE_URL` if using a single hostname).
6. If behind Cloudflare Tunnel or a reverse proxy, set `TRUST_PROXY=true`.
7. Restart the dashboard.
8. Open **Security > Verification**, enable the checks you need, and save.
9. Click **Create link**, then share only that verification link.

The OAuth request uses the `identify` and `guilds.members.read` scopes. Server membership is checked through the bot, so the user is not asked to grant broad account access.

## Optional VPN/proxy provider

VPN/proxy checks are off unless both `VPN_CHECK_URL_TEMPLATE` and `VPN_CHECK_API_KEY` are configured and the dashboard toggle is enabled.

- The provider receives the current request IP because that is required to perform the check.
- Bot Dashboard does not store the raw IP.
- Leave **Fail if provider is unavailable** disabled unless your community explicitly needs strict enforcement.
- Provider results can be wrong for shared networks, mobile carriers, privacy relays, and corporate connections.

VPN checks are a risk signal, not proof of an alternate account.
