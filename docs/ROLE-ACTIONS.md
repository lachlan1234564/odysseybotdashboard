# Role Actions

Grant, remove, or toggle roles on the command user or a configured target user.

## Important: Role hierarchy

The bot's highest role must be **above** any role it manages. In Discord, go to **Server Settings > Roles** and drag the bot role above managed roles.

## Required bot permissions

Manage Roles.

## Common mistakes

- Bot role is below the target role — move it up.
- Trying to manage an admin role — bots cannot manage roles above their own.
- Bot was not given Manage Roles — check the OAuth2 invite scopes.
