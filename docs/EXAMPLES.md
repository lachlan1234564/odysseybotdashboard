# Examples & Recipes

## Rules command

Action: **Reply with a plain message**. Content: your rules. Access: Everyone.

## Self-role command

Action: **Toggle a role**. Access: Everyone. The user runs `/custom gamer` to add/remove the Gamer role.

## Admin-only announcement command

Action: **Send a saved announcement**. Access: Bot admins only.

## Ticket + auto-close workflow

Create a ticket type with **Close requests** enabled and an **Auto-close** timer. Members request closure; staff approve; inactive tickets close automatically.

## Moderation action sequence

Action: **Run multiple actions in sequence**. Step 1: Log to moderation log. Step 2: Kick user. Step 3: Send a confirmation to a staff channel.

## Conservative anti-raid

Join threshold: 15. Time window: 60s. Action: Alert. Account age: 1 day. This catches obvious raids without false positives.

## Conservative anti-nuke

All thresholds at default (5). Action: Alert only. Review logs for a week before considering stronger actions.
