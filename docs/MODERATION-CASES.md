# Moderation Cases

## In one sentence

Moderation cases are structured records for staff actions such as warnings, timeouts, kicks, bans, and manual notes.

## Automatic cases

Bot Dashboard creates cases for:

- `/warn`
- `/timeout`
- `/untimeout`
- `/kick`
- `/ban`
- `/unban`
- Manual `/case create`

The older moderation action history still exists as a raw audit trail. Cases are the cleaner staff-facing record.

## Optional moderation DMs

Open **Direct Messages** in the dashboard to enable moderation DMs. When enabled, Bot Dashboard can notify affected users for warnings, timeouts, timeout removals, kicks, bans, unbans, and manual cases.

For kicks and bans, Bot Dashboard attempts the DM before removing the user when possible. If the user has DMs closed, the action still continues and the failure is logged safely.

## Dashboard view

Open **Moderation** and review **Moderation cases**. Each case shows:

- Case number
- Action type
- Target user ID
- Moderator ID
- Status
- Reason
- Last updated time

## Discord commands

```text
/case view
/case search
/case create
/case edit
/case note
/case resolve
```

These commands require **Moderate Members**.

## Case statuses

- **active** means the case still matters.
- **expired** means the punishment or relevance has ended.
- **reversed** means staff undid the action.
- **deleted** means staff intentionally removed it from active use.
- **resolved** means the case is finished.
