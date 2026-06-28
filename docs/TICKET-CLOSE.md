# Ticket Close Requests

## The simple version

Close requests work in **two directions**:

| Who starts it? | How? | Who must answer? |
|---|---|---|
| Ticket opener or community member | Click **Request Staff Close** | Ticket staff |
| Ticket staff | Run `/close-request` | Ticket opener or allowed community member |

The person who starts a request cannot accept or deny their own request.

## Turn on the user button

1. Open **Tickets** in the dashboard.
2. Open **Ticket Types**.
3. Edit the ticket type.
4. Turn on **Close request button**.
5. Click **Save ticket type**.

New ticket messages for that type will include **Request Staff Close**.

## User or community flow

1. The ticket opener clicks **Request Staff Close**.
2. They may enter a reason.
3. The bot posts a visible close-request card in the ticket.
4. Staff click **Accept Close** or **Deny Close**.

Only the ticket opener or a member with an **Allowed / community role** can start this flow.

## Staff flow

Inside the ticket, a staff member runs:

```text
/close-request reason:The question has been answered.
```

The bot posts a close-request card for the ticket opener or an allowed community member. They choose **Accept Close** or **Deny Close**.

`/close-request` is staff-only. Staff means either:

- A member with **Manage Channels**.
- A member with a server staff role from **Server Settings**.
- A member with a staff role saved on that ticket type.

## What “community” means

The ticket opener always qualifies.

The ticket type's **Allowed / community roles** also qualify. Those roles normally control who can open that ticket type. They can answer a staff request only when the member can see the ticket message.

## After acceptance

1. The request card changes to **Close Request Accepted**.
2. The bot saves a dashboard transcript and fetches up to the newest 1,000 messages.
3. A final **Ticket Transcript Saved** card shows the transcript status when a transcript/log channel is configured.
4. The ticket channel is removed after the configured delay, with a minimum visible delay of 5 seconds.

If the request is denied, the card changes to **Close Request Denied** and the ticket stays open.

## Dashboard history

Open **Tickets → Close Requests**. The **Source** column explains the direction:

- **Staff → Community**
- **Community → Staff**

You can also see the requester, reason, status, resolver, and creation time.

## Friendly permission errors

The bot explains what went wrong when:

- A non-staff member tries `/close-request`.
- Staff try to use the community-only ticket button.
- The wrong side tries to accept or deny.
- The requester tries to review their own request.
- Another request is already pending.

## Transcript setup

Set **Default ticket log channel** under **Server Settings**, or choose a transcript-channel override on the ticket type.

The bot needs **Read Message History** in the ticket and **Send Messages**, **Embed Links**, and **Attach Files** in the transcript channel.
