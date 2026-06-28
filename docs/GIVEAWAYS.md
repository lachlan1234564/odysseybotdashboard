# Giveaways

Giveaways let staff post a Discord embed with an entry button, store entries in the database, and pick winners even after a bot restart.

## What exists now

- Dashboard giveaway builder with live preview.
- Draft giveaways that can be published later.
- Scheduled giveaways that publish automatically while the bot is running.
- Required role checks.
- Bonus entries for boosters.
- Bonus entries for a selected role.
- Optional host user ID shown in the giveaway embed.
- Optional thumbnail and large image URLs.
- Optional message above the embed.
- Optional winner role.
- Optional winner DM message.
- Global winner DM on/off and fallback message in **Direct Messages**.
- End, cancel, and reroll controls.

## Create a giveaway from the dashboard

1. Open **Giveaways**.
2. Enter the prize.
3. Choose the Discord channel.
4. Add a short description.
5. Choose how many winners there should be.
6. Set **Ends at**.
7. Choose **Draft** if you want to publish manually, or **Scheduled** if you want the bot to publish later.
8. If scheduled, choose **Starts at**.
9. Add presentation details such as button label, host user ID, thumbnail URL, image URL, or message above the embed.
10. Open **Advanced eligibility and winner actions** if you need required roles, bonus entries, a winner role, or a winner DM.
11. Check the live preview.
12. Click **Save giveaway draft**.
13. If it is a draft, click **Publish now** in the library.

## Winner actions

- **Winner role:** CorePanel will try to give the selected role to each winner. The bot role must be above that role.
- **Winner DM message:** CorePanel will DM winners if winner DMs are enabled in **Direct Messages** and the user allows DMs from server members. Closed DMs are logged safely and do not break the giveaway.
- **Default winner DM:** If a giveaway does not have its own winner DM message, CorePanel uses the default message from **Direct Messages**.

Supported winner DM placeholders:

```text
{user}
{user_id}
{server}
{serverName}
{prize}
{giveaway_id}
```

## Manage a giveaway

- **Publish now:** posts a draft or scheduled giveaway immediately.
- **End:** picks winners immediately.
- **Reroll:** picks new winners from stored entries.
- **Cancel:** disables the giveaway without choosing winners.

Members can enter once. Bonus entries are calculated when they click the entry button.

## Discord commands

```text
/giveaway start
/giveaway list
/giveaway end
/giveaway reroll
/giveaway cancel
```

Slash command giveaways publish immediately. Use the dashboard when you need scheduling, images, winner roles, winner DMs, or custom button text.

## Required permissions

CorePanel needs these permissions in the giveaway channel:

- View Channel
- Send Messages
- Embed Links

For winner roles, CorePanel also needs:

- Manage Roles
- A bot role higher than the winner role

## Troubleshooting

- If a scheduled giveaway does not publish, make sure the bot process is running.
- If the embed does not post, check View Channel, Send Messages, and Embed Links in the selected channel.
- If winner roles are not assigned, move the bot role above the winner role and confirm Manage Roles is enabled.
- If winner DMs do not send, the user may have DMs closed. The giveaway still ends normally.
