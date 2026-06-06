import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Router } from "express";
import { REST, Routes } from "discord.js";
import multer from "multer";
import { z } from "zod";
import {
  createAnnouncement,
  createCustomCommand,
  createTicketPanel,
  createTicketType,
  deleteAnnouncement,
  deleteCustomCommand,
  deleteTicketPanel,
  deleteTicketType,
  getAntiNukeSettings,
  getAntiRaidSettings,
  getBranding,
  getGuildSettings,
  getOverview,
  getTicketPanel,
  getWelcomeSettings,
  listAnnouncements,
  listCustomCommands,
  listModerationActions,
  listRecentTickets,
  listTicketPanels,
  listTicketTypes,
  listWarnings,
  saveAntiNukeSettings,
  saveAntiRaidSettings,
  saveBranding,
  saveGuildSettings,
  saveWelcomeSettings,
  updateAnnouncement,
  updateCustomCommand,
  updateTicketPanel,
  updateTicketType
} from "../database/index.js";
import { loadDashboardConfig, resolveUploadsPath } from "../shared/config.js";
import { emptyActionConfig, emptyEmbedConfig } from "../shared/types.js";
import { isValidCommandName, normalizeCommandName } from "../shared/validation.js";

const config = loadDashboardConfig();
const router = Router();
const rest = new REST({ version: "10" }).setToken(config.DISCORD_TOKEN);
const loginAttempts = new Map<string, { count: number; blockedUntil: number }>();
const uploadsPath = resolveUploadsPath(config.UPLOADS_DIR);
fs.mkdirSync(uploadsPath, { recursive: true });
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
  serverName: z.string().min(1).max(100),
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
  newCategoryId: optionalId
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
  if (["timeout_user", "kick_user", "ban_user", "unban_user", "purge_messages", "add_user_to_channel", "remove_user_from_channel"].includes(value.actionType) && !value.actionConfig.targetUserId) {
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
});

const ticketTypeSchema = z.object({
  label: z.string().min(1).max(100),
  description: z.string().max(100),
  emoji: z.string().max(64),
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
  title: z.string().min(1).max(256),
  body: z.string().min(1).max(4000),
  color,
  imageUrl: urlOrEmpty,
  thumbnailUrl: urlOrEmpty,
  footer: z.string().max(200),
  targetChannelId: optionalId,
  pingType: z.enum(["none", "everyone", "here"]).default("none")
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

async function sendDiscordMessage(channelId: string, body: Record<string, unknown>, files: UploadFile[] = []): Promise<void> {
  await rest.post(Routes.channelMessages(channelId), {
    body,
    files
  });
}

router.get("/session", (req, res) => {
  res.json({
    authenticated: Boolean(req.session.authenticated),
    guildId: req.session.authenticated ? config.DISCORD_GUILD_ID : undefined
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
    res.json({ ok: true });
  });
});

router.post("/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.use((req, res, next) => {
  if (!req.session.authenticated) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }
  next();
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

router.get("/discord/resources", async (_req, res, next) => {
  try {
    const [guild, channels, roles] = await Promise.all([
      rest.get(Routes.guild(config.DISCORD_GUILD_ID)),
      rest.get(Routes.guildChannels(config.DISCORD_GUILD_ID)),
      rest.get(Routes.guildRoles(config.DISCORD_GUILD_ID))
    ]);
    const guildData = guild as { id: string; name: string; icon?: string | null };
    const channelData = channels as Array<{ id: string; name: string; type: number; parent_id?: string | null }>;
    const roleData = roles as Array<{ id: string; name: string; color: number; position: number; managed: boolean }>;
    res.json({
      guild: guildData,
      channels: channelData
        .filter((channel) => [0, 2, 4, 5, 13, 15, 16].includes(channel.type))
        .sort((a, b) => a.type - b.type || a.name.localeCompare(b.name)),
      roles: roleData
        .filter((role) => role.id !== config.DISCORD_GUILD_ID && !role.managed)
        .sort((a, b) => b.position - a.position)
    });
  } catch (error) {
    next(error);
  }
});

router.get("/overview", async (_req, res) => {
  res.json(await getOverview(config.DISCORD_GUILD_ID));
});

router.get("/settings", async (_req, res) => {
  res.json(await getGuildSettings(config.DISCORD_GUILD_ID));
});

router.put("/settings", async (req, res) => {
  const input = settingsSchema.parse(req.body);
  res.json(await saveGuildSettings({ guildId: config.DISCORD_GUILD_ID, ...input }));
});

router.get("/branding", async (_req, res) => {
  res.json(await getBranding(config.DISCORD_GUILD_ID));
});

router.put("/branding", async (req, res) => {
  const input = brandingSchema.parse(req.body);
  res.json(await saveBranding({ guildId: config.DISCORD_GUILD_ID, ...input }));
});

router.get("/custom-commands", async (_req, res) => {
  res.json(await listCustomCommands(config.DISCORD_GUILD_ID));
});

router.post("/custom-commands", async (req, res) => {
  const input = customCommandSchema.parse(req.body);
  res.status(201).json(await createCustomCommand({
    guildId: config.DISCORD_GUILD_ID,
    ...input,
    createdByUserId: "local-dashboard",
    updatedByUserId: "local-dashboard"
  }));
});

router.put("/custom-commands/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid ID." });
  const input = customCommandSchema.parse(req.body);
  const result = await updateCustomCommand(id, config.DISCORD_GUILD_ID, {
    ...input,
    updatedByUserId: "local-dashboard"
  });
  return result ? res.json(result) : res.status(404).json({ error: "Custom command not found." });
});

