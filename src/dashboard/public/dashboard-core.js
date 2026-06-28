export const dashboardSearchItems = [
  { category: "Page", label: "Overview", description: "Server status and recent activity", page: "overview", aliases: ["home", "summary", "status"] },
  { category: "Page", label: "Custom Commands", description: "Command Studio actions and responses", page: "custom", aliases: ["commands", "tags", "custom command", "command builder"] },
  { category: "Action", label: "Create a custom command", description: "Open the command editor", page: "custom", targetId: "custom-form", aliases: ["new command", "add command", "create tag"] },
  { category: "Setting", label: "Custom command permissions", description: "Everyone, admins, staff, or selected roles", page: "custom", targetId: "custom-form", aliases: ["command roles", "allowed roles", "blocked roles", "command access"] },
  { category: "Setting", label: "Custom command variables", description: "Insert user, server, channel, target, and text placeholders", page: "custom", targetId: "command-variable-chips", aliases: ["placeholders", "variables", "user variable"] },
  { category: "Guide", label: "Custom Commands guide", description: "Actions, permissions, cooldowns, and embeds", page: "docs", docTopic: "custom-commands", aliases: ["command docs", "command help"] },
  { category: "Page", label: "Ticket Panels", description: "Public ticket entry messages", page: "tickets", ticketView: "panels", aliases: ["tickets", "support panel", "ticket menu"] },
  { category: "Action", label: "Create a ticket panel", description: "Build a new public ticket entry panel", page: "tickets", ticketView: "panels", targetId: "panel-form", aliases: ["new ticket panel", "add support panel"] },
  { category: "Page", label: "Ticket Types", description: "Ticket categories, staff, and welcome messages", page: "tickets", ticketView: "types", aliases: ["ticket category", "support types"] },
  { category: "Action", label: "Create a ticket type", description: "Add a routed support option", page: "tickets", ticketView: "types", targetId: "ticket-form", aliases: ["new ticket type", "support category"] },
  { category: "Page", label: "Ticket History", description: "Opened, claimed, and closed tickets", page: "tickets", ticketView: "history", aliases: ["ticket records", "closed tickets", "transcripts"] },
  { category: "Page", label: "Close Requests", description: "Ticket close approvals", page: "tickets", ticketView: "close-requests", aliases: ["close ticket", "ticket approval"] },
  { category: "Guide", label: "Tickets guide", description: "Types, panels, close requests, and history", page: "docs", docTopic: "ticket-setup", aliases: ["ticket docs", "support setup"] },
  { category: "Page", label: "Announcements", description: "Reusable announcements and embeds", page: "announcements", aliases: ["announce", "broadcast", "news"] },
  { category: "Action", label: "Create an announcement", description: "Build a plain-text or embed announcement", page: "announcements", targetId: "announcement-form", aliases: ["new announcement", "send announcement"] },
  { category: "Page", label: "Social Promotion", description: "Social links and promotion embeds", page: "socials", aliases: ["socials", "self promotion", "social media"] },
  { category: "Action", label: "Send a socials panel", description: "Preview and publish saved social links", page: "socials", targetId: "socials-form", aliases: ["post socials", "social embed"] },
  { category: "Page", label: "Giveaways", description: "Create prizes, collect entries, schedule starts, end, cancel, and reroll winners", page: "giveaways", aliases: ["giveaway", "giveaways", "prizes", "winner", "winners", "reroll", "scheduled giveaway", "winner role", "winner dm", "bonus entries"] },
  { category: "Action", label: "Create a giveaway", description: "Save a giveaway draft, schedule it, or publish it to Discord", page: "giveaways", targetId: "giveaway-form", aliases: ["new giveaway", "start giveaway", "giveaway draft", "giveaway schedule", "host giveaway"] },
  { category: "Page", label: "Polls", description: "Create server button polls with option emojis, role restrictions, scheduling, and result visibility", page: "polls", aliases: ["poll", "polls", "vote", "voting", "survey", "question", "poll emoji", "poll results", "scheduled poll", "button voting", "poll buttons"] },
  { category: "Action", label: "Create a poll", description: "Build a restart-safe Discord button poll with labels, descriptions, and emojis", page: "polls", targetId: "poll-form", aliases: ["new poll", "start poll", "poll options", "vote options", "poll setup", "button poll"] },
  { category: "Page", label: "Moderation", description: "Warnings and moderation case records", page: "moderation", aliases: ["mod logs", "warnings", "cases", "case system", "moderation cases", "ban", "kick", "timeout", "untimeout", "unban"] },
  { category: "Page", label: "Server Settings", description: "Channels, staff roles, and bot admin roles", page: "settings", aliases: ["configuration", "channels", "roles", "admin roles", "staff access"] },
  { category: "Setting", label: "Staff and admin roles", description: "Choose trusted roles for staff and bot commands", page: "settings", targetId: "settings-form", aliases: ["role settings", "staff roles", "allowed admin roles", "command admins"] },
  { category: "Setting", label: "Ticket and moderation channels", description: "Configure categories, transcripts, announcements, and mod logs", page: "settings", targetId: "settings-form", aliases: ["channel settings", "mod log channel", "ticket category"] },
  { category: "Page", label: "Server Logs", description: "Member, message change, voice, channel, role, and audit events", page: "logging", aliases: ["logging", "audit logs", "server audit", "event logs", "message delete logs", "voice logs"] },
  { category: "Setting", label: "Role event logging", description: "Log role creation, changes, deletion, and member role updates", page: "logging", targetId: "logging-form", aliases: ["role logs", "logging roles", "roles", "role audit"] },
  { category: "Setting", label: "Voice event logging", description: "Log joins, leaves, moves, mute, stream, and video state", page: "logging", targetId: "logging-form", aliases: ["voice logs", "voice channel logs"] },
  { category: "Page", label: "Direct Messages", description: "Configure /dm, moderation DMs, and giveaway winner DMs", page: "dms", aliases: ["dm", "dms", "direct message", "staff dm", "moderation dm", "giveaway dm", "winner dm"] },
  { category: "Setting", label: "Staff /dm command", description: "Enable the safe one-user DM command and rate limit", page: "dms", targetId: "dm-settings-form", aliases: ["send dm", "staff message", "private message", "dm command"] },
  { category: "Setting", label: "Moderation DM templates", description: "Choose which moderation actions DM users and customize the template", page: "dms", targetId: "dm-settings-form", aliases: ["warn dm", "ban dm", "timeout dm", "kick dm", "appeal message"] },
  { category: "Setting", label: "Giveaway winner DMs", description: "Automatically DM winners when giveaways end or are rerolled", page: "dms", targetId: "dm-settings-form", aliases: ["giveaway winner message", "winner dm message", "reroll dm"] },
  { category: "Page", label: "Appearance", description: "Bot nickname, colors, images, and button style", page: "branding", aliases: ["branding", "theme", "bot name", "nickname", "colors"] },
  { category: "Setting", label: "Bot nickname and branding", description: "Update server branding and visual defaults", page: "branding", targetId: "branding-form", aliases: ["bot name", "appearance settings", "embed color", "logo"] },
  { category: "Page", label: "Welcome & Goodbye", description: "Join, leave, DM, boost, and automatic role settings", page: "welcome", aliases: ["welcome", "goodbye", "leave message", "join message", "boost message"] },
  { category: "Setting", label: "Auto Roles", description: "Automatically assign roles when members join", page: "welcome", targetId: "welcome-form", aliases: ["auto role", "autorole", "automatic roles", "join roles"] },
  { category: "Setting", label: "Server boost messages", description: "Choose the boost channel and message template", page: "welcome", targetId: "welcome-form", aliases: ["boost message", "booster announcement", "nitro boost"] },
  { category: "Page", label: "Anti Raid", description: "Join-wave protection", page: "security", securityView: "anti-raid", aliases: ["raid protection", "join spam"] },
  { category: "Page", label: "Anti Nuke", description: "Destructive action protection", page: "security", securityView: "anti-nuke", aliases: ["nuke protection", "audit protection"] },
  { category: "Page", label: "Role Protection", description: "Protect sensitive roles", page: "security", securityView: "anti-role", aliases: ["anti role", "role security"] },
  { category: "Page", label: "Verification", description: "Discord OAuth member verification", page: "security", securityView: "verification", aliases: ["verify", "oauth", "vpn check", "pending verification", "verification pending"] },
  { category: "Setting", label: "Verification role", description: "Choose the role assigned after a member passes", page: "security", securityView: "verification", targetId: "verification-form", aliases: ["verified role", "community role", "verification roles"] },
  { category: "Setting", label: "Verification channel", description: "Choose or create the server verification channel", page: "security", securityView: "verification", targetId: "verification-form", aliases: ["verify channel", "oauth channel"] },
  { category: "Setting", label: "Verification auto-kick", description: "Remove unverified users after a configured waiting period", page: "security", securityView: "verification", targetId: "verification-form", aliases: ["auto kick", "auto-kick", "kick unverified", "unverified timeout"] },
  { category: "Guide", label: "Verification setup guide", description: "Configure OAuth, Cloudflare, permissions, and privacy", page: "docs", docTopic: "verification-process", aliases: ["verification docs", "oauth setup", "verify help"] },
  { category: "Page", label: "Auto Mod", description: "Invite, link, caps, spam, and mention rules", page: "automation", automationView: "auto-mod", aliases: ["automod", "auto moderation", "invite blocker", "link blocker", "spam filter"] },
  { category: "Setting", label: "Discord invite blocking", description: "Block discord.gg and Discord invite URLs", page: "automation", automationView: "auto-mod", targetId: "automod-rules-card", aliases: ["invite links", "always block invites"] },
  { category: "Setting", label: "Mass mentions and repeated pings", description: "Configure mention thresholds and the repeated-ping window", page: "automation", automationView: "auto-mod", targetId: "automod-rules-card", aliases: ["ping spam", "mention spam", "mass pings"] },
  { category: "Setting", label: "Channel-specific link rules", description: "Allow or block domains in selected channels", page: "automation", automationView: "auto-mod", targetId: "automod-link-rules-section", aliases: ["allowed domains", "blocked domains", "self promotion links"] },
  { category: "Guide", label: "Auto Mod guide", description: "Configure rules, exemptions, actions, and permissions", page: "docs", docTopic: "auto-mod", aliases: ["automod docs", "moderation rules help"] },
  { category: "Page", label: "Role Panels", description: "Self-service button and dropdown role panels", page: "automation", automationView: "role-panels", aliases: ["reaction roles", "button roles", "dropdown roles", "select roles", "self roles", "role panel", "role hierarchy"] },
  { category: "Action", label: "Create a role panel", description: "Build a self-service role button or dropdown panel", page: "automation", automationView: "role-panels", targetId: "role-panel-form", aliases: ["new reaction roles", "add role buttons", "button role panel", "dropdown role panel"] },
  { category: "Page", label: "Sticky Messages", description: "Keep notices at the bottom of channels", page: "automation", automationView: "sticky", aliases: ["sticky", "persistent message"] },
  { category: "Page", label: "Scheduled Announcements", description: "Timed and repeating announcements", page: "automation", automationView: "scheduled", aliases: ["schedule", "scheduled messages", "timed announcements"] },
  { category: "Page", label: "Docs & Help", description: "Setup and feature documentation", page: "docs", aliases: ["docs", "help", "documentation"] },
  { category: "Guide", label: "Quick Start guide", description: "Install dependencies and launch CorePanel", page: "docs", docTopic: "quick-start", aliases: ["install bot", "run bot", "download github"] },
  { category: "Guide", label: "Railway Hosting guide", description: "Deploy the bot, dashboard, database, and uploads", page: "docs", docTopic: "railway-hosting", aliases: ["host bot", "production deploy", "railway"] },
  { category: "Guide", label: "Troubleshooting guide", description: "Resolve bot, dashboard, command, and database issues", page: "docs", docTopic: "bot-offline", aliases: ["errors", "bot offline", "application did not respond"] }
];

