# Ticket Transcripts

## In one sentence

When a ticket closes, the bot can export the newest 100 messages as a text file and post a clear archive card.

## Turn transcripts on

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
- Up to the newest 100 messages.

The transcript is created before the ticket channel is deleted.

## What the archive card shows

- A clear **Ticket Transcript Saved** title.
- Saved status.
- Ticket name, channel ID, and Odyssey Bot ticket number.
- Ticket requester and the person who closed it.
- Ticket category, open time, close time, and close reason.
- Number of exported messages.
- A **Download Transcript** button when Discord returns an attachment URL.

## Required permissions

The bot needs **Read Message History** in the ticket and **Send Messages**, **Embed Links**, plus **Attach Files** in the transcript channel.

## Common problem

If the close log appears without a text file, check **Read Message History** and **Attach Files**, then confirm the selected transcript channel still exists.
