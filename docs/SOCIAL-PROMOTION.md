# Social Promotion

## What it does

Social Promotion creates one saved message per Discord server for official links and optional member or creator links.

## Create the message

1. Open **Social Promotion** in the dashboard.
2. Choose the target text channel.
3. Choose **Embed** or **Plain text / no embed**.
4. Add a title and description.
5. For embed mode, choose a color and optionally add a thumbnail or banner.
6. Under **Official social links**, add a label and HTTPS URL for each link.
7. Add optional member links such as `Alex - TikTok`.
8. Review the live preview.
9. Click **Save Socials**.
10. Click **Send socials embed** to publish the saved version.

The send button deliberately publishes the last saved settings. Save again before sending after any edit.

## Images

Use an HTTPS image URL, or click **Upload**. Uploaded images are stored in the configured uploads directory and served from `/uploads`.

## Link safety

Social links must use HTTPS. Localhost, private-network addresses, and malformed URLs are rejected. Odyssey Bot disables automatic mentions in Social Promotion messages.

## Discord permissions

The bot needs:

- View Channel
- Send Messages
- Embed Links for embed mode
- Attach Files when an uploaded image needs to be attached

Settings and channel choices are scoped to the server selected at the top of the dashboard.
