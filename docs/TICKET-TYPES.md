# Ticket Types

Ticket types define what happens after a member chooses an option on a ticket panel.

## Create a type

1. Open **Tickets > Ticket Types** in the sidebar.
2. Enter a name and short description.
3. Open the emoji selector and choose a standard emoji or an emoji from the selected Discord server.
4. Choose the Discord category where new channels should be created.
5. Select staff roles that can view, write, claim, and close these tickets.
6. Design the welcome embed and save the type.

The common settings stay visible. Less frequently used permissions, transcript overrides, limits, pings, and automatic closing are under **Advanced**.

## Access rules

- **Allowed / community roles** is an allowlist. Leave it empty to allow everyone except blocked roles. These roles can also answer a staff-created close request when they can see the ticket.
- **Blocked roles** always deny opening the type.
- The ticket creator receives view, send, history, and attachment permissions.
- Staff roles receive view, send, and history permissions.

## Lifecycle controls

Open **Advanced** to configure these options:

- **Max open per user** limits duplicate active tickets of this type.
- **Channel naming format** supports `{username}`, `{type}`, and `{userId}`.
- **Claim button** lets staff claim the ticket.
- **Close button** lets the creator or staff close it.
- **Require close reason** opens a reason modal before direct closure.
- **Close request button** lets the opener/community ask staff to close. Staff use `/close-request` for the reverse flow, where the opener/community must answer.
- **Auto-close after inactivity** closes stale tickets. Set it to `0` to disable.

## Logging

Choose a transcript/log channel override on the type, or use the default ticket log channel from **Server Settings**. When the ticket closes, the bot saves a dashboard transcript and can post a downloadable text file to that channel.
