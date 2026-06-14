import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Router, type Request } from "express";
import { PermissionFlagsBits, REST, Routes } from "discord.js";
import multer from "multer";
import { marked } from "marked";
import { z } from "zod";
import {
  createAnnouncement,
  createRolePanel,
  createScheduledAnnouncement,
  createStickyMessage,
  createVerificationLink,
  createVerificationRecord,
  createCustomCommand,
  createTicketPanel,
  createTicketType,
  deleteAnnouncement,
  deleteRolePanel,
  deleteScheduledAnnouncement,
  deleteStickyMessage,
  deleteCustomCommand,
  deleteTicketPanel,
  deleteTicketType,
  getAntiNukeSettings,
  getAntiRoleSettings,
  getAntiRaidSettings,
  getAutoModSettings,
  getAnnouncement,
  getBranding,
  getGuildSettings,
  getOverview,
  getTicketPanel,
  getRolePanel,
  getScheduledAnnouncement,
  getSocialPromotionSettings,
  getVerificationLink,
  getVerificationSettings,
  getWelcomeSettings,
  listAnnouncements,
  listCustomCommands,
  listModerationActions,
  listRolePanels,
  listScheduledAnnouncements,
  listStickyMessages,
  listRecentTickets,
  listTicketPanels,
  listTicketCloseRequests,
  listTicketTypes,
  listWarnings,
  listVerificationRecords,
  saveAntiNukeSettings,
  saveAntiRoleSettings,
  saveAntiRaidSettings,
  saveAutoModSettings,
  saveBranding,
  resetBranding,
  saveGuildSettings,
  saveSocialPromotionSettings,
  saveVerificationSettings,
  saveWelcomeSettings,
  updateAnnouncement,
  updateCustomCommand,
  updateTicketPanel,
  updateTicketType,
  updateRolePanel,
  updateScheduledAnnouncement,
  updateStickyMessage
} from "../database/index.js";
import { loadDashboardConfig, resolveUploadsPath } from "../shared/config.js";
import { withTimeout } from "../shared/async.js";
import { normalizeDomain } from "../shared/domains.js";
import { updateAutoModSettingsCache } from "../shared/auto-mod-cache.js";
import { parseDiscordComponentEmoji } from "../shared/discord-components.js";
import {
  friendlyDiscordError,
  logDiscordError,
  logError,
  logErrorStack,
  safeErrorSummary
} from "../shared/logging.js";
import { emptyActionConfig, emptyEmbedConfig } from "../shared/types.js";
import { customCommandNeedsTrustedAccess } from "../shared/security.js";
import { isValidCommandName, normalizeCommandName } from "../shared/validation.js";
import { resolveGuildSelection, type ManageableGuild } from "./guild-selection.js";

const config = loadDashboardConfig();
const router = Router();
const rest = new REST({ version: "10", timeout: 5_000, retries: 1 }).setToken(config.DISCORD_TOKEN);
const loginAttempts = new Map<string, { count: number; blockedUntil: number }>();
type DiscordGuildSummary = ManageableGuild;
let guildCache: { expiresAt: number; guilds: DiscordGuildSummary[] } | null = null;
const uploadsPath = resolveUploadsPath(config.UPLOADS_DIR);
fs.mkdirSync(uploadsPath, { recursive: true });
const docsPath = path.join(config.projectRoot, "docs");
const docsTopics = [
  { slug: "quick-start", title: "Quick Start", description: "Download from GitHub, configure, and launch the bot for the first time.", files: ["QUICK-START.md"] },
  { slug: "getting-started", title: "Getting Started", description: "Understand the project, its processes, and the first configuration steps.", files: ["GETTING-STARTED.md"] },
  { slug: "setup", title: "Setup", description: "Discord application, environment variables, database, and command registration.", files: ["SETUP.md"] },
  { slug: "dashboard-guide", title: "Dashboard Guide", description: "A tour of every current dashboard area and safe testing workflow.", files: ["DASHBOARD-GUIDE.md"] },
  { slug: "custom-commands", title: "Custom Commands", description: "Build actions, permissions, placeholders, cooldowns, and embeds.", files: ["COMMAND-BUILDER.md", "ACTION-TEMPLATES.md", "VARIABLES.md"] },
  { slug: "command-builder", title: "Command Builder", description: "Create and validate database-backed commands in Command Studio.", files: ["COMMAND-BUILDER.md"] },
  { slug: "action-templates", title: "Action Templates", description: "Choose message, role, ticket, channel, moderation, and sequence actions.", files: ["ACTION-TEMPLATES.md"] },
  { slug: "tickets", title: "Tickets", description: "Ticket types, public panels, close requests, and history.", files: ["TICKET-TYPES.md", "TICKET-PANELS.md", "TICKET-CLOSE.md"] },
  { slug: "ticket-setup", title: "Ticket Setup", description: "Build a complete ticket workflow in the correct order.", files: ["TICKET-TYPES.md", "TICKET-PANELS.md"] },
  { slug: "ticket-panels", title: "Ticket Panels", description: "Build the public messages members use to open tickets.", files: ["TICKET-PANELS.md"] },
  { slug: "ticket-types", title: "Ticket Types", description: "Configure ticket routing, staff, access, lifecycle, and welcome messages.", files: ["TICKET-TYPES.md"] },
  { slug: "close-requests", title: "Close Requests", description: "Use the ticket button or /close-request staff approval workflow.", files: ["TICKET-CLOSE.md"] },
  { slug: "staff-access", title: "Staff Access", description: "Give staff dashboard access without sharing bot secrets.", files: ["STAFF-ACCESS.md"] },
  { slug: "railway-hosting", title: "Railway Hosting", description: "Deploy the long-running bot, dashboard, PostgreSQL, and uploads.", files: ["RAILWAY-HOSTING.md"] },
  { slug: "modlogs", title: "Modlogs", description: "Configure and read moderation, ticket, and security logs.", files: ["MODLOGS.md", "SECURITY-LOGS.md"] },
  { slug: "welcome-messages", title: "Welcome & Goodbye", description: "Configure public welcomes, DMs, embeds, auto-roles, and leave messages.", files: ["WELCOME.md"] },
  { slug: "security-overview", title: "Security Overview", description: "Understand safe defaults before enabling automated actions.", files: ["SECURITY-OVERVIEW.md"] },
  { slug: "anti-raid", title: "Anti Raid", description: "Detect suspicious join waves and choose a response.", files: ["ANTI-RAID.md"] },
  { slug: "anti-nuke", title: "Anti Nuke", description: "Monitor destructive audit-log activity and protect the server.", files: ["ANTI-NUKE.md"] },
  { slug: "role-protection", title: "Role Protection", description: "Detect dangerous role changes and protected-role assignments.", files: ["ROLE-PROTECTION.md"] },
  { slug: "auto-mod", title: "Auto Mod", description: "Block invites, suspicious links, caps, spam, and mass mentions.", files: ["AUTO-MOD.md"] },
  { slug: "role-panels", title: "Role Panels", description: "Let members add or remove approved roles with buttons.", files: ["ROLE-PANELS.md"] },
  { slug: "sticky-messages", title: "Sticky Messages", description: "Keep an important message at the bottom of a busy channel.", files: ["STICKY-MESSAGES.md"] },
  { slug: "scheduled-announcements", title: "Scheduled Announcements", description: "Send announcement templates once or on a repeating schedule.", files: ["SCHEDULED-ANNOUNCEMENTS.md"] },
  { slug: "social-promotion", title: "Social Promotion", description: "Build, preview, and publish a safe directory of community links.", files: ["SOCIAL-PROMOTION.md"] },
  { slug: "ticket-transcripts", title: "Ticket Transcripts", description: "Export the latest ticket messages when a ticket closes.", files: ["TICKET-TRANSCRIPTS.md"] },
  { slug: "permissions", title: "Permissions", description: "Discord permissions, role hierarchy, and dashboard access rules.", files: ["PERMISSIONS.md"] },
  { slug: "troubleshooting", title: "Troubleshooting", description: "Solve common bot, dashboard, upload, database, and hosting problems.", files: ["TROUBLESHOOTING.md"] },
  { slug: "cloudflare-verification-setup", title: "Cloudflare Verification Setup", description: "Set up Cloudflare Tunnel with separate verify/admin hostnames and OAuth.", files: ["cloudflare-verification-setup.md"] },
  { slug: "verification-process", title: "Verification Process", description: "How privacy-conscious Discord identity and membership verification works.", files: ["verification-process.md"] },
  { slug: "command-studio-variables", title: "Command Studio Variables", description: "All available placeholders for custom commands, tickets, and templates.", files: ["command-studio-variables.md"] }
] as const;

function logDashboardRoute(input: {
  route: string;
  guildId?: string;
  startedAt: number;
  status: number;
  error?: unknown;
}): void {
  const durationMs = performance.now() - input.startedAt;
  const details = [
    "[Dashboard API]",
    `route=${input.route}`,
    `guild=${input.guildId || "none"}`,
    `status=${input.status}`,
    `durationMs=${durationMs.toFixed(1)}`
  ];
  if (input.error) details.push(`error=${safeErrorSummary(input.error)}`);
  const output = details.join(" ");
  if (input.error) console.error(output);
  else console.info(output);
}

function readDocsMarkdown(files: readonly string[]): string {
  return files.map((file) => fs.readFileSync(path.join(docsPath, file), "utf8")).join("\n\n---\n\n");
}

function renderDocsMarkdown(markdown: string): string {
  return String(marked.parse(markdown, { gfm: true }))
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "");
}
const upload = multer({
  storage: multer.diskStorage({
    destination: uploadsPath,
    filename: (_req, file, callback) => {
      const extension = path.extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, "");
      callback(null, `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${extension}`);
    }
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    callback(null, /^image\/(png|jpe?g|gif|webp)$/i.test(file.mimetype));
  }
});