router.delete("/custom-commands/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid ID." });
  return (await deleteCustomCommand(id, config.DISCORD_GUILD_ID))
    ? res.status(204).end()
    : res.status(404).json({ error: "Custom command not found." });
});

router.get("/ticket-types", async (_req, res) => {
  res.json(await listTicketTypes(config.DISCORD_GUILD_ID));
});

router.get("/ticket-panels", async (_req, res) => {
  res.json(await listTicketPanels(config.DISCORD_GUILD_ID));
});

router.post("/ticket-panels", async (req, res) => {
  const input = ticketPanelSchema.parse(req.body);
  res.status(201).json(await createTicketPanel({ guildId: config.DISCORD_GUILD_ID, ...input }));
});

router.put("/ticket-panels/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid ID." });
  const result = await updateTicketPanel(id, config.DISCORD_GUILD_ID, ticketPanelSchema.parse(req.body));
  return result ? res.json(result) : res.status(404).json({ error: "Ticket panel not found." });
});

router.delete("/ticket-panels/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid ID." });
  return (await deleteTicketPanel(id, config.DISCORD_GUILD_ID))
    ? res.status(204).end()
    : res.status(404).json({ error: "Ticket panel not found." });
});

router.post("/ticket-types", async (req, res) => {
  const input = ticketTypeSchema.parse(req.body);
  res.status(201).json(await createTicketType({ guildId: config.DISCORD_GUILD_ID, ...input }));
});

router.put("/ticket-types/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid ID." });
  const result = await updateTicketType(id, config.DISCORD_GUILD_ID, ticketTypeSchema.parse(req.body));
  return result ? res.json(result) : res.status(404).json({ error: "Ticket type not found." });
});

router.delete("/ticket-types/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid ID." });
  return (await deleteTicketType(id, config.DISCORD_GUILD_ID))
    ? res.status(204).end()
    : res.status(404).json({ error: "Ticket type not found." });
});

router.get("/tickets", async (_req, res) => {
  res.json(await listRecentTickets(config.DISCORD_GUILD_ID));
});

router.get("/announcements", async (_req, res) => {
  res.json(await listAnnouncements(config.DISCORD_GUILD_ID));
});

router.post("/announcements", async (req, res) => {
  const input = announcementSchema.parse(req.body);
  res.status(201).json(await createAnnouncement({ guildId: config.DISCORD_GUILD_ID, ...input }));
});

router.put("/announcements/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid ID." });
  const result = await updateAnnouncement(id, config.DISCORD_GUILD_ID, announcementSchema.parse(req.body));
  return result ? res.json(result) : res.status(404).json({ error: "Announcement not found." });
});

router.delete("/announcements/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid ID." });
  return (await deleteAnnouncement(id, config.DISCORD_GUILD_ID))
    ? res.status(204).end()
    : res.status(404).json({ error: "Announcement not found." });
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
    await sendDiscordMessage(input.channelId, {
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
    const panel = await getTicketPanel(input.panelId, config.DISCORD_GUILD_ID);
    if (!panel) {
      res.status(404).json({ error: "Ticket panel not found." });
      return;
    }
    const channelId = input.channelId ?? panel.targetChannelId;
    if (!channelId) {
      res.status(400).json({ error: "Choose a test channel or configure the panel target channel." });
      return;
    }
    const files: UploadFile[] = [];
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
        .map((id) => getTicketPanel(id, config.DISCORD_GUILD_ID))))
        .filter((item) => Boolean(item))
        .slice(0, 25);
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
      const typeMap = new Map((await listTicketTypes(config.DISCORD_GUILD_ID)).map((type) => [type.id, type]));
      const types = panel.ticketTypeIds.map((id) => typeMap.get(id)).filter(Boolean).slice(0, 25);
      if (panel.displayMode === "buttons") {
        for (let index = 0; index < types.length; index += 5) {
          components.push({
            type: 1,
            components: types.slice(index, index + 5).map((type) => ({
              type: 2,
              style: 2,
              custom_id: `ticket:create-button:${panel.id}:${type!.id}`,
              label: type!.label,
              emoji: type!.emoji ? { name: type!.emoji } : undefined
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
              emoji: type!.emoji ? { name: type!.emoji } : undefined
            }))
          }]
        });
      }
    }
    await sendDiscordMessage(channelId, {
      embeds: [discordEmbed(embedInput, files)],
      components
    }, files);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.get("/moderation", async (_req, res) => {
  const [warnings, actions] = await Promise.all([
    listWarnings(config.DISCORD_GUILD_ID, undefined, 100),
    listModerationActions(config.DISCORD_GUILD_ID, 100)
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
  autoRoleIds: idArray
});

router.get("/welcome", async (_req, res) => {
  res.json(await getWelcomeSettings(config.DISCORD_GUILD_ID));
});

router.put("/welcome", async (req, res) => {
  const input = welcomeSchema.parse(req.body);
  res.json(await saveWelcomeSettings({ guildId: config.DISCORD_GUILD_ID, ...input }));
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
  res.json(await getAntiRaidSettings(config.DISCORD_GUILD_ID));
});

router.put("/anti-raid", async (req, res) => {
  const input = antiRaidSchema.parse(req.body);
  res.json(await saveAntiRaidSettings({ guildId: config.DISCORD_GUILD_ID, ...input }));
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
  res.json(await getAntiNukeSettings(config.DISCORD_GUILD_ID));
});

router.put("/anti-nuke", async (req, res) => {
  const input = antiNukeSchema.parse(req.body);
  res.json(await saveAntiNukeSettings({ guildId: config.DISCORD_GUILD_ID, ...input }));
});

export const dashboardApi = router;