export function normalizeDashboardSearch(value) {
  return String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function searchDashboardItems(query, items = dashboardSearchItems) {
  const normalized = normalizeDashboardSearch(query);
  if (!normalized) return [];
  const compact = normalized.replace(/\s+/g, "");
  const queryTokens = normalized.split(/\s+/).filter(Boolean);
  return items
    .map((item) => {
      const terms = [item.label, ...(item.aliases || []), item.description]
        .map((value) => ({ raw: value, normalized: normalizeDashboardSearch(value) }));
      const match = terms.reduce((best, term, index) => {
        const normalizedTerm = term.normalized;
        const termCompact = normalizedTerm.replace(/\s+/g, "");
        let score = 0;
        if (normalizedTerm === normalized || termCompact === compact) score = 120;
        else if (normalizedTerm.startsWith(normalized) || termCompact.startsWith(compact)) score = 90;
        else if (normalizedTerm.includes(normalized) || termCompact.includes(compact)) score = 65;
        else if (queryTokens.every((token) => normalizedTerm.includes(token))) score = 48;
        if (index === 0) score += 8;
        return score > best.score ? { score, raw: term.raw } : best;
      }, { score: 0, raw: "" });
      return { item, score: match.score, matchedText: match.raw };
    })
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score || left.item.label.localeCompare(right.item.label))
    .map((result) => ({
      ...result.item,
      matchedText: result.matchedText
    }));
}

export function nextSearchIndex(currentIndex, resultCount, key) {
  if (resultCount <= 0) return -1;
  if (key === "ArrowDown") return (currentIndex + 1 + resultCount) % resultCount;
  if (key === "ArrowUp") return (currentIndex - 1 + resultCount) % resultCount;
  return currentIndex < 0 ? 0 : Math.min(currentIndex, resultCount - 1);
}

export function hasFormStateChanged(baseline, current) {
  return baseline !== current;
}

export function toggleState(enabled, activeMode = false) {
  return {
    enabled: Boolean(enabled),
    label: activeMode
      ? enabled ? "Active" : "Inactive"
      : enabled ? "Enabled" : "Disabled"
  };
}

export function shouldBlockNavigation(dirtyFormCount) {
  return Number(dirtyFormCount) > 0;
}
