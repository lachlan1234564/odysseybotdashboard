export const dashboardSearchItems = [
  { label: "Overview", description: "Server status and recent activity", page: "overview", aliases: ["home", "summary", "status"] },
  { label: "Custom Commands", description: "Command Studio actions and responses", page: "custom", aliases: ["commands", "tags", "custom command", "command builder"] },
  { label: "Ticket Panels", description: "Public ticket entry messages", page: "tickets", ticketView: "panels", aliases: ["tickets", "support panel", "ticket menu"] },
  { label: "Ticket Types", description: "Ticket categories, staff, and welcome messages", page: "tickets", ticketView: "types", aliases: ["ticket category", "support types"] },
  { label: "Ticket History", description: "Opened, claimed, and closed tickets", page: "tickets", ticketView: "history", aliases: ["ticket records", "closed tickets"] },
  { label: "Close Requests", description: "Ticket close approvals", page: "tickets", ticketView: "close-requests", aliases: ["close ticket", "ticket approval"] },
  { label: "Announcements", description: "Reusable announcements and embeds", page: "announcements", aliases: ["announce", "broadcast", "news"] },
  { label: "Social Promotion", description: "Social links and promotion embeds", page: "socials", aliases: ["socials", "self promotion", "social media"] },
  { label: "Moderation", description: "Warnings and moderation records", page: "moderation", aliases: ["mod logs", "warnings", "ban", "kick", "timeout"] },
  { label: "Server Settings", description: "Channels, staff roles, and bot admin roles", page: "settings", aliases: ["configuration", "channels", "roles", "admin roles", "staff access"] },
  { label: "Appearance", description: "Bot nickname, colors, images, and button style", page: "branding", aliases: ["branding", "theme", "bot name", "nickname", "colors"] },
  { label: "Welcome & Goodbye", description: "Join, leave, DM, and automatic role settings", page: "welcome", aliases: ["welcome", "goodbye", "leave message", "join message"] },
  { label: "Auto Roles", description: "Automatically assign roles when members join", page: "welcome", aliases: ["auto role", "autorole", "automatic roles", "join roles"] },
  { label: "Anti Raid", description: "Join-wave protection", page: "security", securityView: "anti-raid", aliases: ["raid protection", "join spam"] },
  { label: "Anti Nuke", description: "Destructive action protection", page: "security", securityView: "anti-nuke", aliases: ["nuke protection", "audit protection"] },
  { label: "Role Protection", description: "Protect sensitive roles", page: "security", securityView: "anti-role", aliases: ["anti role", "role security"] },
  { label: "Verification", description: "Discord OAuth member verification", page: "security", securityView: "verification", aliases: ["verify", "oauth", "vpn check"] },
  { label: "Auto Mod", description: "Invite, link, caps, spam, and mention rules", page: "automation", automationView: "auto-mod", aliases: ["automod", "invite blocker", "link blocker", "spam filter"] },
  { label: "Role Panels", description: "Self-service reaction role buttons", page: "automation", automationView: "role-panels", aliases: ["reaction roles", "button roles", "self roles"] },
  { label: "Sticky Messages", description: "Keep notices at the bottom of channels", page: "automation", automationView: "sticky", aliases: ["sticky", "persistent message"] },
  { label: "Scheduled Announcements", description: "Timed and repeating announcements", page: "automation", automationView: "scheduled", aliases: ["schedule", "scheduled messages", "timed announcements"] },
  { label: "Docs & Help", description: "Setup and feature documentation", page: "docs", aliases: ["docs", "help", "setup", "troubleshooting"] }
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
  return items
    .map((item) => {
      const terms = [item.label, item.description, ...(item.aliases || [])]
        .map(normalizeDashboardSearch);
      const score = terms.reduce((best, term) => {
        const termCompact = term.replace(/\s+/g, "");
        if (term === normalized || termCompact === compact) return Math.max(best, 100);
        if (term.startsWith(normalized) || termCompact.startsWith(compact)) return Math.max(best, 70);
        if (term.includes(normalized) || termCompact.includes(compact)) return Math.max(best, 45);
        return best;
      }, 0);
      return { item, score };
    })
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score || left.item.label.localeCompare(right.item.label))
    .map((result) => result.item);
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
