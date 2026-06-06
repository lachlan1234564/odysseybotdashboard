# Command Builder

The Command Studio lets you build custom actions that run through `/custom name`. You do not need to redeploy Discord commands every time you add a new one.

## Builder sections

### Command identity
Name, description, and enabled status. The name must be lowercase letters, numbers, hyphens, and underscores only.

### Action
Choose what the command does. See Action Templates for all options.

### Access and delivery
Control who can use it, which channels it works in, cooldowns, and reply visibility.

## Important
Custom commands run through `/custom name`. They do not become new top-level slash commands automatically. To add a top-level command, edit `src/bot/commands.ts` and run `pnpm deploy:commands`.