const optionalId = z.union([z.string().regex(/^\d+$/), z.literal(""), z.null()]).transform((value) => value || null);
const idArray = z.array(z.string().regex(/^\d+$/)).default([]);
const color = z.string().regex(/^#[0-9a-f]{6}$/i);
const urlOrEmpty = z.union([
  z.literal(""),
  z.string().url(),
  z.string().regex(/^\/uploads\/[a-zA-Z0-9._-]+$/)
]).default("");

const settingsSchema = z.object({
  modLogChannelId: optionalId,
  announcementChannelId: optionalId,
  ticketCategoryId: optionalId,
  transcriptChannelId: optionalId,
  staffRoleIds: idArray,
  mutedRoleId: optionalId,
  adminRoleIds: idArray
});

const brandingSchema = z.object({
  serverName: z.string().trim().min(1).max(32),
  accentColor: color,
  ticketButtonStyle: z.enum(["secondary", "primary", "success"]).default("secondary"),
  footerText: z.string().max(200),
  ticketPanelTitle: z.string().min(1).max(256),
  ticketPanelDescription: z.string().min(1).max(4000),
  ticketPanelColor: color,
  ticketPanelImageUrl: urlOrEmpty,
  announcementDefaultColor: color,
  announcementDefaultImageUrl: urlOrEmpty,
  announcementDefaultThumbnailUrl: urlOrEmpty,
  embedIconUrl: urlOrEmpty
});

const embedSchema = z.object({
  content: z.string().max(2000).default(""),
  title: z.string().max(256).default(""),
  titleUrl: urlOrEmpty,
  description: z.string().max(4096).default(""),
  color,
  authorName: z.string().max(256).default(""),
  authorIconUrl: urlOrEmpty,
  authorUrl: urlOrEmpty,
  imageUrl: urlOrEmpty,
  thumbnailUrl: urlOrEmpty,
  footerText: z.string().max(2048).default(""),
  footerIconUrl: urlOrEmpty,
  timestamp: z.boolean().default(false),
  fields: z.array(z.object({
    name: z.string().min(1).max(256),
    value: z.string().min(1).max(1024),
    inline: z.boolean().default(false)
  })).max(25).default([])
});

const actionSequenceItemSchema = z.object({
  actionType: z.enum([
    "reply_message", "reply_embed", "send_channel", "send_ephemeral", "send_dm",
    "add_role", "remove_role", "add_roles", "remove_roles", "toggle_role",
    "post_ticket_panel", "send_announcement",
    "create_ticket", "request_close_ticket",
    "lock_channel", "unlock_channel",
    "rename_channel", "move_channel",
    "add_user_to_channel", "remove_user_from_channel",
    "timeout_user", "remove_timeout",
    "kick_user", "ban_user", "unban_user",
    "purge_messages",
    "require_role", "require_permission",
    "log_to_mod"
  ]),
  content: z.string().max(2000).default(""),
  targetChannelId: optionalId,
  roleId: optionalId,
  roleIds: idArray,
  embed: embedSchema.default(emptyEmbedConfig()),
  targetUserId: optionalId,
  durationMinutes: z.coerce.number().int().min(1).max(40320).nullable().default(null),
  deleteMessageDays: z.coerce.number().int().min(0).max(7).nullable().default(null),
  amount: z.coerce.number().int().min(1).max(100).nullable().default(null),
  reason: z.string().max(1000).default(""),
  logChannelId: optionalId,
  newName: z.string().max(100).default(""),
  newCategoryId: optionalId,
  pingType: z.enum(["none", "everyone", "here"]).default("none")
});

const customCommandSchema = z.object({
  name: z.string().transform(normalizeCommandName).refine(isValidCommandName, {
    message: "Use lowercase letters, numbers, hyphens, and underscores only."
  }),
  description: z.string().max(100).default(""),
  enabled: z.boolean().default(true),
  actionType: z.enum([
    "reply_message",
    "reply_embed",
    "send_channel",
    "send_ephemeral",
    "send_dm",
    "add_role",
    "remove_role",
    "add_roles",
    "remove_roles",
    "toggle_role",
    "post_ticket_panel",
    "send_announcement",
    "create_ticket",
    "request_close_ticket",
    "lock_channel",
    "unlock_channel",
    "rename_channel",
    "move_channel",
    "add_user_to_channel",
    "remove_user_from_channel",
    "timeout_user",
    "remove_timeout",
    "kick_user",
    "ban_user",
    "unban_user",
    "purge_messages",
    "require_role",
    "require_permission",
    "log_to_mod",
    "action_sequence"
  ]),
  accessMode: z.enum(["everyone", "admins", "roles", "staff"]).default("everyone"),
  allowedRoleIds: idArray,
  blockedRoleIds: idArray,
  allowedChannelIds: idArray,
  blockedChannelIds: idArray,
  cooldownType: z.enum(["none", "user", "server"]).default("none"),
  cooldownSeconds: z.coerce.number().int().min(0).max(86400).default(0),
  replyVisibility: z.enum(["public", "private"]).default("public"),
  deleteUsage: z.boolean().default(false),
  actionConfig: z.object({
    content: z.string().max(2000).default(""),
    targetChannelId: optionalId,
    roleId: optionalId,
    roleIds: idArray,
    ticketPanelId: z.number().int().positive().nullable().default(null),
    announcementTemplateId: z.number().int().positive().nullable().default(null),
    embed: embedSchema.default(emptyEmbedConfig()),
    targetUserId: optionalId,
    durationMinutes: z.coerce.number().int().min(1).max(40320).nullable().default(null),
    deleteMessageDays: z.coerce.number().int().min(0).max(7).nullable().default(null),
    amount: z.coerce.number().int().min(1).max(100).nullable().default(null),
    reason: z.string().max(1000).default(""),
    logChannelId: optionalId,
    newName: z.string().max(100).default(""),
    newCategoryId: optionalId,
    pingType: z.enum(["none", "everyone", "here"]).default("none"),
    actionSequence: z.array(actionSequenceItemSchema).max(10).default([])
  }).default(emptyActionConfig())
}).superRefine((value, context) => {
  if (value.actionType === "reply_message" && !value.actionConfig.content.trim()) {
    context.addIssue({ code: "custom", path: ["actionConfig", "content"], message: "Add a reply message." });
  }
  if (["add_role", "remove_role", "toggle_role"].includes(value.actionType) && !value.actionConfig.roleId) {
    context.addIssue({ code: "custom", path: ["actionConfig", "roleId"], message: "Choose a role." });
  }
  if (["add_roles", "remove_roles"].includes(value.actionType) && !value.actionConfig.roleIds.length) {
    context.addIssue({ code: "custom", path: ["actionConfig", "roleIds"], message: "Choose at least one role." });
  }
  if (value.actionType === "post_ticket_panel" && !value.actionConfig.ticketPanelId) {
    context.addIssue({ code: "custom", path: ["actionConfig", "ticketPanelId"], message: "Choose a ticket panel." });
  }
  if (value.actionType === "send_announcement" && !value.actionConfig.announcementTemplateId) {
    context.addIssue({ code: "custom", path: ["actionConfig", "announcementTemplateId"], message: "Choose an announcement template." });
  }
  if (value.actionType === "action_sequence" && !value.actionConfig.actionSequence.length) {
    context.addIssue({ code: "custom", path: ["actionConfig", "actionSequence"], message: "Add at least one action to the sequence." });
  }
  if (["timeout_user", "kick_user", "ban_user", "unban_user", "add_user_to_channel", "remove_user_from_channel"].includes(value.actionType) && !value.actionConfig.targetUserId) {
    context.addIssue({ code: "custom", path: ["actionConfig", "targetUserId"], message: "Choose a target user." });
  }
  if (["rename_channel", "move_channel"].includes(value.actionType) && !value.actionConfig.newName && !value.actionConfig.newCategoryId) {
    context.addIssue({ code: "custom", path: ["actionConfig", "newName"], message: "Provide a new name or category." });
  }
  const roleIntersection = value.allowedRoleIds.filter((id) => value.blockedRoleIds.includes(id));
  if (roleIntersection.length > 0) {
    context.addIssue({ code: "custom", path: ["blockedRoleIds"], message: "A role cannot be both allowed and blocked." });
  }
  const channelIntersection = value.allowedChannelIds.filter((id) => value.blockedChannelIds.includes(id));
  if (channelIntersection.length > 0) {
    context.addIssue({ code: "custom", path: ["blockedChannelIds"], message: "A channel cannot be both allowed and blocked." });
  }
  if (value.accessMode === "roles" && value.allowedRoleIds.length === 0) {
    context.addIssue({ code: "custom", path: ["allowedRoleIds"], message: "Select at least one allowed role when access mode is 'Selected roles'." });
  }
  if (
    value.accessMode === "everyone"
    && customCommandNeedsTrustedAccess(value.actionType, value.actionConfig)
  ) {
    context.addIssue({
      code: "custom",
      path: ["accessMode"],
      message: "This high-impact action must be limited to bot admins, staff, or selected roles."
    });
  }
});

const ticketTypeSchema = z.object({
  label: z.string().min(1).max(100),
  description: z.string().max(100),
  emoji: z.string().max(64).refine((value) => {
    try {
      parseDiscordComponentEmoji(value);
      return true;
    } catch {
      return false;
    }
  }, "Use one Unicode emoji or a Discord custom emoji such as <:help:123456789012345678>."),
  staffRoleIds: idArray,
  pingRoleIds: idArray,
  allowedRoleIds: idArray,
  blockedRoleIds: idArray,
  categoryId: optionalId,
  welcomeMessage: z.string().min(1).max(4000),
  color,
  imageUrl: urlOrEmpty,
  thumbnailUrl: urlOrEmpty,
  footerText: z.string().max(200).default(""),
  footerIconUrl: urlOrEmpty,
  transcriptChannelId: optionalId,
  maxOpenTickets: z.coerce.number().int().min(1).max(20).default(1),
  namingFormat: z.string().min(1).max(90).regex(/^[a-zA-Z0-9{}_-]+$/, "Use letters, numbers, hyphens, underscores, and placeholders only."),
  claimButtonEnabled: z.boolean().default(true),
  closeButtonEnabled: z.boolean().default(true),
  closeReasonRequired: z.boolean().default(false),
  requestCloseEnabled: z.boolean().default(false),
  closeRequestDelaySeconds: z.coerce.number().int().min(0).max(86400).default(0),
  autoCloseHours: z.coerce.number().int().min(0).max(8760).default(0),
  active: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0)
}).superRefine((value, context) => {
  const roleIntersection = value.allowedRoleIds.filter((id) => value.blockedRoleIds.includes(id));
  if (roleIntersection.length > 0) {
    context.addIssue({ code: "custom", path: ["blockedRoleIds"], message: "A role cannot be both allowed and blocked." });
  }
});

const ticketPanelSchema = z.object({
  name: z.string().min(1).max(100),
  targetChannelId: optionalId,
  title: z.string().min(1).max(256),
  description: z.string().min(1).max(4000),
  color,
  imageUrl: urlOrEmpty,
  thumbnailUrl: urlOrEmpty,
  footerText: z.string().max(200).default(""),
  footerIconUrl: urlOrEmpty,
  displayMode: z.enum(["dropdown", "buttons"]).default("dropdown"),
  dropdownPlaceholder: z.string().min(1).max(150),
  active: z.boolean().default(true),
  panelKind: z.enum(["standard", "multi"]).default("standard"),
  ticketTypeIds: z.array(z.number().int().positive()).max(25).default([]),
  childPanelIds: z.array(z.number().int().positive()).max(25).default([])
}).superRefine((value, context) => {
  if (new Set(value.ticketTypeIds).size !== value.ticketTypeIds.length) {
    context.addIssue({ code: "custom", path: ["ticketTypeIds"], message: "Choose each ticket type only once." });
  }
  if (new Set(value.childPanelIds).size !== value.childPanelIds.length) {
    context.addIssue({ code: "custom", path: ["childPanelIds"], message: "Choose each child panel only once." });
  }
  if (value.panelKind === "standard" && value.ticketTypeIds.length === 0) {
    context.addIssue({ code: "custom", path: ["ticketTypeIds"], message: "Choose at least one ticket type." });
  }
  if (value.displayMode === "buttons" && value.ticketTypeIds.length > 25) {
    context.addIssue({ code: "custom", path: ["ticketTypeIds"], message: "Button panels support up to 25 ticket types." });
  }
  if (value.panelKind === "multi" && value.childPanelIds.length === 0) {
    context.addIssue({ code: "custom", path: ["childPanelIds"], message: "Choose at least one child panel." });
  }
});

const announcementSchema = z.object({
  name: z.string().min(1).max(100),
  outputMode: z.enum(["embed", "plain"]).default("embed"),
  title: z.string().max(256).default(""),
  body: z.string().min(1).max(4000),
  color,
  imageUrl: urlOrEmpty,
  thumbnailUrl: urlOrEmpty,
  footer: z.string().max(200),
  targetChannelId: optionalId,
  pingType: z.enum(["none", "everyone", "here"]).default("none")
}).superRefine((value, context) => {
  if (value.outputMode === "embed" && !value.title.trim()) {
    context.addIssue({ code: "custom", path: ["title"], message: "Add a title for an embed announcement." });
  }
  const plainLength = [value.title.trim(), value.body.trim(), value.footer.trim()]
    .filter(Boolean)
    .join("\n\n")
    .length;
  if (value.outputMode === "plain" && plainLength > 2000) {
    context.addIssue({
      code: "custom",
      path: ["body"],
      message: "Plain-text announcements, including title and footer, must be 2,000 characters or fewer."
    });
  }
});

