# Quick Start

Use this checklist to download CorePanel from GitHub and run it locally for the first time.

## 1. Download the project

Replace the placeholder URL and folder name with the values from your GitHub repository:

```bash
git clone <YOUR_GITHUB_REPO_URL>
cd <REPO_FOLDER>
```

If the project is already on your computer:

```bash
cd ~/Desktop/rapid-discord-bot
```

## 2. Start with dashboard setup

CorePanel no longer needs a local `.env` file for normal first-run setup. The dashboard can start without a bot token, then guide you through setup at `/setup`.

Only create `.env` if you want to override infrastructure values locally:

```bash
cp .env.example .env
```

Never commit or share `.env`.

## 3. Install and prepare

```bash
pnpm install
pnpm db:setup
```

`db:setup` applies pending SQLite or PostgreSQL migrations.

## 4. Start development

Run the bot and dashboard together:

```bash
pnpm dev
```

Or run them in separate terminals:

```bash
pnpm bot
pnpm dashboard
```

Open `http://127.0.0.1:3210/setup`, paste your Discord bot token and application ID, then create the dashboard password.

After setup is saved, stop and restart `pnpm dev` so the bot process logs in with the stored token. Then register slash commands:

```bash
pnpm deploy:commands
```

`deploy:commands` registers the static Discord slash commands, including `/ping`, `/help`, `/server info`, `/user-info`, `/automod-status`, `/socials-post`, `/bot-status`, `/custom`, `/ticket-panel`, `/announce`, `/reaction-roles`, `/dm`, `/close-request`, `/lockdown`, `/unlockdown`, and the moderation commands.

## 5. Configure the first workflow

1. Open **Server Settings** and select staff roles, admin roles, ticket routing, and log channels.
2. Open **Tickets > Ticket Types** and create at least one type.
3. Open **Tickets > Panels**, create a panel, save it, then use **Send saved panel** or `/ticket-panel`.
4. Open **Command Studio** to create a database-backed command.
5. Test it in Discord with `/custom name:your-command`.

## Optional features

Open these pages only after the basic bot works:

- **Security > Role Protection:** start with **Log only**.
- **Automation > Auto Mod:** enable **Message Content Intent** first.
- **Automation > Role Panels:** use harmless member roles below the bot.
- **Automation > Sticky Messages:** start with a 30-second delay.
- **Automation > Scheduled:** create an announcement template before creating a schedule.
- **Direct Messages:** configure `/dm`, moderation DMs, and giveaway winner DMs after staff roles and log channels are set.

Every successful dashboard save, test, post, or delete appears in **Overview > Recent dashboard activity**.

## Production commands

Build TypeScript, apply migrations, and start the combined long-running bot/dashboard process:

```bash
pnpm build
pnpm start
```

`pnpm start` is the production command used by Railway. Use Railway PostgreSQL and a persistent volume for uploaded images.

## Important limits

- Dashboard-created commands run through `/custom`; they do not become new top-level slash commands automatically.
- Uploaded images are stored in `UPLOADS_DIR`. Use a persistent Railway volume in production.
- Dashboard authentication is one shared password in this MVP. Discord OAuth and per-user dashboard auditing are future upgrades.
