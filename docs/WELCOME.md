# Welcome and Goodbye Messages

This page controls the messages sent when members join or leave your server.

## Setup

1. Go to **Welcome Messages** in the dashboard.
2. Enable welcome messages.
3. Choose a welcome channel.
4. Write a message and/or design an embed.
5. Optionally enable DM welcome and auto-roles.
6. Optionally enable the goodbye message, choose its channel, and write the leave text.
7. Choose whether the goodbye message should reuse the welcome embed design.
8. Save and test both previews with their **Send test** buttons.

## Variables

- `{user}`
- `{username}`
- `{server}`
- `{memberCount}`
- `{createdAt}`
- `{user_name}`
- `{user_id}`
- `{server_name}`
- `{server_member_count}`
- `{user_avatar}`

## Auto-roles

Select roles to automatically assign on join. The bot must have **Manage Roles** and its role must be above the auto-roles. Be careful with permissions — do not auto-assign moderation roles.

## Required bot permissions

Send Messages, Embed Links, Manage Roles (for auto-roles).

Goodbye messages are sent for normal member departures and kicks. They are stored per server and do not DM the member who left.