const socialLinkSchema = z.object({
  label: z.string().trim().min(1).max(80),
  url: z.string().transform((value, context) => {
    try {
      return safeExternalUrl(value);
    } catch (error) {
      context.addIssue({
        code: "custom",
        message: error instanceof Error ? error.message : "Enter a valid HTTPS URL."
      });
      return z.NEVER;
    }
  })
});

const socialMediaUrlSchema = z.string().transform((value, context) => {
  if (!value) return "";
  if (/^\/uploads\/[a-zA-Z0-9._-]+$/.test(value)) return value;
  try {
    return safeExternalUrl(value);
  } catch (error) {
    context.addIssue({
      code: "custom",
      message: error instanceof Error ? error.message : "Enter a valid HTTPS image URL."
    });
    return z.NEVER;
  }
});

const socialPromotionSchema = z.object({
  outputMode: z.enum(["embed", "plain"]).default("embed"),
  title: z.string().trim().min(1).max(256),
  description: z.string().trim().min(1).max(3500),
  color,
  thumbnailUrl: socialMediaUrlSchema,
  imageUrl: socialMediaUrlSchema,
  targetChannelId: optionalId,
  links: z.array(socialLinkSchema).max(15).default([]),
  memberEntries: z.array(socialLinkSchema).max(15).default([])
}).superRefine((value, context) => {
  if (!value.links.length && !value.memberEntries.length) {
    context.addIssue({
      code: "custom",
      path: ["links"],
      message: "Add at least one social or member link."
    });
  }
  const plain = [
    value.title,
    value.description,
    ...value.links.map((link) => `${link.label}: ${link.url}`),
    ...value.memberEntries.map((link) => `${link.label}: ${link.url}`)
  ].join("\n\n");
  if (value.outputMode === "plain" && plain.length > 2000) {
    context.addIssue({
      code: "custom",
      path: ["description"],
      message: "The plain-text social promotion must be 2,000 characters or fewer."
    });
  }
});

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    crypto.timingSafeEqual(leftBuffer, Buffer.alloc(leftBuffer.length));
    return false;
  }
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function parseId(value: string): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

type UploadFile = { data: Buffer; name: string };

function publicRequestError(
  message: string,
  statusCode = 400,
  fields?: Record<string, string>
): Error {
  return Object.assign(new Error(message), { statusCode, expose: true, fields });
}

function dashboardComponentEmoji(value: string) {
  try {
    return parseDiscordComponentEmoji(value);
  } catch (error) {
    throw publicRequestError(error instanceof Error ? error.message : "The ticket emoji is invalid.");
  }
}

function getVerificationHmacSecret(): string {
  return crypto.createHash("sha256")
    .update(`${config.DASHBOARD_PASSWORD}:${config.DISCORD_CLIENT_ID}`)
    .digest("hex");
}

function hashVerificationToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function discordAccountCreatedAt(userId: string): Date {
  return new Date(Number((BigInt(userId) >> 22n) + 1420070400000n));
}

async function checkVpnOrProxy(ip: string): Promise<{ detected: boolean; reason: string }> {
  if (!config.VPN_CHECK_URL_TEMPLATE || !config.VPN_CHECK_API_KEY) {
    throw new Error("VPN/proxy checking is not configured on this dashboard.");
  }
  const url = config.VPN_CHECK_URL_TEMPLATE.replace("{ip}", encodeURIComponent(ip));
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${config.VPN_CHECK_API_KEY}`,
      "X-API-Key": config.VPN_CHECK_API_KEY
    },
    signal: AbortSignal.timeout(8_000)
  });
  if (!response.ok) throw new Error(`VPN provider returned HTTP ${response.status}.`);
  const data = await response.json() as Record<string, unknown>;
  const detected = [data.vpn, data.proxy, data.hosting, data.is_vpn, data.is_proxy]
    .some((value) => value === true || value === "true" || value === 1);
  return { detected, reason: detected ? "VPN or proxy detected." : "No VPN or proxy detected." };
}

function safeExternalUrl(value: string): string {
  if (value.length > 2048) throw new Error("URL must be 2,048 characters or fewer.");
  const url = new URL(value);
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (url.protocol !== "https:") throw new Error("Use an HTTPS URL.");
  if (url.username || url.password) throw new Error("URLs with embedded usernames or passwords are not allowed.");
  if (
    hostname === "localhost"
    || hostname.endsWith(".localhost")
    || hostname.endsWith(".local")
    || /^127\./.test(hostname)
    || hostname === "::1"
    || hostname === "0.0.0.0"
    || /^10\./.test(hostname)
    || /^192\.168\./.test(hostname)
    || /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
    || /^169\.254\./.test(hostname)
    || /^100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(hostname)
    || /^(?:fc|fd|fe[89ab])[a-f0-9]*:/i.test(hostname)
  ) {
    throw new Error("Local and private-network URLs are not allowed.");
  }
  return url.toString();
}

async function listDiscordGuilds(force = false): Promise<DiscordGuildSummary[]> {
  if (!force && guildCache && guildCache.expiresAt > Date.now()) return guildCache.guilds;
  try {
    const guilds = await rest.get(Routes.userGuilds()) as DiscordGuildSummary[];
    guildCache = {
      expiresAt: Date.now() + 5 * 60_000,
      guilds: guilds.sort((left, right) => left.name.localeCompare(right.name))
    };
    return guildCache.guilds;
  } catch (error) {
    if (guildCache?.guilds.length) {
      logError("Discord guild refresh timed out; using the last successful guild list", error);
      guildCache.expiresAt = Date.now() + 30_000;
      return guildCache.guilds;
    }
    logError("Discord guild list is temporarily unavailable", error);
    throw publicRequestError(
      "Discord did not respond while loading the server list. The dashboard is still running; wait a moment and retry.",
      503
    );
  }
}

async function ensureSelectedGuild(req: Request): Promise<string> {
  const selected = req.session.selectedGuildId;
  if (selected) return selected;
  throw publicRequestError("Choose a Discord server before opening this dashboard page.", 409);
}

function mediaUrl(value: string, files: UploadFile[]): string | undefined {
  if (!value) return undefined;
  if (!value.startsWith("/uploads/")) return value;
  const name = path.basename(value);
  const filePath = path.join(uploadsPath, name);
  if (!fs.existsSync(filePath)) return undefined;
  if (!files.some((file) => file.name === name)) files.push({ data: fs.readFileSync(filePath), name });
  return `attachment://${name}`;
}

function discordEmbed(input: z.infer<typeof embedSchema>, files: UploadFile[]) {
  const embed: Record<string, unknown> = {
    color: Number.parseInt(input.color.slice(1), 16)
  };
  if (input.title) embed.title = input.title;
  if (input.titleUrl) embed.url = input.titleUrl;
  if (input.description) embed.description = input.description;
  if (input.authorName) {
    embed.author = {
      name: input.authorName,
      icon_url: mediaUrl(input.authorIconUrl, files),
      url: input.authorUrl || undefined
    };
  }
  const image = mediaUrl(input.imageUrl, files);
  if (image) embed.image = { url: image };
  const thumbnail = mediaUrl(input.thumbnailUrl, files);
  if (thumbnail) embed.thumbnail = { url: thumbnail };
  if (input.footerText) {
    embed.footer = { text: input.footerText, icon_url: mediaUrl(input.footerIconUrl, files) };
  }
  if (input.timestamp) embed.timestamp = new Date().toISOString();
  if (input.fields.length) embed.fields = input.fields;
  return embed;
}

async function sendDiscordMessage(
  guildId: string,
  channelId: string,
  body: Record<string, unknown>,
  files: UploadFile[] = [],
  action = "Could not send the Discord message."
): Promise<void> {
  try {
    const channel = await rest.get(Routes.channel(channelId)) as { guild_id?: string };
    if (channel.guild_id !== guildId) {
      throw publicRequestError("That channel does not belong to the server currently selected in the dashboard.");
    }
    await rest.post(Routes.channelMessages(channelId), {
      body,
      files
    });
  } catch (error) {
    if (error && typeof error === "object" && "expose" in error && error.expose === true) throw error;
    logDiscordError(action, error);
    throw publicRequestError(friendlyDiscordError(error, action), 502);
  }
}

async function validateTicketTypeReferences(
  guildId: string,
  input: z.infer<typeof ticketTypeSchema>
): Promise<void> {
  let channels: Array<{ id: string; name: string; type: number }>;
  let roles: Array<{ id: string }>;
  let emojis: Array<{ id: string }>;
  try {
    [channels, roles, emojis] = await Promise.all([
      rest.get(Routes.guildChannels(guildId)) as Promise<Array<{ id: string; name: string; type: number }>>,
      rest.get(Routes.guildRoles(guildId)) as Promise<Array<{ id: string }>>,
      rest.get(Routes.guildEmojis(guildId)) as Promise<Array<{ id: string }>>
    ]);
  } catch (error) {
    logDiscordError("Ticket type validation could not load Discord resources", error);
    throw publicRequestError(
      "Could not verify the selected category, roles, and emoji with Discord. Check the bot connection and try again.",
      503
    );
  }
  const channelMap = new Map(channels.map((channel) => [channel.id, channel]));
  const roleIds = new Set(roles.map((role) => role.id));
  const emojiIds = new Set(emojis.map((emoji) => emoji.id));
  const selectedRoleIds = [
    ...input.staffRoleIds,
    ...input.pingRoleIds,
    ...input.allowedRoleIds,
    ...input.blockedRoleIds
  ];

  if (selectedRoleIds.some((roleId) => !roleIds.has(roleId))) {
    throw publicRequestError(
      "A selected ticket role no longer exists in this server. Refresh the page and choose the roles again.",
      400,
      {
        staffRoleIds: "One or more selected roles no longer exist in this server.",
        pingRoleIds: "Refresh the page and choose current server roles."
      }
    );
  }
  if (input.categoryId && channelMap.get(input.categoryId)?.type !== 4) {
    throw publicRequestError(
      "The selected ticket category is missing or belongs to another server.",
      400,
      { categoryId: "Choose a current category from the selected Discord server." }
    );
  }
  if (input.transcriptChannelId && ![0, 5].includes(channelMap.get(input.transcriptChannelId)?.type ?? -1)) {
    throw publicRequestError(
      "The selected transcript channel is missing or is not a text channel.",
      400,
      { transcriptChannelId: "Choose a text or announcement channel from the selected Discord server." }
    );
  }
  const selectedEmoji = parseDiscordComponentEmoji(input.emoji);
  if (selectedEmoji?.id && !emojiIds.has(selectedEmoji.id)) {
    throw publicRequestError(
      "The selected custom emoji is missing or belongs to another Discord server.",
      400,
      { emoji: "Choose a current emoji from the selected Discord server." }
    );
  }
}

