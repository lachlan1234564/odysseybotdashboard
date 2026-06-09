# Sticky Messages

## In one sentence

A sticky message is automatically reposted after channel activity so an important notice stays near the bottom.

## Create one

1. Open **Automation > Sticky Messages**.
2. Choose a channel.
3. Enter the notice.
4. Set the minimum repost delay. Start with 30 to 60 seconds.
5. Leave **Enabled** on.
6. Click **Save sticky message**.
7. Click **Test** in the saved list.

The test sends one message beginning with `[Sticky preview]`. It does not start a second sticky rule.

## How normal reposting works

When a member talks in the configured channel, the bot waits for the minimum delay. It removes its previous sticky message and posts a new copy.

Only one sticky message can be configured per channel.

## Avoid spam

- Use a longer delay in busy channels.
- Keep the message short.
- Disable the sticky rule before doing large message imports or tests.

## Required permissions

The bot needs **View Channel**, **Send Messages**, **Read Message History**, and **Manage Messages** in the sticky channel.
