# Giveaways

## In one sentence

Giveaways let staff post a Discord embed with an **Enter Giveaway** button, store entries in the database, and pick winners even after a bot restart.

## Create a giveaway from the dashboard

1. Open **Giveaways**.
2. Enter the prize.
3. Choose the Discord channel.
4. Add an optional description.
5. Set winner count and end date.
6. Optionally choose a required role.
7. Optionally add booster or role bonus entries.
8. Click **Save giveaway draft**.
9. In the library, click **Start**.

## Manage a giveaway

- **End** picks winners immediately.
- **Reroll** picks new winners from the stored entries.
- **Cancel** disables the giveaway without choosing winners.

## Discord commands

```text
/giveaway start
/giveaway end
/giveaway reroll
/giveaway cancel
```

These commands require dashboard bot-admin access and **Manage Server**.

## Notes

- Entries are stored in the database.
- Required roles are checked when a member enters.
- Bonus entries are calculated when the member clicks the entry button.
- The bot needs **Send Messages** and **Embed Links** in the giveaway channel.