async function validateTicketPanelReferences(
  guildId: string,
  input: z.infer<typeof ticketPanelSchema>,
  panelId?: number
): Promise<void> {
  const [types, panels] = await Promise.all([
    listTicketTypes(guildId),
    listTicketPanels(guildId)
  ]);
  const typeMap = new Map(types.map((type) => [type.id, type]));
  const panelMap = new Map(panels.map((panel) => [panel.id, panel]));

  if (input.panelKind === "standard") {
    if (input.ticketTypeIds.some((id) => !typeMap.has(id))) {
      throw publicRequestError("One or more selected ticket types do not belong to this server. Refresh the page and choose them again.");
    }
    if (input.active && !input.ticketTypeIds.some((id) => typeMap.get(id)?.active)) {
      throw publicRequestError("An active ticket panel needs at least one active ticket type.");
    }
  } else {
    if (input.childPanelIds.some((id) => id === panelId || !panelMap.has(id))) {
      throw publicRequestError("One or more selected child panels are invalid for this server.");
    }
    if (input.active && !input.childPanelIds.some((id) => panelMap.get(id)?.active)) {
      throw publicRequestError("An active multi-panel needs at least one active child panel.");
    }
  }

  if (input.targetChannelId) {
    const channel = await rest.get(Routes.channel(input.targetChannelId)) as { guild_id?: string; type?: number };
    if (channel.guild_id !== guildId) {
      throw publicRequestError("The selected panel channel does not belong to the server currently selected in the dashboard.");
    }
    if (![0, 5, 10, 11, 12].includes(channel.type ?? -1)) {
      throw publicRequestError("Ticket panels can only be posted in a text, announcement, or thread channel.");
    }
  }
}

router.get("/session", (req, res) => {
  res.json({
    authenticated: Boolean(req.session.authenticated),
    guildId: req.session.authenticated ? req.session.selectedGuildId : undefined,
    next: req.session.authenticated
      ? req.session.selectedGuildId ? "/" : "/servers"
      : "/login"
  });
});

router.post("/login", (req, res) => {
  const ip = req.ip ?? "local";
  const current = loginAttempts.get(ip);
  if (current && current.blockedUntil > Date.now()) {
    res.status(429).json({ error: "Too many attempts. Try again in a minute." });
    return;
  }

  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!safeEqual(password, config.DASHBOARD_PASSWORD)) {
    const count = (current?.count ?? 0) + 1;
    loginAttempts.set(ip, {
      count: count >= 5 ? 0 : count,
      blockedUntil: count >= 5 ? Date.now() + 60_000 : 0
    });
    res.status(401).json({ error: "Invalid password." });
    return;
  }

  loginAttempts.delete(ip);
  req.session.regenerate((error) => {
    if (error) {
      res.status(500).json({ error: "Could not create a login session." });
      return;
    }
    req.session.authenticated = true;
    delete req.session.selectedGuildId;
    res.json({ ok: true, next: "/servers" });
  });
});

router.post("/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get("/verify/:token/start", async (req, res, next) => {
  try {
    if (!config.DISCORD_CLIENT_SECRET) {
      throw publicRequestError("Discord OAuth verification is not configured.", 503);
    }
    const tokenHash = hashVerificationToken(req.params.token);
    const link = await getVerificationLink(tokenHash);
    if (!link) throw publicRequestError("This verification link is invalid or expired.", 404);
    const settings = await getVerificationSettings(link.guildId);
    if (!settings.enabled) throw publicRequestError("Verification is currently disabled for this server.", 403);

    const state = crypto.randomBytes(24).toString("base64url");
    req.session.verificationTokenHash = tokenHash;
    req.session.verificationOAuthState = state;
    const redirectUri = config.DISCORD_OAUTH_REDIRECT_URI
      ?? `${config.VERIFY_PUBLIC_BASE_URL ?? config.PUBLIC_BASE_URL ?? `${req.protocol}://${req.get("host")}`}/api/verify/callback`;
    const authorization = new URL("https://discord.com/oauth2/authorize");
    authorization.searchParams.set("client_id", config.DISCORD_CLIENT_ID);
    authorization.searchParams.set("response_type", "code");
    authorization.searchParams.set("scope", "identify guilds.members.read");
    authorization.searchParams.set("redirect_uri", redirectUri);
    authorization.searchParams.set("state", state);
    res.redirect(authorization.toString());
  } catch (error) {
    next(error);
  }
});

router.get("/verify/callback", async (req, res, next) => {
  try {
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const state = typeof req.query.state === "string" ? req.query.state : "";
    const tokenHash = req.session.verificationTokenHash;
    if (!code || !state || !tokenHash || state !== req.session.verificationOAuthState) {
      throw publicRequestError("The verification session is invalid or expired.", 400);
    }
    delete req.session.verificationTokenHash;
    delete req.session.verificationOAuthState;

    const link = await getVerificationLink(tokenHash);
    if (!link) throw publicRequestError("This verification link is invalid or expired.", 404);
    const settings = await getVerificationSettings(link.guildId);
    if (!settings.enabled || !config.DISCORD_CLIENT_SECRET) {
      throw publicRequestError("Verification is not currently available.", 503);
    }

    const redirectUri = config.DISCORD_OAUTH_REDIRECT_URI
      ?? `${config.VERIFY_PUBLIC_BASE_URL ?? config.PUBLIC_BASE_URL ?? `${req.protocol}://${req.get("host")}`}/api/verify/callback`;
    const tokenResponse = await fetch("https://discord.com/api/v10/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.DISCORD_CLIENT_ID,
        client_secret: config.DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri
      }),
      signal: AbortSignal.timeout(10_000)
    });
    if (!tokenResponse.ok) throw new Error(`Discord OAuth token exchange failed with HTTP ${tokenResponse.status}.`);
    const tokenData = await tokenResponse.json() as { access_token?: string };
    if (!tokenData.access_token) throw new Error("Discord OAuth did not return an access token.");

    const userResponse = await fetch("https://discord.com/api/v10/users/@me", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
      signal: AbortSignal.timeout(10_000)
    });
    if (!userResponse.ok) throw new Error(`Discord user lookup failed with HTTP ${userResponse.status}.`);
    const user = await userResponse.json() as { id: string };
    const accountCreatedAt = discordAccountCreatedAt(user.id);
    const accountAgeDays = Math.floor((Date.now() - accountCreatedAt.getTime()) / 86_400_000);

    let serverJoinedAt: string | null = null;
    let serverAgeDays = 0;
    try {
      const member = await rest.get(Routes.guildMember(link.guildId, user.id)) as { joined_at?: string };
      if (member?.joined_at) {
        serverJoinedAt = new Date(member.joined_at).toISOString();
        serverAgeDays = Math.floor((Date.now() - new Date(member.joined_at).getTime()) / 86_400_000);
      }
    } catch (error) {
      const errorCode = error && typeof error === "object" && "code" in error ? Number(error.code) : null;
      if (errorCode === 10007) {
        res.redirect("/verify.html?result=failed");
        return;
      }
    }

    const reasonCodes: string[] = [];
    let riskScore = 0;
    let status: "passed" | "flagged" | "denied" = "passed";

    if (accountAgeDays < settings.minAccountAgeDays) {
      reasonCodes.push("new_discord_account");
      riskScore += 30;
    }

    if (settings.minServerDays > 0 && serverAgeDays < settings.minServerDays) {
      reasonCodes.push("recent_server_member");
      riskScore += 20;
    }

    let vpnDetected: boolean | null = null;
    if (settings.vpnCheckEnabled) {
      try {
        const vpn = await checkVpnOrProxy(req.ip ?? "");
        vpnDetected = vpn.detected;
        if (vpn.detected) {
          reasonCodes.push("vpn_proxy_detected");
          riskScore += 40;
        }
      } catch (error) {
        logError("Verification VPN check failed", error);
        if (settings.vpnFailClosed) {
          reasonCodes.push("vpn_check_unavailable");
          riskScore += 30;
        }
      }
    }

    if (settings.action === "deny" && reasonCodes.length > 0) {
      status = "denied";
    } else if (reasonCodes.length > 0) {
      status = "flagged";
    }

    const expiresAt = new Date(Date.now() + settings.recordRetentionHours * 3_600_000).toISOString();
    await createVerificationRecord({
      guildId: link.guildId,
      userId: user.id,
      status,
      reasonCodes,
      riskScore,
      accountCreatedAt: accountCreatedAt.toISOString(),
      serverJoinedAt,
      vpnDetected,
      expiresAt
    });

    if (status === "denied") {
      res.redirect("/verify.html?result=failed");
    } else {
      if (settings.verifiedRoleId) {
        try {
          await rest.put(Routes.guildMemberRole(link.guildId, user.id, settings.verifiedRoleId));
        } catch {
          // role assignment failed, but verification passed
        }
      }
      res.redirect("/verify.html?result=passed");
    }
  } catch (error) {
    logErrorStack("Discord OAuth verification callback failed", error);
    res.redirect("/verify.html?result=error");
  }
});

router.use((req, res, next) => {
  if (!req.session.authenticated) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }
  next();
});

router.get("/guilds", async (req, res, next) => {
  try {
    const guilds = await listDiscordGuilds();
    if (!guilds.length) {
      throw publicRequestError("Odyssey Bot is not installed in any Discord servers.", 503);
    }
    const selection = resolveGuildSelection(guilds, req.session.selectedGuildId);
    if (selection.selectedGuildId) req.session.selectedGuildId = selection.selectedGuildId;
    else delete req.session.selectedGuildId;
    res.json({
      guilds,
      selectedGuildId: selection.selectedGuildId,
      autoSelected: selection.autoSelected,
      selectionRequired: selection.selectionRequired
    });
  } catch (error) {
    next(error);
  }
});

router.post("/guilds/select", async (req, res, next) => {
  try {
    const guildId = z.string().regex(/^\d+$/).parse(req.body?.guildId);
    const guilds = await listDiscordGuilds(true);
    if (!guilds.some((guild) => guild.id === guildId)) {
      res.status(400).json({ error: "Odyssey Bot is not installed in that server." });
      return;
    }
    req.session.selectedGuildId = guildId;
    res.json({ ok: true, next: "/" });
  } catch (error) {
    next(error);
  }
});

router.use(async (req, res, next) => {
  try {
    res.locals.guildId = await ensureSelectedGuild(req);
    next();
  } catch (error) {
    next(error);
  }
});

router.get("/docs", (req, res) => {
  const search = typeof req.query.search === "string" ? req.query.search.trim().toLowerCase() : "";
  const topics = docsTopics.filter((topic) => {
    if (!search) return true;
    const markdown = readDocsMarkdown(topic.files).toLowerCase();
    return topic.title.toLowerCase().includes(search)
      || topic.description.toLowerCase().includes(search)
      || markdown.includes(search);
  }).map(({ slug, title, description }) => ({ slug, title, description }));
  res.json(topics);
});

router.get("/docs/:slug", (req, res) => {
  const topic = docsTopics.find((candidate) => candidate.slug === req.params.slug);
  if (!topic) {
    res.status(404).json({ error: "Documentation topic not found." });
    return;
  }
  const markdown = readDocsMarkdown(topic.files);
  res.json({
    slug: topic.slug,
    title: topic.title,
    description: topic.description,
    html: renderDocsMarkdown(markdown)
  });
});

router.post("/uploads", upload.single("image"), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "Choose a PNG, JPEG, GIF, or WebP image up to 8 MB." });
    return;
  }
  res.status(201).json({
    url: `/uploads/${req.file.filename}`,
    name: req.file.originalname,
    size: req.file.size
  });
});

