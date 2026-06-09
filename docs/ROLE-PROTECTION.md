# Role Protection

## In one sentence

Role Protection watches sensitive Discord roles and records who changed them.

Start with **Log only**. This lets you confirm the correct events are detected before the bot takes action.

## Before you start

The bot needs:

- **View Audit Log** to identify who made a role change.
- **Manage Roles** to remove permissions or assigned roles.
- **Moderate Members**, **Kick Members**, or **Ban Members** only if you select those actions.
- A bot role placed above every role and member it may manage.

The bot never punishes the server owner or itself.

## Set it up

1. Open **Security > Role Protection**.
2. Choose the roles that should be protected.
3. Add any trusted roles, such as an owner or senior administrator role.
4. Add trusted user IDs only when a specific account must bypass protection.
5. Leave **Action** set to **Log only (recommended)**.
6. Choose a log channel. If you leave it empty, the global mod log is used.
7. Keep the default mass-change threshold for your first test.
8. Turn on **Enabled**.
9. Click **Save Role Protection**.

## What is detected

- Creating a role with dangerous permissions.
- Deleting or renaming roles.
- Changing role permissions.
- Assigning a protected role to a member.
- Many role changes by the same person in a short time.

Dangerous permissions include Administrator, Manage Server, Manage Roles, Manage Channels, Ban Members, Kick Members, Manage Webhooks, and Mention Everyone.

## Test safely

Use a private test server and a disposable role.

1. Keep the action on **Log only**.
2. Add the disposable role to **Protected roles**.
3. Rename the role.
4. Assign it to a test member.
5. Check the Role Protection log.

The log should show the executor, role, affected member when relevant, reason, configured action, result, and timestamp.

Only test destructive actions after log-only tests are correct. Never test kick or ban with the server owner account.

## Common problem

**The event is logged, but the action failed.**

Move the bot role above the executor and protected role. Then confirm the bot has the permission needed for the selected action.
