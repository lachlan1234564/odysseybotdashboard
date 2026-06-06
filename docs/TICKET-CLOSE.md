# Ticket Close Requests

Instead of letting anyone close a ticket immediately, you can require a staff review.

## How it works

1. In the ticket type, enable **Close requests**.
2. When a user clicks the close button, they enter a reason in a modal.
3. A close request is posted in the ticket channel with **Approve** and **Deny** buttons.
4. Staff click to approve or deny. Approved requests close the ticket and schedule deletion.

## Optional delay

Set a **Close request delay** (in seconds) to wait before deleting the channel after approval. 0 deletes immediately.

## Permissions

Only staff (Manage Channels permission or configured staff roles) can approve or deny. The ticket creator can submit the request.

## Transcripts

The bot does not currently generate full text transcripts. Ticket open/close events are logged to the configured transcript channel with basic metadata. If you need full transcripts, export the channel with a third-party tool or request it as a future feature.