router.get("/discord/resources", async (_req, res) => {
  const startedAt = performance.now();
  const guildId = res.locals.guildId;
  try {
    const [guild, channels, roles, emojis] = await Promise.all([
      withTimeout(rest.get(Routes.guild(guildId)), 6_000, "Discord guild lookup"),
      withTimeout(rest.get(Routes.guildChannels(guildId)), 6_000, "Discord channel lookup"),
      withTimeout(rest.get(Routes.guildRoles(guildId)), 6_000, "Discord role lookup"),
      withTimeout(rest.get(Routes.guildEmojis(guildId)), 6_000, "Discord emoji lookup")
    ]);
    const guildData = guild as { id: string; name: string; icon?: string | null };
    const channelData = channels as Array<{ id: string; name: string; type: number; parent_id?: string | null }>;
    const roleData = roles as Array<{ id: string; name: string; color: number; position: number; managed: boolean }>;
    const emojiData = emojis as Array<{ id: string; name: string; animated?: boolean; available?: boolean }>;
    const response = {
      guild: guildData,
      channels: channelData
        .filter((channel) => [0, 2, 4, 5, 13, 15, 16].includes(channel.type))
        .sort((a, b) => a.type - b.type || a.name.localeCompare(b.name)),
      roles: roleData
        .filter((role) => role.id !== res.locals.guildId && !role.managed)
        .sort((a, b) => b.position - a.position),
      emojis: emojiData
        .filter((emoji) => emoji.available !== false)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((emoji) => ({
          id: emoji.id,
          name: emoji.name,
          animated: Boolean(emoji.animated),
          value: `<${emoji.animated ? "a" : ""}:${emoji.name}:${emoji.id}>`,
          imageUrl: `https://cdn.discordapp.com/emojis/${emoji.id}.${emoji.animated ? "gif" : "png"}?size=64&quality=lossless`
        }))
    };
    logDashboardRoute({
      route: "GET /api/discord/resources",
      guildId,
      startedAt,
      status: 200
    });
    res.json(response);
  } catch (error) {
    logDashboardRoute({
      route: "GET /api/discord/resources",
      guildId,
      startedAt,
      status: 503,
      error
    });
    res.status(503).json({
      ok: false,
      code: "DISCORD_RESOURCES_UNAVAILABLE",
      error: "Discord channels and roles could not be loaded.",
      detail: "Saved dashboard data is still available. Retry after the Discord connection recovers."
    });
  }
});

router.get("/overview", async (_req, res) => {
  res.json(await getOverview(res.locals.guildId));
});

router.get("/settings", async (_req, res) => {
  res.json(await getGuildSettings(res.locals.guildId));
});

router.put("/settings", async (req, res) => {
  const input = settingsSchema.parse(req.body);
  res.json(await saveGuildSettings({ guildId: res.locals.guildId, ...input }));
});

router.get("/branding", async (_req, res) => {
  res.json(await getBranding(res.locals.guildId));
});

async function updateSelectedGuildNickname(guildId: string, nickname: string): Promise<{
  status: "updated" | "failed";
  message: string;
}> {
  try {
    await rest.patch(Routes.guildMember(guildId, "@me"), {
      body: { nick: nickname }
    });
    return {
      status: "updated",
      message: `Bot nickname updated to "${nickname}" in the selected server.`
    };
  } catch (error) {
    logDiscordError("Could not update the selected server bot nickname", error);
    const code = error && typeof error === "object" && "code" in error
      ? Number(error.code)
      : null;
    return {
      status: "failed",
      message: code === 50013
        ? "Appearance was saved, but Discord denied the nickname change. Give the bot Change Nickname permission and keep its role below the server owner."
        : "Appearance was saved, but Discord did not accept the bot nickname change. Try again after the Discord connection recovers."
    };
  }
}

router.put("/branding", async (req, res) => {
  const input = brandingSchema.parse(req.body);
  const branding = await saveBranding({ guildId: res.locals.guildId, ...input });
  const nickname = await updateSelectedGuildNickname(res.locals.guildId, input.serverName);
  res.json({ branding, nickname });
});

router.delete("/branding", async (_req, res) => {
  const branding = await resetBranding(res.locals.guildId);
  const nickname = await updateSelectedGuildNickname(res.locals.guildId, branding.serverName);
  res.json({ branding, nickname });
});

router.get("/custom-commands", async (_req, res) => {
  res.json(await listCustomCommands(res.locals.guildId));
});

router.post("/custom-commands", async (req, res) => {
  const input = customCommandSchema.parse(req.body);
  res.status(201).json(await createCustomCommand({
    guildId: res.locals.guildId,
    ...input,
    createdByUserId: "local-dashboard",
    updatedByUserId: "local-dashboard"
  }));
});

router.put("/custom-commands/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid ID." });
  const input = customCommandSchema.parse(req.body);
  const result = await updateCustomCommand(id, res.locals.guildId, {
    ...input,
    updatedByUserId: "local-dashboard"
  });
  return result ? res.json(result) : res.status(404).json({ error: "Custom command not found." });
});

router.delete("/custom-commands/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid ID." });
  return (await deleteCustomCommand(id, res.locals.guildId))
    ? res.status(204).end()
    : res.status(404).json({ error: "Custom command not found." });
});

router.get("/ticket-types", async (_req, res) => {
  const startedAt = performance.now();
  const guildId = res.locals.guildId;
  try {
    const ticketTypes = await withTimeout(
      listTicketTypes(guildId),
      5_000,
      "Ticket type database query"
    );
    logDashboardRoute({
      route: "GET /api/ticket-types",
      guildId,
      startedAt,
      status: 200
    });
    res.json({ ok: true, items: ticketTypes });
  } catch (error) {
    logDashboardRoute({
      route: "GET /api/ticket-types",
      guildId,
      startedAt,
      status: 503,
      error
    });
    res.status(503).json({
      ok: false,
      items: [],
      code: "TICKET_TYPES_UNAVAILABLE",
      error: "Ticket types could not be loaded.",
      detail: "The dashboard database did not respond in time. Other dashboard areas are still available."
    });
  }
});

router.get("/ticket-panels", async (_req, res) => {
  res.json(await listTicketPanels(res.locals.guildId));
});

router.post("/ticket-panels", async (req, res) => {
  const input = ticketPanelSchema.parse(req.body);
  await validateTicketPanelReferences(res.locals.guildId, input);
  res.status(201).json(await createTicketPanel({ guildId: res.locals.guildId, ...input }));
});

router.put("/ticket-panels/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid ID." });
  const input = ticketPanelSchema.parse(req.body);
  await validateTicketPanelReferences(res.locals.guildId, input, id);
  const result = await updateTicketPanel(id, res.locals.guildId, input);
  return result ? res.json(result) : res.status(404).json({ error: "Ticket panel not found." });
});

router.delete("/ticket-panels/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid ID." });
  return (await deleteTicketPanel(id, res.locals.guildId))
    ? res.status(204).end()
    : res.status(404).json({ error: "Ticket panel not found." });
});

router.post("/ticket-types", async (req, res) => {
  const input = ticketTypeSchema.parse(req.body);
  await validateTicketTypeReferences(res.locals.guildId, input);
  res.status(201).json(await createTicketType({ guildId: res.locals.guildId, ...input }));
});

router.put("/ticket-types/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid ID." });
  const input = ticketTypeSchema.parse(req.body);
  await validateTicketTypeReferences(res.locals.guildId, input);
  const result = await updateTicketType(id, res.locals.guildId, input);
  return result ? res.json(result) : res.status(404).json({ error: "Ticket type not found." });
});

router.delete("/ticket-types/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid ID." });
  return (await deleteTicketType(id, res.locals.guildId))
    ? res.status(204).end()
    : res.status(404).json({ error: "Ticket type not found." });
});

router.get("/tickets", async (_req, res) => {
  res.json(await listRecentTickets(res.locals.guildId));
});

router.get("/ticket-close-requests", async (_req, res) => {
  res.json(await listTicketCloseRequests(res.locals.guildId));
});

router.get("/announcements", async (_req, res) => {
  res.json(await listAnnouncements(res.locals.guildId));
});

router.post("/announcements", async (req, res) => {
  const input = announcementSchema.parse(req.body);
  res.status(201).json(await createAnnouncement({ guildId: res.locals.guildId, ...input }));
});

router.put("/announcements/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid ID." });
  const result = await updateAnnouncement(id, res.locals.guildId, announcementSchema.parse(req.body));
  return result ? res.json(result) : res.status(404).json({ error: "Announcement not found." });
});

router.delete("/announcements/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid ID." });
  return (await deleteAnnouncement(id, res.locals.guildId))
    ? res.status(204).end()
    : res.status(404).json({ error: "Announcement not found." });
});

router.get("/socials", async (_req, res) => {
  res.json(await getSocialPromotionSettings(res.locals.guildId));
});

router.put("/socials", async (req, res) => {
  const input = socialPromotionSchema.parse(req.body);
  if (input.targetChannelId) {
    const channels = await rest.get(Routes.guildChannels(res.locals.guildId)) as Array<{ id: string; type: number }>;
    const channel = channels.find((item) => item.id === input.targetChannelId);
    if (!channel || ![0, 5].includes(channel.type)) {
      throw publicRequestError(
        "The Social Promotion target channel is missing, is not a text channel, or belongs to another server.",
        400,
        { targetChannelId: "Refresh the dashboard and choose a text channel from the selected server." }
      );
    }
  }
  res.json(await saveSocialPromotionSettings({ guildId: res.locals.guildId, ...input }));
});

