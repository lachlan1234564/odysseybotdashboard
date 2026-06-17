# Role Panels

## In one sentence

A role panel is a Discord message with buttons or a dropdown menu that lets members add or remove approved roles from themselves.

## Before you start

- Give the bot **Manage Roles**.
- Move the bot's role above every role used in the panel.
- Do not include administrator or staff roles in a public self-service panel.

## Create a panel

1. Open **Automation > Role Panels**.
2. Enter an internal panel name.
3. Choose the Discord channel where it should be posted.
4. Enter the title and description members will see.
5. Choose a color.
6. Choose **Buttons** or **Dropdown menu**.
7. Select up to 25 safe self-service roles.
8. Customize each role option with an optional label, category, emoji, description, or required role.
9. Optionally set **Max per category** or **Replace within category** so members can only keep one role from a group.
10. Click **Save role panel**.
11. Find the saved panel in the library and click **Post**.

You can also post a saved panel from Discord:

```text
/reaction-roles panel:Your Panel
```

Add the optional `channel` choice to override the panel's saved channel. This command is restricted to configured bot administrators or members with **Manage Server**.

## What members see

Each selected role becomes a button or dropdown option. Choosing it:

- Adds the role if the member does not have it.
- Removes the role if the member already has it.
- Removes older roles in the same category when replacement is enabled.
- Sends a private success or error message.
- Writes to the mod log when one is configured.

## Test safely

Create a harmless role named `Test Role`, place it below the bot, and use only that role in your first panel.

If Discord says the bot cannot manage the role, fix the server role order before trying again.

This feature uses Discord **buttons** and **select menus**, not legacy emoji reactions. The command name says reaction roles because that is the familiar feature name, while buttons and menus provide clearer private errors and avoid reaction-cache problems.
