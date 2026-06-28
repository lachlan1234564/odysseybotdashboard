# Ticket Transcripts

## In one sentence

When a ticket closes, the bot saves a transcript record for the dashboard and can also post a downloadable text file with a clear archive card.

## Turn transcript channel files on

1. Open **Server Settings**.
2. Set **Default ticket log channel**.
3. Click **Save server settings**.

To use a different channel for one ticket type:

1. Open **Tickets > Ticket Types**.
2. Edit the ticket type.
3. Choose its transcript/log channel override.
4. Save the ticket type.

## What the file contains

- Ticket channel name and ID.
- Who closed the ticket.
- Close reason.
- Message time, author, author ID, text, and attachment links.
- Basic embed summaries when the message contains embeds.
- Ticket category, priority, assigned staff, opened time, and closed time.
- Up to the newest 1,000 fetched messages.

The database transcript is created before the ticket channel is deleted, even if no transcript channel is configured.

## What the archive card shows

- A clear **Ticket Transcript Saved** title.
- Saved status.
- Ticket name, channel ID, and CorePanel ticket number.
- Ticket requester and the person who closed it.
- Ticket category, open time, close time, and close reason.
- Number of exported messages.
- A **Download Transcript** button when Discord returns an attachment URL.

## Dashboard transcript archive

Open **Tickets > History** and review **Ticket transcripts**. Each saved transcript includes:

- Ticket ID and ticket channel name.
- Opener and closer IDs.
- Close reason.
- Category, priority, opened/closed time, and assigned staff when available.
- Message count.
- View and download actions for a readable dashboard copy and a plain-text copy.

The dashboard copy is useful when Discord attachment upload fails or no transcript channel is configured.

## Required permissions

The bot needs **Read Message History** in the ticket and **Send Messages**, **Embed Links**, plus **Attach Files** in the transcript channel.

## Common problem

If the close log appears without a text file, check **Read Message History** and **Attach Files**, then confirm the selected transcript channel still exists.