router.post("/socials/send", async (req, res, next) => {
  try {
    const saved = await getSocialPromotionSettings(res.locals.guildId);
    const input = socialPromotionSchema.parse({
      ...saved,
      targetChannelId: req.body?.channelId ?? saved.targetChannelId
    });
    if (!input.targetChannelId) {
      throw publicRequestError(
        "Choose a target channel before sending the social promotion.",
        400,
        { targetChannelId: "Choose a text channel from the selected server." }
      );
    }
    const linkLines = input.links.map((link) => `[${link.label}](${link.url})`).join("\n");
    const memberLines = input.memberEntries.map((link) => `[${link.label}](${link.url})`).join("\n");
    const files: UploadFile[] = [];
    const plainContent = [
      input.title,
      input.description,
      ...input.links.map((link) => `${link.label}: ${link.url}`),
      ...input.memberEntries.map((link) => `${link.label}: ${link.url}`)
    ].filter(Boolean).join("\n\n");
    const embedInput = embedSchema.parse({
      ...emptyEmbedConfig(),
      title: input.title,
      description: input.description,
      color: input.color,
      thumbnailUrl: input.thumbnailUrl,
      imageUrl: input.imageUrl,
      fields: [
        ...(linkLines ? [{ name: "Official socials", value: linkLines, inline: false }] : []),
        ...(memberLines ? [{ name: "Community and members", value: memberLines, inline: false }] : [])
      ]
    });
    await sendDiscordMessage(res.locals.guildId, input.targetChannelId, {
      content: input.outputMode === "plain" ? plainContent : undefined,
      embeds: input.outputMode === "embed" ? [discordEmbed(embedInput, files)] : undefined,
      allowed_mentions: { parse: [] }
    }, files, "Could not send the social promotion.");
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.post("/test/embed", async (req, res, next) => {
  try {
    const input = z.object({
      channelId: z.string().regex(/^\d+$/),
      content: z.string().max(2000).default(""),
      embed: embedSchema
    }).parse(req.body);
    const files: UploadFile[] = [];
    const hasEmbed = Boolean(
      input.embed.title || input.embed.description || input.embed.authorName
      || input.embed.imageUrl || input.embed.thumbnailUrl || input.embed.footerText
      || input.embed.fields.length
    );
    await sendDiscordMessage(res.locals.guildId, input.channelId, {
      content: input.content || input.embed.content || undefined,
      embeds: hasEmbed ? [discordEmbed(input.embed, files)] : undefined
    }, files);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.post("/test/ticket-panel", async (req, res, next) => {
  try {
    const input = z.object({
      panelId: z.number().int().positive(),
      channelId: z.string().regex(/^\d+$/).nullable().optional()
    }).parse(req.body);
    const panel = await getTicketPanel(input.panelId, res.locals.guildId);
    if (!panel) {
      res.status(404).json({ error: "Ticket panel not found." });
      return;
    }
    if (!panel.active) {
      res.status(400).json({ error: "Enable this ticket panel before sending it." });
      return;
    }
    const channelId = input.channelId ?? panel.targetChannelId;
    if (!channelId) {
      res.status(400).json({ error: "Choose a test channel or configure the panel target channel." });
      return;
    }
    const files: UploadFile[] = [];
    const branding = await getBranding(res.locals.guildId);
    const ticketButtonStyle = branding.ticketButtonStyle === "primary"
      ? 1
      : branding.ticketButtonStyle === "success" ? 3 : 2;
    const embedInput = embedSchema.parse({
      ...emptyEmbedConfig(),
      title: panel.title,
      description: panel.description,
      color: panel.color,
      imageUrl: panel.imageUrl,
      thumbnailUrl: panel.thumbnailUrl,
      footerText: panel.footerText,
      footerIconUrl: panel.footerIconUrl
    });
    const components: Array<Record<string, unknown>> = [];
    if (panel.panelKind === "multi") {
      const childPanels = (await Promise.all(panel.childPanelIds
        .map((id) => getTicketPanel(id, res.locals.guildId))))
        .filter((item) => Boolean(item?.active))
        .slice(0, 25);
      if (!childPanels.length) {
        throw publicRequestError("This multi-panel has no active child panels. Edit it and select at least one active panel.");
      }
      components.push({
        type: 1,
        components: [{
          type: 3,
          custom_id: `ticket:panel-select:${panel.id}`,
          placeholder: panel.dropdownPlaceholder,
          options: childPanels.map((child) => ({
            label: child!.name,
            description: child!.description.slice(0, 100) || undefined,
            value: String(child!.id)
          }))
        }]
      });
    } else {
      const typeMap = new Map((await listTicketTypes(res.locals.guildId)).map((type) => [type.id, type]));
      const types = panel.ticketTypeIds
        .map((id) => typeMap.get(id))
        .filter((type) => Boolean(type?.active))
        .slice(0, 25);
      if (!types.length) {
        throw publicRequestError("This panel has no active ticket types. Edit it and select at least one active ticket type.");
      }
      if (panel.displayMode === "buttons") {
        for (let index = 0; index < types.length; index += 5) {
          components.push({
            type: 1,
            components: types.slice(index, index + 5).map((type) => ({
              type: 2,
              style: ticketButtonStyle,
              custom_id: `ticket:create-button:${panel.id}:${type!.id}`,
              label: type!.label,
              emoji: dashboardComponentEmoji(type!.emoji)
            }))
          });
        }
      } else {
        components.push({
          type: 1,
          components: [{
            type: 3,
            custom_id: `ticket:create:${panel.id}`,
            placeholder: panel.dropdownPlaceholder,
            options: types.map((type) => ({
              label: type!.label,
              description: type!.description || undefined,
              value: String(type!.id),
              emoji: dashboardComponentEmoji(type!.emoji)
            }))
          }]
        });
      }
    }
    await sendDiscordMessage(res.locals.guildId, channelId, {
      embeds: [discordEmbed(embedInput, files)],
      components
    }, files, `Could not post ticket panel "${panel.name}".`);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.get("/moderation", async (_req, res) => {
  const [warnings, actions] = await Promise.all([
    listWarnings(res.locals.guildId, undefined, 100),
    listModerationActions(res.locals.guildId, 100)
  ]);
  res.json({
    warnings,
    actions
  });
});

const welcomeSchema = z.object({
  enabled: z.boolean().default(false),
  channelId: optionalId,
  dmEnabled: z.boolean().default(false),
  dmContent: z.string().max(2000).default(""),
  dmEmbedEnabled: z.boolean().default(false),
  content: z.string().max(2000).default(""),
  embedTitle: z.string().max(256).default(""),
  embedDescription: z.string().max(4096).default(""),
  embedColor: color,
  embedImageUrl: urlOrEmpty,
  embedThumbnailUrl: urlOrEmpty,
  embedFooterText: z.string().max(2048).default(""),
  autoRolesEnabled: z.boolean().default(false),
  autoRoleIds: idArray,
  goodbyeEnabled: z.boolean().default(false),
  goodbyeChannelId: optionalId,
  goodbyeContent: z.string().max(2000).default(""),
  goodbyeEmbedEnabled: z.boolean().default(false),
  boostEnabled: z.boolean().default(false),
  boostChannelId: optionalId,
  boostMessage: z.string().max(2000).default("")
}).superRefine((value, context) => {
  if (value.boostEnabled && !value.boostChannelId) {
    context.addIssue({
      code: "custom",
      path: ["boostChannelId"],
      message: "Choose a channel before enabling boost messages."
    });
  }
  if (value.boostEnabled && !value.boostMessage.trim()) {
    context.addIssue({
      code: "custom",
      path: ["boostMessage"],
      message: "Enter a boost message before enabling this feature."
    });
  }
  if (value.autoRolesEnabled && value.autoRoleIds.length === 0) {
    context.addIssue({
      code: "custom",
      path: ["autoRoleIds"],
      message: "Choose at least one role before enabling Auto Roles."
    });
  }
});

router.get("/welcome", async (_req, res) => {
  res.json(await getWelcomeSettings(res.locals.guildId));
});

router.put("/welcome", async (req, res) => {
  const input = welcomeSchema.parse(req.body);
  const channels = await rest.get(Routes.guildChannels(res.locals.guildId)) as Array<{ id: string; type: number }>;
  const textChannelIds = new Set(channels.filter((channel) => [0, 5].includes(channel.type)).map((channel) => channel.id));
  if (input.channelId && !textChannelIds.has(input.channelId)) {
    throw publicRequestError(
      "The welcome channel is missing or belongs to another server.",
      400,
      { channelId: "Refresh the dashboard and choose a text channel from the active server." }
    );
  }
  if (input.goodbyeChannelId && !textChannelIds.has(input.goodbyeChannelId)) {
    throw publicRequestError(
      "The goodbye channel is missing or belongs to another server.",
      400,
      { goodbyeChannelId: "Refresh the dashboard and choose a text channel from the active server." }
    );
  }
  if (input.boostChannelId && !textChannelIds.has(input.boostChannelId)) {
    throw publicRequestError(
      "The boost message channel is missing or belongs to another server.",
      400,
      { boostChannelId: "Refresh the dashboard and choose a text channel from the active server." }
    );
  }
  res.json(await saveWelcomeSettings({ guildId: res.locals.guildId, ...input }));
});

const antiRaidSchema = z.object({
  enabled: z.boolean().default(false),
  joinThreshold: z.coerce.number().int().min(1).max(1000).default(10),
  timeWindowSeconds: z.coerce.number().int().min(1).max(3600).default(60),
  action: z.enum(["alert", "lockdown", "timeout_new", "kick_suspicious", "disable_invites"]).default("alert"),
  lockdownDurationSeconds: z.coerce.number().int().min(1).max(3600).default(300),
  minAccountAgeDays: z.coerce.number().int().min(0).max(365).default(0),
  blockNoAvatar: z.boolean().default(false),
  bypassRoleIds: idArray,
  bypassUserIds: idArray,
  alertChannelId: optionalId,
  logChannelId: optionalId
});

router.get("/anti-raid", async (_req, res) => {
  res.json(await getAntiRaidSettings(res.locals.guildId));
});

router.put("/anti-raid", async (req, res) => {
  const input = antiRaidSchema.parse(req.body);
  res.json(await saveAntiRaidSettings({ guildId: res.locals.guildId, ...input }));
});

const antiNukeSchema = z.object({
  enabled: z.boolean().default(false),
  channelDeleteThreshold: z.coerce.number().int().min(1).max(100).default(5),
  channelCreateThreshold: z.coerce.number().int().min(1).max(100).default(5),
  roleDeleteThreshold: z.coerce.number().int().min(1).max(100).default(5),
  roleCreateThreshold: z.coerce.number().int().min(1).max(100).default(5),
  banThreshold: z.coerce.number().int().min(1).max(100).default(5),
  kickThreshold: z.coerce.number().int().min(1).max(100).default(5),
  webhookThreshold: z.coerce.number().int().min(1).max(100).default(3),
  permissionThreshold: z.coerce.number().int().min(1).max(100).default(3),
  botAddThreshold: z.coerce.number().int().min(1).max(100).default(2),
  adminRoleThreshold: z.coerce.number().int().min(1).max(100).default(2),
  timeWindowSeconds: z.coerce.number().int().min(1).max(3600).default(10),
  action: z.enum(["alert", "remove_roles", "timeout_executor", "kick_executor", "ban_executor"]).default("alert"),
  alertChannelId: optionalId,
  logChannelId: optionalId
});

router.get("/anti-nuke", async (_req, res) => {
  res.json(await getAntiNukeSettings(res.locals.guildId));
});

router.put("/anti-nuke", async (req, res) => {
  const input = antiNukeSchema.parse(req.body);
  res.json(await saveAntiNukeSettings({ guildId: res.locals.guildId, ...input }));
});

const antiRoleSchema = z.object({
  enabled: z.boolean().default(false),
  protectedRoleIds: idArray,
  trustedUserIds: idArray,
  trustedRoleIds: idArray,
  action: z.enum(["log", "remove_permission", "remove_role", "timeout", "kick", "ban"]).default("log"),
  massChangeThreshold: z.coerce.number().int().min(2).max(100).default(4),
  timeWindowSeconds: z.coerce.number().int().min(2).max(3600).default(20),
  logChannelId: optionalId
}).superRefine((value, context) => {
  if (value.action === "remove_role" && value.protectedRoleIds.length === 0) {
    context.addIssue({
      code: "custom",
      path: ["protectedRoleIds"],
      message: "Choose at least one protected role before using Remove assigned role."
    });
  }
});

router.get("/anti-role", async (_req, res) => {
  res.json(await getAntiRoleSettings(res.locals.guildId));
});

router.put("/anti-role", async (req, res) => {
  const input = antiRoleSchema.parse(req.body);
  res.json(await saveAntiRoleSettings({ guildId: res.locals.guildId, ...input }));
});

const autoModSchema = z.object({
  enabled: z.boolean().default(false),
  blockInvites: z.boolean().default(false),
  blockSuspiciousLinks: z.boolean().default(false),
  blockCaps: z.boolean().default(false),
  blockSpam: z.boolean().default(false),
  blockMassMentions: z.boolean().default(false),
  capsPercentage: z.coerce.number().int().min(50).max(100).default(75),
  spamThreshold: z.coerce.number().int().min(2).max(20).default(4),
  mentionThreshold: z.coerce.number().int().min(2).max(50).default(5),
  mentionSpamThreshold: z.coerce.number().int().min(2).max(20).default(3),
  mentionWindowSeconds: z.coerce.number().int().min(5).max(3600).default(30),
  action: z.enum(["delete", "warn", "timeout", "log"]).default("delete"),
  timeoutMinutes: z.coerce.number().int().min(1).max(40320).default(10),
  alwaysBlockDiscordInvites: z.boolean().default(true),
  linkChannelRules: z.array(z.object({
    channelId: z.string().regex(/^\d+$/, "Choose a valid Discord channel."),
    allowedDomains: z.array(z.string()).max(50).transform((domains, context) => {
      try {
        return [...new Set(domains.map(normalizeDomain))];
      } catch (error) {
        context.addIssue({
          code: "custom",
          message: error instanceof Error ? error.message : "Invalid allowed domain."
        });
        return z.NEVER;
      }
    }),
    blockedDomains: z.array(z.string()).max(50).transform((domains, context) => {
      try {
        return [...new Set(domains.map(normalizeDomain))];
      } catch (error) {
        context.addIssue({
          code: "custom",
          message: error instanceof Error ? error.message : "Invalid blocked domain."
        });
        return z.NEVER;
      }
    })
  })).max(50).default([]),
  ignoredChannelIds: idArray,
  ignoredRoleIds: idArray,
  ignoredUserIds: idArray,
  logChannelId: optionalId
}).superRefine((value, context) => {
  if (value.enabled && ![
    value.blockInvites,
    value.blockSuspiciousLinks,
    value.blockCaps,
    value.blockSpam,
    value.blockMassMentions
  ].some(Boolean)) {
    context.addIssue({
      code: "custom",
      path: ["blockInvites"],
      message: "Turn on at least one Auto Mod rule before enabling Auto Mod."
    });
  }
  value.linkChannelRules.forEach((rule, index) => {
    const conflicts = rule.allowedDomains.filter((domain) => rule.blockedDomains.includes(domain));
    if (conflicts.length) {
      context.addIssue({
        code: "custom",
        path: ["linkChannelRules", index, "blockedDomains"],
        message: `${conflicts.join(", ")} cannot be both allowed and blocked.`
      });
    }
    if (value.linkChannelRules.findIndex((item) => item.channelId === rule.channelId) !== index) {
      context.addIssue({
        code: "custom",
        path: ["linkChannelRules", index, "channelId"],
        message: "Use one link rule per channel."
      });
    }
  });
});

interface DiscordRolePermissions {
  id: string;
  name: string;
  permissions: string;
}

interface DiscordMemberPermissions {
  user: { id: string };
  roles: string[];
}

interface DiscordChannelPermissions {
  id: string;
  name: string;
  type: number;
  permission_overwrites?: Array<{
    id: string;
    type: number;
    allow: string;
    deny: string;
  }>;
}

function channelPermissionsForBot(
  guildId: string,
  member: DiscordMemberPermissions,
  roles: DiscordRolePermissions[],
  channel: DiscordChannelPermissions
): bigint {
  const memberRoleIds = new Set([guildId, ...member.roles]);
  let permissions = roles
    .filter((role) => memberRoleIds.has(role.id))
    .reduce((value, role) => value | BigInt(role.permissions), 0n);
  if ((permissions & PermissionFlagsBits.Administrator) !== 0n) return ~0n;

  const overwrites = channel.permission_overwrites ?? [];
  const everyone = overwrites.find((overwrite) => overwrite.id === guildId);
  if (everyone) {
    permissions = (permissions & ~BigInt(everyone.deny)) | BigInt(everyone.allow);
  }
  let roleDeny = 0n;
  let roleAllow = 0n;
  for (const overwrite of overwrites) {
    if (overwrite.type === 0 && memberRoleIds.has(overwrite.id) && overwrite.id !== guildId) {
      roleDeny |= BigInt(overwrite.deny);
      roleAllow |= BigInt(overwrite.allow);
    }
  }
  permissions = (permissions & ~roleDeny) | roleAllow;
  const memberOverwrite = overwrites.find((overwrite) =>
    overwrite.type === 1 && overwrite.id === member.user.id
  );
  if (memberOverwrite) {
    permissions = (permissions & ~BigInt(memberOverwrite.deny)) | BigInt(memberOverwrite.allow);
  }
  return permissions;
}

router.get("/auto-mod/diagnostics", async (_req, res) => {
  const startedAt = performance.now();
  const guildId = res.locals.guildId;
  try {
    const settings = await getAutoModSettings(guildId);
    const [member, roles, channels, application] = await Promise.all([
      withTimeout(
        rest.get(Routes.guildMember(guildId, "@me")) as Promise<DiscordMemberPermissions>,
        6_000,
        "Discord bot member lookup"
      ),
      withTimeout(
        rest.get(Routes.guildRoles(guildId)) as Promise<DiscordRolePermissions[]>,
        6_000,
        "Discord role lookup"
      ),
      withTimeout(
        rest.get(Routes.guildChannels(guildId)) as Promise<DiscordChannelPermissions[]>,
        6_000,
        "Discord channel lookup"
      ),
      withTimeout(
        rest.get(Routes.currentApplication()) as Promise<{ flags?: number }>,
        6_000,
        "Discord application lookup"
      )
    ]);
    const applicationFlags = BigInt(application.flags ?? 0);
    const guildMembersIntentFlags = (1n << 14n) | (1n << 15n);
    const messageContentIntentFlags = (1n << 18n) | (1n << 19n);
    const textChannels = channels.filter((channel) => [0, 5].includes(channel.type));
    const missingModerationChannels = textChannels.filter((channel) => {
      const permissions = channelPermissionsForBot(guildId, member, roles, channel);
      return (permissions & PermissionFlagsBits.ViewChannel) === 0n
        || (permissions & PermissionFlagsBits.ReadMessageHistory) === 0n
        || (permissions & PermissionFlagsBits.ManageMessages) === 0n;
    });
    const basePermissions = roles
      .filter((role) => role.id === guildId || member.roles.includes(role.id))
      .reduce((value, role) => value | BigInt(role.permissions), 0n);
    const logChannelId = settings.logChannelId ?? (await getGuildSettings(guildId)).modLogChannelId;
    const logChannel = logChannelId
      ? channels.find((channel) => channel.id === logChannelId)
      : null;
    const logPermissions = logChannel
      ? channelPermissionsForBot(guildId, member, roles, logChannel)
      : 0n;
    const warnings: string[] = [];
    if ((applicationFlags & messageContentIntentFlags) === 0n) {
      warnings.push("Message Content Intent is not enabled in the Discord Developer Portal. AutoMod cannot inspect message text.");
    }
    if ((applicationFlags & guildMembersIntentFlags) === 0n) {
      warnings.push("Server Members Intent is not enabled in the Discord Developer Portal. Role bypasses, Auto Roles, and boost messages may be incomplete.");
    }
    if (missingModerationChannels.length) {
      const names = missingModerationChannels.slice(0, 4).map((channel) => `#${channel.name}`).join(", ");
      warnings.push(`AutoMod lacks View Channel, Read Message History, or Manage Messages in ${missingModerationChannels.length} text channel(s): ${names}${missingModerationChannels.length > 4 ? ", …" : ""}.`);
    }
    if (
      settings.action === "timeout"
      && (basePermissions & PermissionFlagsBits.Administrator) === 0n
      && (basePermissions & PermissionFlagsBits.ModerateMembers) === 0n
    ) {
      warnings.push("Timeout is selected, but Odyssey Bot does not have Moderate Members.");
    }
    if (!logChannelId) {
      warnings.push("No AutoMod or global moderation log channel is configured.");
    } else if (!logChannel) {
      warnings.push("The configured AutoMod log channel no longer exists.");
    } else if (
      (logPermissions & PermissionFlagsBits.ViewChannel) === 0n
      || (logPermissions & PermissionFlagsBits.SendMessages) === 0n
      || (logPermissions & PermissionFlagsBits.EmbedLinks) === 0n
    ) {
      warnings.push(`Odyssey Bot cannot send embeds in #${logChannel.name}. Check View Channel, Send Messages, and Embed Links.`);
    }
    const response = {
      ok: warnings.length === 0,
      warnings,
      checks: [
        { label: "Message Content Intent", ok: (applicationFlags & messageContentIntentFlags) !== 0n },
        { label: "Server Members Intent", ok: (applicationFlags & guildMembersIntentFlags) !== 0n },
        { label: "Moderation channel permissions", ok: missingModerationChannels.length === 0 },
        { label: "Timeout permission", ok: settings.action !== "timeout" || (basePermissions & (PermissionFlagsBits.Administrator | PermissionFlagsBits.ModerateMembers)) !== 0n },
        { label: "Log channel permissions", ok: Boolean(logChannelId && logChannel && (logPermissions & PermissionFlagsBits.ViewChannel) !== 0n && (logPermissions & PermissionFlagsBits.SendMessages) !== 0n && (logPermissions & PermissionFlagsBits.EmbedLinks) !== 0n) }
      ],
      exemptions: {
        ignoredChannels: settings.ignoredChannelIds.map((id) => ({
          id,
          name: channels.find((channel) => channel.id === id)?.name ?? "Deleted or unavailable channel"
        })),
        ignoredRoles: settings.ignoredRoleIds.map((id) => ({
          id,
          name: roles.find((role) => role.id === id)?.name ?? "Deleted or unavailable role"
        })),
        ignoredUserIds: settings.ignoredUserIds
      }
    };
    logDashboardRoute({
      route: "GET /api/auto-mod/diagnostics",
      guildId,
      startedAt,
      status: 200
    });
    res.json(response);
  } catch (error) {
    logDashboardRoute({
      route: "GET /api/auto-mod/diagnostics",
      guildId,
      startedAt,
      status: 200,
      error
    });
    res.status(200).json({
      ok: false,
      unavailable: true,
      warnings: [
        "Discord readiness could not be checked because Discord did not respond in time. AutoMod settings can still be edited and saved."
      ],
      checks: [],
      exemptions: null
    });
  }
});

router.get("/auto-mod", async (_req, res) => {
  res.json(await getAutoModSettings(res.locals.guildId));
});

router.put("/auto-mod", async (req, res) => {
  const input = autoModSchema.parse(req.body);
  const channels = await rest.get(Routes.guildChannels(res.locals.guildId)) as Array<{ id: string; type: number }>;
  const textChannelIds = new Set(channels.filter((channel) => [0, 5].includes(channel.type)).map((channel) => channel.id));
  const invalidRule = input.linkChannelRules.find((rule) => !textChannelIds.has(rule.channelId));
  if (invalidRule) {
    throw publicRequestError(
      "One of the Auto Mod link rules uses a missing channel or a channel from another server.",
      400,
      { linkChannelRules: "Refresh the dashboard and choose a text channel from the selected server." }
    );
  }
  const settings = await saveAutoModSettings({ guildId: res.locals.guildId, ...input });
  updateAutoModSettingsCache(settings);
  res.json(settings);
});

const verificationSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  verifiedRoleId: optionalId,
  action: z.enum(["allow", "flag", "deny", "assign_role"]).default("flag"),
  logChannelId: optionalId,
  minAccountAgeDays: z.coerce.number().int().min(0).max(3650).default(0),
  minServerDays: z.coerce.number().int().min(0).max(3650).default(0),
  vpnCheckEnabled: z.boolean().default(false),
  vpnFailClosed: z.boolean().default(false),
  recordRetentionHours: z.coerce.number().int().min(1).max(8760).default(168)
});

router.get("/verification", async (_req, res) => {
  const [settings, records] = await Promise.all([
    getVerificationSettings(res.locals.guildId),
    listVerificationRecords(res.locals.guildId)
  ]);
  res.json({
    settings,
    records,
    oauthConfigured: Boolean(config.DISCORD_CLIENT_SECRET),
    oauthRedirectConfigured: Boolean(config.DISCORD_OAUTH_REDIRECT_URI),
    vpnProviderConfigured: Boolean(config.VPN_CHECK_URL_TEMPLATE && config.VPN_CHECK_API_KEY),
    verifyPublicUrlConfigured: Boolean(config.VERIFY_PUBLIC_BASE_URL),
    publicUrlConfigured: Boolean(config.PUBLIC_BASE_URL),
    trustProxyEnabled: config.TRUST_PROXY === "true"
  });
});

router.put("/verification", async (req, res) => {
  const input = verificationSettingsSchema.parse(req.body);
  if (input.enabled && !config.DISCORD_CLIENT_SECRET) {
    throw publicRequestError(
      "Add DISCORD_CLIENT_SECRET and a redirect URI before enabling verification.",
      400,
      { enabled: "Discord OAuth is not configured on this dashboard." }
    );
  }
  if (input.vpnCheckEnabled && !(config.VPN_CHECK_URL_TEMPLATE && config.VPN_CHECK_API_KEY)) {
    throw publicRequestError(
      "Configure both VPN_CHECK_URL_TEMPLATE and VPN_CHECK_API_KEY before enabling VPN/proxy checks.",
      400,
      { vpnCheckEnabled: "The optional VPN/proxy provider is not configured." }
    );
  }
  res.json(await saveVerificationSettings({ guildId: res.locals.guildId, ...input }));
});

router.post("/verification/link", async (req, res) => {
  const settings = await getVerificationSettings(res.locals.guildId);
  if (!settings.enabled) throw publicRequestError("Enable verification before creating a link.");
  if (!config.DISCORD_CLIENT_SECRET) throw publicRequestError("Discord OAuth verification is not configured.", 503);
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 24 * 3_600_000).toISOString();
  await createVerificationLink(res.locals.guildId, hashVerificationToken(token), expiresAt);
  const baseUrl = (config.VERIFY_PUBLIC_BASE_URL ?? config.PUBLIC_BASE_URL ?? `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");
  res.status(201).json({
    url: `${baseUrl}/verify/${token}`,
    expiresAt
  });
});

const rolePanelSchema = z.object({
  name: z.string().min(1).max(100),
  channelId: optionalId,
  title: z.string().min(1).max(256),
  description: z.string().max(4000).default(""),
  color,
  active: z.boolean().default(true),
  roleIds: idArray.refine((roles) => roles.length > 0, "Choose at least one role.").refine((roles) => roles.length <= 25, "Role panels support up to 25 roles.")
});

async function getRolePanelSafetyIssue(guildId: string, roleIds: string[]): Promise<string | null> {
  const [roles, botMember] = await Promise.all([
    rest.get(Routes.guildRoles(guildId)) as Promise<Array<{
      id: string;
      name: string;
      managed: boolean;
      permissions: string;
      position: number;
    }>>,
    rest.get(Routes.guildMember(guildId, config.DISCORD_CLIENT_ID)) as Promise<{
      roles: string[];
    }>
  ]);
  const roleMap = new Map(roles.map((role) => [role.id, role]));
  const botHighestPosition = Math.max(
    0,
    ...botMember.roles.map((roleId) => roleMap.get(roleId)?.position ?? 0)
  );
  const dangerousBits = [
    PermissionFlagsBits.Administrator,
    PermissionFlagsBits.ManageGuild,
    PermissionFlagsBits.ManageRoles,
    PermissionFlagsBits.ManageChannels,
    PermissionFlagsBits.BanMembers,
    PermissionFlagsBits.KickMembers,
    PermissionFlagsBits.ManageWebhooks,
    PermissionFlagsBits.MentionEveryone
  ].reduce((bits, permission) => bits | permission, 0n);

  for (const roleId of roleIds) {
    const role = roleMap.get(roleId);
    if (!role) return `Role ${roleId} no longer exists. Refresh the page and choose another role.`;
    if (role.managed) return `${role.name} is managed by Discord or an integration and cannot be self-assigned.`;
    if ((BigInt(role.permissions) & dangerousBits) !== 0n) {
      return `${role.name} has administrative permissions and cannot be used in a self-service role panel.`;
    }
    if (role.position >= botHighestPosition) {
      return `${role.name} is at or above the bot's highest role. Move the bot role above it first.`;
    }
  }
  return null;
}

router.get("/role-panels", async (_req, res) => {
  res.json(await listRolePanels(res.locals.guildId));
});

router.post("/role-panels", async (req, res) => {
  const input = rolePanelSchema.parse(req.body);
  const safetyIssue = await getRolePanelSafetyIssue(res.locals.guildId, input.roleIds);
  if (safetyIssue) return res.status(400).json({ error: safetyIssue, fields: { roleIds: safetyIssue } });
  res.status(201).json(await createRolePanel({ guildId: res.locals.guildId, ...input }));
});

router.put("/role-panels/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid ID." });
  const input = rolePanelSchema.parse(req.body);
  const safetyIssue = await getRolePanelSafetyIssue(res.locals.guildId, input.roleIds);
  if (safetyIssue) return res.status(400).json({ error: safetyIssue, fields: { roleIds: safetyIssue } });
  const result = await updateRolePanel(id, res.locals.guildId, input);
  return result ? res.json(result) : res.status(404).json({ error: "Role panel not found." });
});

router.delete("/role-panels/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid ID." });
  return (await deleteRolePanel(id, res.locals.guildId))
    ? res.status(204).end()
    : res.status(404).json({ error: "Role panel not found." });
});

