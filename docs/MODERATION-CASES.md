# Moderation Cases

## In one sentence

Moderation cases are structured records for staff actions such as warnings, timeouts, kicks, bans, and manual notes.

## Automatic cases

Odyssey Bot creates cases for:

- `/warn`
- `/timeout`
- `/kick`
- `/ban`

The older moderation action history still exists as a raw audit trail. Cases are the cleaner staff-facing record.

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
```

These commands require **Moderate Members**.

## Case statuses

- **active** means the case still matters.
- **expired** means the punishment or relevance has ended.
- **reversed** means staff undid the action.
- **deleted** means staff intentionally removed it from active use.
- **resolved** means the case is finished.
