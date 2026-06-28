# Verification gate

CorePanel can place a Discord server behind a privacy-respecting verification gate. New members see the verification channel and any public areas selected by an administrator. After a successful Discord OAuth check, the bot assigns the configured verified/community role, which unlocks the normal server.

The system confirms Discord identity, server membership, and optional account-age or VPN/proxy signals. It does not fingerprint browsers or claim to identify alternate accounts.

## Before enabling it

1. Create a normal Discord role such as `Community` or `Verified`.
2. Move the **CorePanel** role above that role.
3. Give CorePanel:
   - View Channels
   - Send Messages
   - Embed Links
   - Read Message History
   - Manage Channels
   - Manage Roles
4. In the Discord Developer Portal, register:

```text
https://verify.YOUR_DOMAIN.com/api/verify/callback
```

5. Configure these startup variables:

```dotenv
DISCORD_CLIENT_SECRET=your_oauth_client_secret
DISCORD_OAUTH_REDIRECT_URI=https://verify.YOUR_DOMAIN.com/api/verify/callback
VERIFY_PUBLIC_BASE_URL=https://verify.YOUR_DOMAIN.com
TRUST_PROXY=true
```

`VERIFY_PUBLIC_BASE_URL` must be the public verification hostname, not the protected admin hostname. Do not apply Cloudflare Access to the verification hostname.

## Dashboard setup

Open **Security → Verification**.

### Gate identity

- **Enabled:** turns verification on for the selected Discord server.
- **Verified/community role:** assigned only after verification passes.
- **Existing verification channel:** reuse a text channel.
- **New channel name:** used when automatic creation is enabled.
- **Verification log channel:** receives setup, pass, fail, and role-assignment events.

### Verification message

Customize the embed title, description, colour, link-button label, success message, and failed message. The live preview shows the Discord message before anything is posted.

The Discord button uses a stable server URL:

```text
https://verify.YOUR_DOMAIN.com/verify/server/GUILD_ID
```

The dashboard can still create temporary 24-hour links for one-off sharing.

### Unverified visibility

- **Lock the server by default:** hides every normal area from `@everyone`.
- **Public categories:** visible to unverified users, including permission-synced child channels.
- **Public channels:** individual visible exceptions.
- **Always hidden categories/channels:** hidden selections override public selections.
- **Read-only verification channel:** members can read and click the button but cannot chat.

CorePanel changes only the `@everyone`, verified role, configured admin/staff role, and bot-member overwrites required by the gate. It preserves unrelated role and user overwrites.

Before each first change, the original overwrite is saved in the database. Re-running setup derives changes from that saved original instead of repeatedly stacking permissions.

### Risk checks

- **Allow and record:** records risk signals and allows verification.
- **Hold for staff review:** flagged members do not receive the verified role.
- **Deny:** any configured signal prevents verification.
- **Assign role and record:** records signals but allows verified members through.

Optional VPN/proxy checks require both provider variables. Raw IP addresses are never stored.

## Safe setup workflow

1. Fill out the verification form.
2. Save it with **Apply when settings are saved** turned off.
3. Click **Dry run / preview changes**.
4. Review the number of public, hidden, inherited, and planned permission changes.
5. Click **Apply verification setup**, or run:

```text
/verification setup
```

The setup command requires Administrator or Manage Server. It creates or reuses the channel, posts or updates the embed, applies permissions, and returns a summary.

Use this command to inspect saved status:

```text
/verification status
```

## Member flow

1. The member opens the verification link.
2. The public page explains what is and is not collected.
3. The member continues to Discord OAuth using `identify guilds.members.read`.
4. CorePanel verifies that the OAuth user is still a member of the selected server.
5. Configured account-age, server-time, and optional VPN/proxy checks run.
6. Passed members receive the verified/community role.
7. The role unlocks normal channels through the gate overwrites.

If the member is not in the server, verification fails safely. If role assignment fails, the page asks the member to contact staff and the configured verification log receives the failure.

## New member behaviour

When verification is enabled, CorePanel never assigns the verified/community role through Welcome auto-roles. Other configured auto-roles still work. The verification log records that the new member is pending verification.

## Reposting and repair

Use **Repost / update embed** if the message was deleted or the text changed. If the saved message is gone, CorePanel posts a replacement and stores its new message ID.

Re-run setup after changing public areas, role hierarchy, or channel structure.

## Disabling safely

Click **Disable and restore permissions** to:

- turn verification off;
- restore saved permission overwrites;
- keep the verification channel;
- keep roles already assigned to verified members.

The action does not delete channels and does not remove verified roles from members. If a channel was deleted, restoration skips it safely.

## Stored data

Per-guild settings include the verified role, channel/message IDs, embed content, public and hidden areas, gate options, last setup time, and updater ID.

Verification records include:

- Discord user ID;
- pass, flagged, or denied status;
- reason codes and risk score;
- Discord account creation time;
- server join time when available;
- optional VPN/proxy result;
- verification and expiry timestamps.

Raw IP addresses, browser fingerprints, device identifiers, and OAuth access tokens are not stored.

## Common problems

| Problem | Fix |
|---|---|
| Verification cannot be enabled | Configure `DISCORD_CLIENT_SECRET` and `VERIFY_PUBLIC_BASE_URL`. |
| OAuth says redirect URI is invalid | Make `DISCORD_OAUTH_REDIRECT_URI` exactly match the Developer Portal entry. |
| Members see Cloudflare Access | Remove Access protection from `verify.YOUR_DOMAIN.com`. |
| Bot cannot create or lock channels | Grant Manage Channels and move the bot role appropriately. |
| Role is not assigned | Grant Manage Roles and move CorePanel above the verified role. |
| Verification message disappeared | Use **Repost / update embed**. |
| Some permission changes failed | Open the dry-run/setup result, fix channel access, and run setup again. |
| Flagged members do not unlock the server | This is expected in **Hold for staff review** mode. |