router.post("/role-panels/:id/post", async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid ID." });
    const panel = await getRolePanel(id, res.locals.guildId);
    if (!panel?.active) return res.status(404).json({ error: "Role panel not found or inactive." });
    const input = z.object({ channelId: optionalId }).parse(req.body);
    const channelId = input.channelId ?? panel.channelId;
    if (!channelId) return res.status(400).json({ error: "Choose a channel or save a default channel on the panel." });
    const roles = await rest.get(Routes.guildRoles(res.locals.guildId)) as Array<{ id: string; name: string }>;
    const roleMap = new Map(roles.map((role) => [role.id, role]));
    const selected = panel.roleIds.map((roleId) => roleMap.get(roleId)).filter(Boolean).slice(0, 25);
    if (!selected.length) return res.status(400).json({ error: "None of this panel's roles still exist." });
    const components = [];
    for (let index = 0; index < selected.length; index += 5) {
      components.push({
        type: 1,
        components: selected.slice(index, index + 5).map((role) => ({
          type: 2,
          style: 2,
          custom_id: `role-panel:toggle:${panel.id}:${role!.id}`,
          label: role!.name.slice(0, 80)
        }))
      });
    }
    await sendDiscordMessage(res.locals.guildId, channelId, {
      embeds: [{
        title: panel.title,
        description: panel.description || "Choose a role below.",
        color: Number.parseInt(panel.color.slice(1), 16)
      }],
      components
    });
    return res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

const stickySchema = z.object({
  channelId: z.string().regex(/^\d+$/, "Choose a channel."),
  content: z.string().min(1).max(2000),
  enabled: z.boolean().default(true),
  minIntervalSeconds: z.coerce.number().int().min(10).max(3600).default(30)
});

router.get("/sticky-messages", async (_req, res) => {
  res.json(await listStickyMessages(res.locals.guildId));
});

router.post("/sticky-messages", async (req, res) => {
  const input = stickySchema.parse(req.body);
  res.status(201).json(await createStickyMessage({ guildId: res.locals.guildId, ...input }));
});

router.put("/sticky-messages/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid ID." });
  const result = await updateStickyMessage(id, res.locals.guildId, stickySchema.parse(req.body));
  return result ? res.json(result) : res.status(404).json({ error: "Sticky message not found." });
});

