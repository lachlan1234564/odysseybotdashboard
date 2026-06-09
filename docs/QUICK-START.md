# Quick Start

Use this checklist when the project and `.env` file already exist.

## 1. Open the project

```bash
cd ~/Desktop/rapid-discord-bot
```

## 2. Install and prepare

```bash
pnpm install
pnpm db:setup
pnpm deploy:commands
```

`db:setup` applies pending SQLite or PostgreSQL migrations. `deploy:commands` registers the static Discord commands, including `/ping`, `/help`, `/custom`, `/ticket-panel`, `/reaction-roles`, `/announce`, moderation commands, and `/close-request`.

## 3. Start development

Run the bot and dashboard together:

```bash
pnpm dev
```

Or run them in separate terminals:

```bash
pnpm bot
pnpm dashboard
```

The local dashboard opens at `http://127.0.0.1:3210`. Sign in with `DASHBOARD_PASSWORD`.

## 4. Configure the first workflow

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

Every successful dashboard save, test, post, or delete appears in **Overview > Recent dashboard activity**.

## Important limits

- Dashboard-created commands run through `/custom`; they do not become new top-level slash commands automatically.
- Uploaded images are stored in `UPLOADS_DIR`. Use a persistent Railway volume in production.
- Dashboard authentication is one shared password in this MVP. Discord OAuth and per-user dashboard auditing are future upgrades.
