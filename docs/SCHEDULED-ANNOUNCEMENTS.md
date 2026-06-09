# Scheduled Announcements

## In one sentence

Schedules send an existing announcement template at a chosen time.

## Create a schedule

1. Create the message first on the **Announcements** page.
2. Open **Automation > Scheduled**.
3. Enter a schedule name.
4. Choose the saved announcement template.
5. Choose the target channel.
6. Choose **No ping**, `@here`, or `@everyone`.
7. Choose **Send once** or **Repeat**.
8. Set the first send time.
9. For a repeating schedule, enter the interval in minutes.
10. Click **Save schedule**.

Useful repeat intervals:

```text
60 = hourly
1440 = daily
10080 = weekly
```

The bot checks due schedules about every 30 seconds, so a message may send shortly after the exact selected time.

## Test without pinging everyone

Click **Test** beside a saved schedule. Tests always disable mentions, even when the saved schedule uses `@here` or `@everyone`.

## Required permissions

The bot needs **Send Messages** and **Embed Links** in the target channel. A real scheduled `@here` or `@everyone` also needs **Mention Everyone**.

## Railway note

Schedules require the bot to stay running. Railway is suitable because it hosts the bot as a long-running process. Vercel serverless functions are not suitable for the scheduler.