router.delete("/sticky-messages/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid ID." });
  return (await deleteStickyMessage(id, res.locals.guildId))
    ? res.status(204).end()
    : res.status(404).json({ error: "Sticky message not found." });
});

router.post("/sticky-messages/:id/test", async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid ID." });
    const sticky = (await listStickyMessages(res.locals.guildId)).find((item) => item.id === id);
    if (!sticky) return res.status(404).json({ error: "Sticky message not found." });
    await sendDiscordMessage(res.locals.guildId, sticky.channelId, {
      content: `[Sticky preview]\n${sticky.content}`,
      allowed_mentions: { parse: [] }
    });
    return res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

const scheduledAnnouncementSchema = z.object({
  name: z.string().min(1).max(100),
  announcementTemplateId: z.coerce.number().int().positive(),
  channelId: z.string().regex(/^\d+$/, "Choose a channel."),
  pingType: z.enum(["none", "everyone", "here"]).default("none"),
  scheduleType: z.enum(["once", "repeat"]).default("once"),
  nextRunAt: z.string().datetime(),
  intervalMinutes: z.coerce.number().int().min(5).max(525600).nullable().default(null),
  enabled: z.boolean().default(true)
}).superRefine((value, context) => {
  if (value.scheduleType === "repeat" && !value.intervalMinutes) {
    context.addIssue({
      code: "custom",
      path: ["intervalMinutes"],
      message: "Enter a repeat interval of at least 5 minutes."
    });
  }
});

router.get("/scheduled-announcements", async (_req, res) => {
  res.json(await listScheduledAnnouncements(res.locals.guildId));
});

router.post("/scheduled-announcements", async (req, res) => {
  const input = scheduledAnnouncementSchema.parse(req.body);
  res.status(201).json(await createScheduledAnnouncement({ guildId: res.locals.guildId, ...input }));
});

router.put("/scheduled-announcements/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid ID." });
  const result = await updateScheduledAnnouncement(
    id,
    res.locals.guildId,
    scheduledAnnouncementSchema.parse(req.body)
  );
  return result ? res.json(result) : res.status(404).json({ error: "Scheduled announcement not found." });
});

router.delete("/scheduled-announcements/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid ID." });
  return (await deleteScheduledAnnouncement(id, res.locals.guildId))
    ? res.status(204).end()
    : res.status(404).json({ error: "Scheduled announcement not found." });
});

router.post("/scheduled-announcements/:id/test", async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid ID." });
    const schedule = await getScheduledAnnouncement(id, res.locals.guildId);
    if (!schedule) return res.status(404).json({ error: "Scheduled announcement not found." });
    const template = await getAnnouncement(schedule.announcementTemplateId, res.locals.guildId);
    if (!template) return res.status(400).json({ error: "The saved announcement template no longer exists." });
    const files: UploadFile[] = [];
    const plainContent = [template.title.trim(), template.body.trim(), template.footer.trim()]
      .filter(Boolean)
      .join("\n\n");
    const embed = template.outputMode === "embed"
      ? embedSchema.parse({
        ...emptyEmbedConfig(),
        title: template.title,
        description: template.body,
        color: template.color,
        imageUrl: template.imageUrl,
        thumbnailUrl: template.thumbnailUrl,
        footerText: template.footer
      })
      : null;
    await sendDiscordMessage(res.locals.guildId, schedule.channelId, {
      content: [
        "**Scheduled preview (pings disabled)**",
        template.outputMode === "plain" ? plainContent : ""
      ].filter(Boolean).join("\n\n"),
      embeds: embed ? [discordEmbed(embed, files)] : undefined,
      allowed_mentions: { parse: [] }
    }, files);
    return res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

export const dashboardApi = router;
