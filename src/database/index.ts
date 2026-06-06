import type {
  ActionSequenceItem,
  AnnouncementTemplate,
  AntiNukeSettings,
  AntiNukeTrusted,
  AntiRaidSettings,
  Branding,
  CustomCommand,
  CustomCommandActionConfig,
  GuildSettings,
  TicketCloseRequest,
  TicketPanel,
  TicketType,
  WelcomeSettings
} from "../shared/types.js";
import { emptyActionConfig } from "../shared/types.js";
import { normalizeCommandName } from "../shared/validation.js";
import { db } from "./adapter.js";
import { postgresMigrations } from "./schema-postgres.js";
import { migrations as sqliteMigrations } from "./schema.js";

export { db };

export async function migrateDatabase(): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at ${db.dialect === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  const applied = await db.all<{ version: number }>("SELECT version FROM schema_migrations");
  const versions = new Set(applied.map((row) => Number(row.version)));
  const migrations = db.dialect === "postgres" ? postgresMigrations : sqliteMigrations;

  for (const migration of migrations) {
    if (versions.has(migration.version)) continue;
    await db.transaction(async () => {
      await db.exec(migration.sql);
      await db.run("INSERT INTO schema_migrations (version) VALUES (?)", [migration.version]);
    });
  }
}

await migrateDatabase();

function parseJsonArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function parseJsonObject<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? { ...fallback, ...parsed } : fallback;
  } catch {
    return fallback;
  }
}

async function ensureGuildRows(guildId: string): Promise<void> {
  await db.run("INSERT INTO guild_settings (guild_id) VALUES (?) ON CONFLICT (guild_id) DO NOTHING", [guildId]);
  await db.run("INSERT INTO branding (guild_id) VALUES (?) ON CONFLICT (guild_id) DO NOTHING", [guildId]);
  await db.run("INSERT INTO welcome_settings (guild_id) VALUES (?) ON CONFLICT (guild_id) DO NOTHING", [guildId]);
  await db.run("INSERT INTO anti_raid_settings (guild_id) VALUES (?) ON CONFLICT (guild_id) DO NOTHING", [guildId]);
  await db.run("INSERT INTO anti_nuke_settings (guild_id) VALUES (?) ON CONFLICT (guild_id) DO NOTHING", [guildId]);
}

export async function getGuildSettings(guildId: string): Promise<GuildSettings> {
  await ensureGuildRows(guildId);
  const row = (await db.get<Record<string, unknown>>("SELECT * FROM guild_settings WHERE guild_id = ?", [guildId]))!;
  return {
    guildId,
    modLogChannelId: row.mod_log_channel_id as string | null,
    announcementChannelId: row.announcement_channel_id as string | null,
    ticketCategoryId: row.ticket_category_id as string | null,
    transcriptChannelId: row.transcript_channel_id as string | null,
    staffRoleIds: parseJsonArray(row.staff_role_ids as string),
    mutedRoleId: row.muted_role_id as string | null,
    adminRoleIds: parseJsonArray(row.admin_role_ids as string)
  };
}

export async function saveGuildSettings(settings: GuildSettings): Promise<GuildSettings> {
  await ensureGuildRows(settings.guildId);
  await db.run(`
    UPDATE guild_settings SET
      mod_log_channel_id = @modLogChannelId,
      announcement_channel_id = @announcementChannelId,
      ticket_category_id = @ticketCategoryId,
      transcript_channel_id = @transcriptChannelId,
      staff_role_ids = @staffRoleIds,
      muted_role_id = @mutedRoleId,
      admin_role_ids = @adminRoleIds,
      updated_at = CURRENT_TIMESTAMP
    WHERE guild_id = @guildId
  `, {
    ...settings,
    staffRoleIds: JSON.stringify(settings.staffRoleIds),
    adminRoleIds: JSON.stringify(settings.adminRoleIds)
  });
  return getGuildSettings(settings.guildId);
}

export async function getBranding(guildId: string): Promise<Branding> {
  await ensureGuildRows(guildId);
  const row = (await db.get<Record<string, unknown>>("SELECT * FROM branding WHERE guild_id = ?", [guildId]))!;
  return {
    guildId,
    serverName: row.server_name as string,
    footerText: row.footer_text as string,
    ticketPanelTitle: row.ticket_panel_title as string,
    ticketPanelDescription: row.ticket_panel_description as string,
    ticketPanelColor: row.ticket_panel_color as string,
    ticketPanelImageUrl: row.ticket_panel_image_url as string,
    announcementDefaultColor: row.announcement_default_color as string,
    announcementDefaultImageUrl: row.announcement_default_image_url as string,
    announcementDefaultThumbnailUrl: row.announcement_default_thumbnail_url as string,
    embedIconUrl: row.embed_icon_url as string
  };
}

export async function saveBranding(branding: Branding): Promise<Branding> {
  await ensureGuildRows(branding.guildId);
  await db.run(`
    UPDATE branding SET
      server_name = @serverName, footer_text = @footerText,
      ticket_panel_title = @ticketPanelTitle,
      ticket_panel_description = @ticketPanelDescription,
      ticket_panel_color = @ticketPanelColor,
      ticket_panel_image_url = @ticketPanelImageUrl,
      announcement_default_color = @announcementDefaultColor,
      announcement_default_image_url = @announcementDefaultImageUrl,
      announcement_default_thumbnail_url = @announcementDefaultThumbnailUrl,
      embed_icon_url = @embedIconUrl, updated_at = CURRENT_TIMESTAMP
    WHERE guild_id = @guildId
  `, { ...branding });
  return getBranding(branding.guildId);
}

function mapCustomCommand(row: Record<string, unknown>): CustomCommand {
  const actionConfig = parseJsonObject<CustomCommandActionConfig>(row.action_config as string | null, emptyActionConfig());
  actionConfig.embed = {
    ...emptyActionConfig().embed,
    ...(actionConfig.embed ?? {}),
    fields: Array.isArray(actionConfig.embed?.fields) ? actionConfig.embed.fields : []
  };
  actionConfig.roleIds = parseJsonArray(row.role_ids as string | null);
  actionConfig.actionSequence = parseJsonObject<{ items: ActionSequenceItem[] }>(row.action_sequence as string | null, { items: [] }).items;
  if (!actionConfig.content && row.response) actionConfig.content = row.response as string;
  return {
    id: Number(row.id),
    guildId: row.guild_id as string,
    name: row.name as string,
    description: (row.description as string) ?? "",
    enabled: row.enabled === undefined ? true : Boolean(row.enabled),
    actionType: (row.action_type as CustomCommand["actionType"]) ?? "reply_message",
    accessMode: (row.access_mode as CustomCommand["accessMode"]) ?? "everyone",
    allowedRoleIds: parseJsonArray(row.allowed_role_ids as string | null),
    blockedRoleIds: parseJsonArray(row.blocked_role_ids as string | null),
    allowedChannelIds: parseJsonArray(row.allowed_channel_ids as string | null),
    blockedChannelIds: parseJsonArray(row.blocked_channel_ids as string | null),
    cooldownType: (row.cooldown_type as CustomCommand["cooldownType"]) ?? "none",
    cooldownSeconds: Number(row.cooldown_seconds ?? 0),
    replyVisibility: (row.reply_visibility as CustomCommand["replyVisibility"]) ?? (row.ephemeral ? "private" : "public"),
    deleteUsage: Boolean(row.delete_usage),
    actionConfig,
    createdByUserId: (row.created_by_user_id as string) ?? "local-dashboard",
    updatedByUserId: (row.updated_by_user_id as string) ?? "local-dashboard",
    response: row.response as string,
    ephemeral: Boolean(row.ephemeral),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

export async function listCustomCommands(guildId: string): Promise<CustomCommand[]> {
  return (await db.all<Record<string, unknown>>("SELECT * FROM custom_commands WHERE guild_id = ? ORDER BY name", [guildId])).map(mapCustomCommand);
}

export async function getCustomCommand(guildId: string, name: string): Promise<CustomCommand | null> {
  const row = await db.get<Record<string, unknown>>(
    "SELECT * FROM custom_commands WHERE guild_id = ? AND name = ?",
    [guildId, normalizeCommandName(name)]
  );
  return row ? mapCustomCommand(row) : null;
}

export type CustomCommandWrite = Omit<CustomCommand, "id" | "createdAt" | "updatedAt" | "response" | "ephemeral">;

function commandParams(input: CustomCommandWrite | Omit<CustomCommandWrite, "guildId" | "createdByUserId">) {
  return {
    ...input,
    name: normalizeCommandName(input.name),
    enabled: Number(input.enabled),
    allowedRoleIds: JSON.stringify(input.allowedRoleIds),
    blockedRoleIds: JSON.stringify(input.blockedRoleIds),
    allowedChannelIds: JSON.stringify(input.allowedChannelIds),
    blockedChannelIds: JSON.stringify(input.blockedChannelIds),
    deleteUsage: Number(input.deleteUsage),
    actionConfig: JSON.stringify(input.actionConfig),
    actionSequence: JSON.stringify({ items: input.actionConfig.actionSequence ?? [] }),
    roleIds: JSON.stringify(input.actionConfig.roleIds ?? []),
    response: input.actionConfig.content || input.actionConfig.embed.description || "",
    ephemeral: Number(input.replyVisibility === "private")
  };
}

export async function createCustomCommand(input: CustomCommandWrite): Promise<CustomCommand> {
  const row = await db.get<Record<string, unknown>>(`
    INSERT INTO custom_commands (
      guild_id, name, description, enabled, action_type, access_mode,
      allowed_role_ids, blocked_role_ids, allowed_channel_ids, blocked_channel_ids,
      cooldown_type, cooldown_seconds, reply_visibility, delete_usage, action_config,
      created_by_user_id, updated_by_user_id, response, ephemeral
    ) VALUES (
      @guildId, @name, @description, @enabled, @actionType, @accessMode,
      @allowedRoleIds, @blockedRoleIds, @allowedChannelIds, @blockedChannelIds,
      @cooldownType, @cooldownSeconds, @replyVisibility, @deleteUsage, @actionConfig,
      @createdByUserId, @updatedByUserId, @response, @ephemeral
    ) RETURNING *
  `, commandParams(input));
  return mapCustomCommand(row!);
}

export async function updateCustomCommand(
  id: number,
  guildId: string,
  input: Omit<CustomCommandWrite, "guildId" | "createdByUserId">
): Promise<CustomCommand | null> {
  const row = await db.get<Record<string, unknown>>(`
    UPDATE custom_commands SET
      name = @name, description = @description, enabled = @enabled,
      action_type = @actionType, access_mode = @accessMode,
      allowed_role_ids = @allowedRoleIds, blocked_role_ids = @blockedRoleIds,
      allowed_channel_ids = @allowedChannelIds, blocked_channel_ids = @blockedChannelIds,
      cooldown_type = @cooldownType, cooldown_seconds = @cooldownSeconds,
      reply_visibility = @replyVisibility, delete_usage = @deleteUsage,
      action_config = @actionConfig, updated_by_user_id = @updatedByUserId,
      response = @response, ephemeral = @ephemeral, updated_at = CURRENT_TIMESTAMP
    WHERE id = @id AND guild_id = @guildId RETURNING *
  `, { ...commandParams(input), id, guildId });
  return row ? mapCustomCommand(row) : null;
}

export async function deleteCustomCommand(id: number, guildId: string): Promise<boolean> {
  return (await db.run("DELETE FROM custom_commands WHERE id = ? AND guild_id = ?", [id, guildId])).changes > 0;
}

function mapTicketType(row: Record<string, unknown>): TicketType {
  return {
    id: Number(row.id),
    guildId: row.guild_id as string,
    label: row.label as string,
    description: row.description as string,
    emoji: row.emoji as string,
    staffRoleIds: parseJsonArray(row.staff_role_ids as string),
    pingRoleIds: parseJsonArray(row.ping_role_ids as string | null),
    allowedRoleIds: parseJsonArray(row.allowed_role_ids as string | null),
    blockedRoleIds: parseJsonArray(row.blocked_role_ids as string | null),
    categoryId: row.category_id as string | null,
    welcomeMessage: row.welcome_message as string,
    color: row.color as string,
    imageUrl: row.image_url as string,
    thumbnailUrl: (row.thumbnail_url as string) ?? "",
    footerText: (row.footer_text as string) ?? "",
    footerIconUrl: (row.footer_icon_url as string) ?? "",
    transcriptChannelId: (row.transcript_channel_id as string | null) ?? null,
    maxOpenTickets: Number(row.max_open_tickets ?? 1),
    namingFormat: (row.naming_format as string) ?? "ticket-{username}",
    claimButtonEnabled: row.claim_button_enabled === undefined ? true : Boolean(row.claim_button_enabled),
    closeButtonEnabled: row.close_button_enabled === undefined ? true : Boolean(row.close_button_enabled),
    closeReasonRequired: Boolean(row.close_reason_required),
    requestCloseEnabled: Boolean(row.request_close_enabled),
    closeRequestDelaySeconds: Number(row.close_request_delay_seconds ?? 0),
    autoCloseHours: Number(row.auto_close_hours ?? 0),
    active: Boolean(row.active),
    sortOrder: Number(row.sort_order)
  };
}

export async function listTicketTypes(guildId: string, activeOnly = false): Promise<TicketType[]> {
  const sql = `SELECT * FROM ticket_types WHERE guild_id = ?${activeOnly ? " AND active = 1" : ""} ORDER BY sort_order, id`;
  return (await db.all<Record<string, unknown>>(sql, [guildId])).map(mapTicketType);
}

export async function getTicketType(id: number, guildId: string): Promise<TicketType | null> {
  const row = await db.get<Record<string, unknown>>("SELECT * FROM ticket_types WHERE id = ? AND guild_id = ?", [id, guildId]);
  return row ? mapTicketType(row) : null;
}

function ticketTypeParams(input: Omit<TicketType, "id"> | Omit<TicketType, "id" | "guildId">) {
  return {
    ...input,
    staffRoleIds: JSON.stringify(input.staffRoleIds),
    pingRoleIds: JSON.stringify(input.pingRoleIds),
    allowedRoleIds: JSON.stringify(input.allowedRoleIds),
    blockedRoleIds: JSON.stringify(input.blockedRoleIds),
    claimButtonEnabled: Number(input.claimButtonEnabled),
    closeButtonEnabled: Number(input.closeButtonEnabled),
    closeReasonRequired: Number(input.closeReasonRequired),
    requestCloseEnabled: Number(input.requestCloseEnabled),
    closeRequestDelaySeconds: input.closeRequestDelaySeconds,
    active: Number(input.active)
  };
}

export async function createTicketType(input: Omit<TicketType, "id">): Promise<TicketType> {
  const row = await db.get<Record<string, unknown>>(`
    INSERT INTO ticket_types (
      guild_id, label, description, emoji, staff_role_ids, ping_role_ids,
      allowed_role_ids, blocked_role_ids, category_id, welcome_message, color,
      image_url, thumbnail_url, footer_text, footer_icon_url, transcript_channel_id,
      max_open_tickets, naming_format, claim_button_enabled, close_button_enabled,
      close_reason_required, request_close_enabled, close_request_delay_seconds,
      auto_close_hours, active, sort_order
    ) VALUES (
      @guildId, @label, @description, @emoji, @staffRoleIds, @pingRoleIds,
      @allowedRoleIds, @blockedRoleIds, @categoryId, @welcomeMessage, @color,
      @imageUrl, @thumbnailUrl, @footerText, @footerIconUrl, @transcriptChannelId,
      @maxOpenTickets, @namingFormat, @claimButtonEnabled, @closeButtonEnabled,
      @closeReasonRequired, @requestCloseEnabled, @closeRequestDelaySeconds,
      @autoCloseHours, @active, @sortOrder
    ) RETURNING *
  `, ticketTypeParams(input));
  return mapTicketType(row!);
}

export async function updateTicketType(
  id: number,
  guildId: string,
  input: Omit<TicketType, "id" | "guildId">
): Promise<TicketType | null> {
  const row = await db.get<Record<string, unknown>>(`
    UPDATE ticket_types SET
      label = @label, description = @description, emoji = @emoji,
      staff_role_ids = @staffRoleIds, ping_role_ids = @pingRoleIds,
      allowed_role_ids = @allowedRoleIds, blocked_role_ids = @blockedRoleIds,
      category_id = @categoryId, welcome_message = @welcomeMessage, color = @color,
      image_url = @imageUrl, thumbnail_url = @thumbnailUrl, footer_text = @footerText,
      footer_icon_url = @footerIconUrl, transcript_channel_id = @transcriptChannelId,
      max_open_tickets = @maxOpenTickets, naming_format = @namingFormat,
      claim_button_enabled = @claimButtonEnabled, close_button_enabled = @closeButtonEnabled,
      close_reason_required = @closeReasonRequired, request_close_enabled = @requestCloseEnabled,
      close_request_delay_seconds = @closeRequestDelaySeconds, auto_close_hours = @autoCloseHours,
      active = @active, sort_order = @sortOrder
    WHERE id = @id AND guild_id = @guildId RETURNING *
  `, { ...ticketTypeParams(input), id, guildId });
  return row ? mapTicketType(row) : null;
}

export async function deleteTicketType(id: number, guildId: string): Promise<boolean> {
  return (await db.run("DELETE FROM ticket_types WHERE id = ? AND guild_id = ?", [id, guildId])).changes > 0;
}

async function getPanelRelations(panelId: number) {
  const [types, children] = await Promise.all([
    db.all<{ id: number }>("SELECT ticket_type_id AS id FROM ticket_panel_types WHERE panel_id = ? ORDER BY sort_order, ticket_type_id", [panelId]),
    db.all<{ id: number }>("SELECT child_panel_id AS id FROM ticket_panel_children WHERE parent_panel_id = ? ORDER BY sort_order, child_panel_id", [panelId])
  ]);
  return {
    ticketTypeIds: types.map((row) => Number(row.id)),
    childPanelIds: children.map((row) => Number(row.id))
  };
}

async function mapTicketPanel(row: Record<string, unknown>): Promise<TicketPanel> {
  return {
    id: Number(row.id),
    guildId: row.guild_id as string,
    name: row.name as string,
    targetChannelId: row.target_channel_id as string | null,
    title: row.title as string,
    description: row.description as string,
    color: row.color as string,
    imageUrl: row.image_url as string,
    thumbnailUrl: row.thumbnail_url as string,
    footerText: row.footer_text as string,
    footerIconUrl: row.footer_icon_url as string,
    displayMode: row.display_mode as TicketPanel["displayMode"],
    dropdownPlaceholder: row.dropdown_placeholder as string,
    active: Boolean(row.active),
    panelKind: row.panel_kind as TicketPanel["panelKind"],
    ...(await getPanelRelations(Number(row.id))),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

export async function listTicketPanels(guildId: string, activeOnly = false): Promise<TicketPanel[]> {
  const sql = `SELECT * FROM ticket_panels WHERE guild_id = ?${activeOnly ? " AND active = 1" : ""} ORDER BY name`;
  return Promise.all((await db.all<Record<string, unknown>>(sql, [guildId])).map(mapTicketPanel));
}

export async function getTicketPanel(id: number, guildId: string): Promise<TicketPanel | null> {
  const row = await db.get<Record<string, unknown>>("SELECT * FROM ticket_panels WHERE id = ? AND guild_id = ?", [id, guildId]);
  return row ? mapTicketPanel(row) : null;
}

async function savePanelRelations(panelId: number, ticketTypeIds: number[], childPanelIds: number[]): Promise<void> {
  await db.run("DELETE FROM ticket_panel_types WHERE panel_id = ?", [panelId]);
  await db.run("DELETE FROM ticket_panel_children WHERE parent_panel_id = ?", [panelId]);
  for (const [index, typeId] of ticketTypeIds.entries()) {
    await db.run("INSERT INTO ticket_panel_types (panel_id, ticket_type_id, sort_order) VALUES (?, ?, ?)", [panelId, typeId, index]);
  }
  for (const [index, childId] of childPanelIds.filter((value) => value !== panelId).entries()) {
    await db.run("INSERT INTO ticket_panel_children (parent_panel_id, child_panel_id, sort_order) VALUES (?, ?, ?)", [panelId, childId, index]);
  }
}

export async function createTicketPanel(input: Omit<TicketPanel, "id" | "createdAt" | "updatedAt">): Promise<TicketPanel> {
  const id = await db.transaction(async () => {
    const row = await db.get<{ id: number }>(`
      INSERT INTO ticket_panels (
        guild_id, name, target_channel_id, title, description, color, image_url,
        thumbnail_url, footer_text, footer_icon_url, display_mode,
        dropdown_placeholder, active, panel_kind
      ) VALUES (
        @guildId, @name, @targetChannelId, @title, @description, @color, @imageUrl,
        @thumbnailUrl, @footerText, @footerIconUrl, @displayMode,
        @dropdownPlaceholder, @active, @panelKind
      ) RETURNING id
    `, { ...input, active: Number(input.active) });
    const panelId = Number(row!.id);
    await savePanelRelations(panelId, input.ticketTypeIds, input.childPanelIds);
    return panelId;
  });
  return (await getTicketPanel(id, input.guildId))!;
}

export async function updateTicketPanel(
  id: number,
  guildId: string,
  input: Omit<TicketPanel, "id" | "guildId" | "createdAt" | "updatedAt">
): Promise<TicketPanel | null> {
  const updated = await db.transaction(async () => {
    const result = await db.run(`
      UPDATE ticket_panels SET
        name = @name, target_channel_id = @targetChannelId, title = @title,
        description = @description, color = @color, image_url = @imageUrl,
        thumbnail_url = @thumbnailUrl, footer_text = @footerText,
        footer_icon_url = @footerIconUrl, display_mode = @displayMode,
        dropdown_placeholder = @dropdownPlaceholder, active = @active,
        panel_kind = @panelKind, updated_at = CURRENT_TIMESTAMP
      WHERE id = @id AND guild_id = @guildId
    `, { ...input, id, guildId, active: Number(input.active) });
    if (!result.changes) return false;
    await savePanelRelations(id, input.ticketTypeIds, input.childPanelIds);
    return true;
  });
  return updated ? getTicketPanel(id, guildId) : null;
}

export async function deleteTicketPanel(id: number, guildId: string): Promise<boolean> {
  return (await db.run("DELETE FROM ticket_panels WHERE id = ? AND guild_id = ?", [id, guildId])).changes > 0;
}

function mapAnnouncement(row: Record<string, unknown>): AnnouncementTemplate {
  return {
    id: Number(row.id),
    guildId: row.guild_id as string,
    name: row.name as string,
    title: row.title as string,
    body: row.body as string,
    color: row.color as string,
    imageUrl: row.image_url as string,
    thumbnailUrl: row.thumbnail_url as string,
    footer: row.footer as string,
    targetChannelId: row.target_channel_id as string | null,
    pingType: (row.ping_type as AnnouncementTemplate["pingType"]) ?? "none",
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

export async function listAnnouncements(guildId: string): Promise<AnnouncementTemplate[]> {
  return (await db.all<Record<string, unknown>>("SELECT * FROM announcement_templates WHERE guild_id = ? ORDER BY name", [guildId])).map(mapAnnouncement);
}

export async function getAnnouncement(id: number, guildId: string): Promise<AnnouncementTemplate | null> {
  const row = await db.get<Record<string, unknown>>("SELECT * FROM announcement_templates WHERE id = ? AND guild_id = ?", [id, guildId]);
  return row ? mapAnnouncement(row) : null;
}

export async function createAnnouncement(
  input: Omit<AnnouncementTemplate, "id" | "createdAt" | "updatedAt">
): Promise<AnnouncementTemplate> {
  const row = await db.get<Record<string, unknown>>(`
    INSERT INTO announcement_templates (
      guild_id, name, title, body, color, image_url, thumbnail_url, footer, target_channel_id, ping_type
    ) VALUES (
      @guildId, @name, @title, @body, @color, @imageUrl, @thumbnailUrl, @footer, @targetChannelId, @pingType
    ) RETURNING *
  `, input);
  return mapAnnouncement(row!);
}

export async function updateAnnouncement(
  id: number,
  guildId: string,
  input: Omit<AnnouncementTemplate, "id" | "guildId" | "createdAt" | "updatedAt">
): Promise<AnnouncementTemplate | null> {
  const row = await db.get<Record<string, unknown>>(`
    UPDATE announcement_templates SET
      name = @name, title = @title, body = @body, color = @color,
      image_url = @imageUrl, thumbnail_url = @thumbnailUrl, footer = @footer,
      target_channel_id = @targetChannelId, ping_type = @pingType, updated_at = CURRENT_TIMESTAMP
    WHERE id = @id AND guild_id = @guildId RETURNING *
  `, { ...input, id, guildId });
  return row ? mapAnnouncement(row) : null;
}

export async function deleteAnnouncement(id: number, guildId: string): Promise<boolean> {
  return (await db.run("DELETE FROM announcement_templates WHERE id = ? AND guild_id = ?", [id, guildId])).changes > 0;
}

export async function getOverview(guildId: string) {
  const count = async (table: string) => Number((await db.get<{ count: number }>(`SELECT COUNT(*) AS count FROM ${table} WHERE guild_id = ?`, [guildId]))!.count);
  const [customCommands, ticketTypes, ticketPanels, openTickets, announcements, warnings] = await Promise.all([
    count("custom_commands"),
    count("ticket_types"),
    count("ticket_panels"),
    db.get<{ count: number }>("SELECT COUNT(*) AS count FROM tickets WHERE guild_id = ? AND status = 'open'", [guildId]).then((row) => Number(row!.count)),
    count("announcement_templates"),
    count("warnings")
  ]);
  return { customCommands, ticketTypes, ticketPanels, openTickets, announcements, warnings };
}

export async function countOpenTicketsForUser(guildId: string, userId: string, ticketTypeId?: number): Promise<number> {
  const row = ticketTypeId
    ? await db.get<{ count: number }>("SELECT COUNT(*) AS count FROM tickets WHERE guild_id = ? AND user_id = ? AND ticket_type_id = ? AND status = 'open'", [guildId, userId, ticketTypeId])
    : await db.get<{ count: number }>("SELECT COUNT(*) AS count FROM tickets WHERE guild_id = ? AND user_id = ? AND status = 'open'", [guildId, userId]);
  return Number(row!.count);
}

export async function createTicketRecord(input: {
  guildId: string;
  channelId: string;
  userId: string;
  ticketTypeId: number;
  panelId?: number | null;
}): Promise<number> {
  const row = await db.get<{ id: number }>(`
    INSERT INTO tickets (guild_id, channel_id, user_id, ticket_type_id, panel_id, last_activity_at)
    VALUES (@guildId, @channelId, @userId, @ticketTypeId, @panelId, CURRENT_TIMESTAMP)
    RETURNING id
  `, { ...input, panelId: input.panelId ?? null });
  return Number(row!.id);
}

export interface TicketRecord {
  id: number;
  guildId: string;
  channelId: string;
  userId: string;
  ticketTypeId: number | null;
  panelId: number | null;
  status: string;
  claimedBy: string | null;
  closeReason: string;
  openedAt: string;
  closedAt: string | null;
  closedBy: string | null;
  lastActivityAt: string;
}

export async function getTicketByChannel(guildId: string, channelId: string): Promise<TicketRecord | undefined> {
  const row = await db.get<Record<string, unknown>>(`
    SELECT id, guild_id AS "guildId", channel_id AS "channelId", user_id AS "userId",
      ticket_type_id AS "ticketTypeId", status, claimed_by AS "claimedBy",
      panel_id AS "panelId", close_reason AS "closeReason",
      opened_at AS "openedAt", closed_at AS "closedAt", closed_by AS "closedBy",
      last_activity_at AS "lastActivityAt"
    FROM tickets WHERE guild_id = ? AND channel_id = ?
  `, [guildId, channelId]);
  if (!row) return undefined;
  return { ...row, id: Number(row.id), ticketTypeId: row.ticketTypeId === null ? null : Number(row.ticketTypeId), panelId: row.panelId === null ? null : Number(row.panelId) } as unknown as TicketRecord;
}

export async function claimTicket(guildId: string, channelId: string, userId: string): Promise<boolean> {
  return (await db.run("UPDATE tickets SET claimed_by = ? WHERE guild_id = ? AND channel_id = ? AND status = 'open' AND claimed_by IS NULL", [userId, guildId, channelId])).changes > 0;
}

export async function closeTicket(guildId: string, channelId: string, userId: string, reason = ""): Promise<boolean> {
  return (await db.run("UPDATE tickets SET status = 'closed', closed_by = ?, close_reason = ?, closed_at = CURRENT_TIMESTAMP WHERE guild_id = ? AND channel_id = ? AND status = 'open'", [userId, reason, guildId, channelId])).changes > 0;
}

export async function updateTicketActivity(guildId: string, channelId: string): Promise<void> {
  await db.run("UPDATE tickets SET last_activity_at = CURRENT_TIMESTAMP WHERE guild_id = ? AND channel_id = ? AND status = 'open'", [guildId, channelId]);
}

export async function listInactiveTickets() {
  const sql = db.dialect === "postgres"
    ? `SELECT tickets.guild_id AS "guildId", tickets.channel_id AS "channelId",
         tickets.user_id AS "userId", ticket_types.auto_close_hours AS "autoCloseHours"
       FROM tickets JOIN ticket_types ON ticket_types.id = tickets.ticket_type_id
       WHERE tickets.status = 'open' AND ticket_types.auto_close_hours > 0
         AND tickets.last_activity_at + (ticket_types.auto_close_hours * INTERVAL '1 hour') <= CURRENT_TIMESTAMP`
    : `SELECT tickets.guild_id AS guildId, tickets.channel_id AS channelId,
         tickets.user_id AS userId, ticket_types.auto_close_hours AS autoCloseHours
       FROM tickets JOIN ticket_types ON ticket_types.id = tickets.ticket_type_id
       WHERE tickets.status = 'open' AND ticket_types.auto_close_hours > 0
         AND datetime(tickets.last_activity_at, '+' || ticket_types.auto_close_hours || ' hours') <= CURRENT_TIMESTAMP`;
  return db.all<{ guildId: string; channelId: string; userId: string; autoCloseHours: number }>(sql);
}

export async function addWarning(input: {
  guildId: string;
  userId: string;
  moderatorId: string;
  reason: string;
}): Promise<number> {
  const row = await db.get<{ id: number }>("INSERT INTO warnings (guild_id, user_id, moderator_id, reason) VALUES (@guildId, @userId, @moderatorId, @reason) RETURNING id", input);
  return Number(row!.id);
}

export async function listWarnings(guildId: string, userId?: string, limit = 100) {
  const rows = userId
    ? await db.all<Record<string, unknown>>(`SELECT id, guild_id AS "guildId", user_id AS "userId", moderator_id AS "moderatorId", reason, created_at AS "createdAt" FROM warnings WHERE guild_id = ? AND user_id = ? ORDER BY id DESC LIMIT ?`, [guildId, userId, limit])
    : await db.all<Record<string, unknown>>(`SELECT id, guild_id AS "guildId", user_id AS "userId", moderator_id AS "moderatorId", reason, created_at AS "createdAt" FROM warnings WHERE guild_id = ? ORDER BY id DESC LIMIT ?`, [guildId, limit]);
  return rows.map((row) => ({ ...row, id: Number(row.id), createdAt: String(row.createdAt) })) as Array<{
    id: number; guildId: string; userId: string; moderatorId: string; reason: string; createdAt: string;
  }>;
}

export async function recordModerationAction(input: {
  guildId: string;
  action: string;
  targetUserId?: string | null;
  moderatorId: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}): Promise<number> {
  const row = await db.get<{ id: number }>(`
    INSERT INTO moderation_actions (guild_id, action, target_user_id, moderator_id, reason, metadata)
    VALUES (@guildId, @action, @targetUserId, @moderatorId, @reason, @metadata) RETURNING id
  `, {
    ...input,
    targetUserId: input.targetUserId ?? null,
    reason: input.reason ?? "",
    metadata: JSON.stringify(input.metadata ?? {})
  });
  return Number(row!.id);
}

export async function listRecentTickets(guildId: string, limit = 50) {
  return db.all(`
    SELECT tickets.id, tickets.channel_id AS "channelId", tickets.user_id AS "userId",
      tickets.status, tickets.claimed_by AS "claimedBy", tickets.opened_at AS "openedAt",
      tickets.closed_at AS "closedAt", ticket_types.label AS "typeLabel"
    FROM tickets LEFT JOIN ticket_types ON ticket_types.id = tickets.ticket_type_id
    WHERE tickets.guild_id = ? ORDER BY tickets.id DESC LIMIT ?
  `, [guildId, limit]);
}

export async function listModerationActions(guildId: string, limit = 100) {
  return db.all(`
    SELECT id, action, target_user_id AS "targetUserId", moderator_id AS "moderatorId",
      reason, metadata, created_at AS "createdAt"
    FROM moderation_actions WHERE guild_id = ? ORDER BY id DESC LIMIT ?
  `, [guildId, limit]);
}

function mapWelcomeSettings(row: Record<string, unknown>): WelcomeSettings {
  return {
    guildId: row.guild_id as string,
    enabled: Boolean(row.enabled),
    channelId: row.channel_id as string | null,
    dmEnabled: Boolean(row.dm_enabled),
    dmContent: (row.dm_content as string) ?? "",
    dmEmbedEnabled: Boolean(row.dm_embed_enabled),
    content: (row.content as string) ?? "",
    embedTitle: (row.embed_title as string) ?? "",
    embedDescription: (row.embed_description as string) ?? "",
    embedColor: (row.embed_color as string) ?? "#5865F2",
    embedImageUrl: (row.embed_image_url as string) ?? "",
    embedThumbnailUrl: (row.embed_thumbnail_url as string) ?? "",
    embedFooterText: (row.embed_footer_text as string) ?? "",
    autoRoleIds: parseJsonArray(row.auto_role_ids as string | null)
  };
}

export async function getWelcomeSettings(guildId: string): Promise<WelcomeSettings> {
  await ensureGuildRows(guildId);
  const row = await db.get<Record<string, unknown>>("SELECT * FROM welcome_settings WHERE guild_id = ?", [guildId]);
  return mapWelcomeSettings(row!);
}

export async function saveWelcomeSettings(settings: WelcomeSettings): Promise<WelcomeSettings> {
  await ensureGuildRows(settings.guildId);
  await db.run(`
    UPDATE welcome_settings SET
      enabled = @enabled, channel_id = @channelId, dm_enabled = @dmEnabled,
      dm_content = @dmContent, dm_embed_enabled = @dmEmbedEnabled,
      content = @content, embed_title = @embedTitle, embed_description = @embedDescription,
      embed_color = @embedColor, embed_image_url = @embedImageUrl,
      embed_thumbnail_url = @embedThumbnailUrl, embed_footer_text = @embedFooterText,
      auto_role_ids = @autoRoleIds, updated_at = CURRENT_TIMESTAMP
    WHERE guild_id = @guildId
  `, {
    ...settings,
    enabled: Number(settings.enabled),
    dmEnabled: Number(settings.dmEnabled),
    dmEmbedEnabled: Number(settings.dmEmbedEnabled),
    autoRoleIds: JSON.stringify(settings.autoRoleIds)
  });
  return getWelcomeSettings(settings.guildId);
}

function mapAntiRaid(row: Record<string, unknown>): AntiRaidSettings {
  return {
    guildId: row.guild_id as string,
    enabled: Boolean(row.enabled),
    joinThreshold: Number(row.join_threshold ?? 10),
    timeWindowSeconds: Number(row.time_window_seconds ?? 60),
    action: (row.action as AntiRaidSettings["action"]) ?? "alert",
    lockdownDurationSeconds: Number(row.lockdown_duration_seconds ?? 300),
    minAccountAgeDays: Number(row.min_account_age_days ?? 0),
    blockNoAvatar: Boolean(row.block_no_avatar),
    bypassRoleIds: parseJsonArray(row.bypass_role_ids as string | null),
    bypassUserIds: parseJsonArray(row.bypass_user_ids as string | null),
    alertChannelId: row.alert_channel_id as string | null,
    logChannelId: row.log_channel_id as string | null
  };
}

export async function getAntiRaidSettings(guildId: string): Promise<AntiRaidSettings> {
  await ensureGuildRows(guildId);
  const row = await db.get<Record<string, unknown>>("SELECT * FROM anti_raid_settings WHERE guild_id = ?", [guildId]);
  return mapAntiRaid(row!);
}

export async function saveAntiRaidSettings(settings: AntiRaidSettings): Promise<AntiRaidSettings> {
  await ensureGuildRows(settings.guildId);
  await db.run(`
    UPDATE anti_raid_settings SET
      enabled = @enabled, join_threshold = @joinThreshold, time_window_seconds = @timeWindowSeconds,
      action = @action, lockdown_duration_seconds = @lockdownDurationSeconds,
      min_account_age_days = @minAccountAgeDays, block_no_avatar = @blockNoAvatar,
      bypass_role_ids = @bypassRoleIds, bypass_user_ids = @bypassUserIds,
      alert_channel_id = @alertChannelId, log_channel_id = @logChannelId,
      updated_at = CURRENT_TIMESTAMP
    WHERE guild_id = @guildId
  `, {
    ...settings,
    enabled: Number(settings.enabled),
    blockNoAvatar: Number(settings.blockNoAvatar),
    bypassRoleIds: JSON.stringify(settings.bypassRoleIds),
    bypassUserIds: JSON.stringify(settings.bypassUserIds)
  });
  return getAntiRaidSettings(settings.guildId);
}

function mapAntiNuke(row: Record<string, unknown>): AntiNukeSettings {
  return {
    guildId: row.guild_id as string,
    enabled: Boolean(row.enabled),
    channelDeleteThreshold: Number(row.channel_delete_threshold ?? 5),
    channelCreateThreshold: Number(row.channel_create_threshold ?? 5),
    roleDeleteThreshold: Number(row.role_delete_threshold ?? 5),
    roleCreateThreshold: Number(row.role_create_threshold ?? 5),
    banThreshold: Number(row.ban_threshold ?? 5),
    kickThreshold: Number(row.kick_threshold ?? 5),
    webhookThreshold: Number(row.webhook_threshold ?? 3),
    permissionThreshold: Number(row.permission_threshold ?? 3),
    botAddThreshold: Number(row.bot_add_threshold ?? 2),
    adminRoleThreshold: Number(row.admin_role_threshold ?? 2),
    timeWindowSeconds: Number(row.time_window_seconds ?? 10),
    action: (row.action as AntiNukeSettings["action"]) ?? "alert",
    alertChannelId: row.alert_channel_id as string | null,
    logChannelId: row.log_channel_id as string | null
  };
}

export async function getAntiNukeSettings(guildId: string): Promise<AntiNukeSettings> {
  await ensureGuildRows(guildId);
  const row = await db.get<Record<string, unknown>>("SELECT * FROM anti_nuke_settings WHERE guild_id = ?", [guildId]);
  return mapAntiNuke(row!);
}

export async function saveAntiNukeSettings(settings: AntiNukeSettings): Promise<AntiNukeSettings> {
  await ensureGuildRows(settings.guildId);
  await db.run(`
    UPDATE anti_nuke_settings SET
      enabled = @enabled, channel_delete_threshold = @channelDeleteThreshold,
      channel_create_threshold = @channelCreateThreshold, role_delete_threshold = @roleDeleteThreshold,
      role_create_threshold = @roleCreateThreshold, ban_threshold = @banThreshold,
      kick_threshold = @kickThreshold, webhook_threshold = @webhookThreshold,
      permission_threshold = @permissionThreshold, bot_add_threshold = @botAddThreshold,
      admin_role_threshold = @adminRoleThreshold, time_window_seconds = @timeWindowSeconds,
      action = @action, alert_channel_id = @alertChannelId, log_channel_id = @logChannelId,
      updated_at = CURRENT_TIMESTAMP
    WHERE guild_id = @guildId
  `, { ...settings, enabled: Number(settings.enabled) });
  return getAntiNukeSettings(settings.guildId);
}

export async function listAntiNukeTrusted(guildId: string): Promise<AntiNukeTrusted[]> {
  const rows = await db.all<Record<string, unknown>>("SELECT * FROM anti_nuke_trusted WHERE guild_id = ?", [guildId]);
  return rows.map((row) => ({
    id: Number(row.id),
    guildId: row.guild_id as string,
    userId: (row.user_id as string) || null,
    roleId: (row.role_id as string) || null
  }));
}

export async function addAntiNukeTrusted(input: Omit<AntiNukeTrusted, "id">): Promise<AntiNukeTrusted> {
  const row = await db.get<Record<string, unknown>>(`
    INSERT INTO anti_nuke_trusted (guild_id, user_id, role_id) VALUES (@guildId, @userId, @roleId) RETURNING *
  `, { guildId: input.guildId, userId: input.userId, roleId: input.roleId });
  return { id: Number(row!.id), guildId: input.guildId, userId: input.userId, roleId: input.roleId };
}

export async function removeAntiNukeTrusted(id: number, guildId: string): Promise<boolean> {
  return (await db.run("DELETE FROM anti_nuke_trusted WHERE id = ? AND guild_id = ?", [id, guildId])).changes > 0;
}

export async function createCloseRequest(input: Omit<TicketCloseRequest, "id" | "createdAt" | "resolvedAt" | "resolvedBy">): Promise<TicketCloseRequest> {
  const row = await db.get<Record<string, unknown>>(`
    INSERT INTO ticket_close_requests (guild_id, ticket_id, requested_by, reason, status)
    VALUES (@guildId, @ticketId, @requestedBy, @reason, 'pending') RETURNING *
  `, input);
  return {
    id: Number(row!.id),
    guildId: input.guildId,
    ticketId: input.ticketId,
    requestedBy: input.requestedBy,
    reason: input.reason,
    status: "pending",
    createdAt: String(row!.created_at),
    resolvedAt: null,
    resolvedBy: null
  };
}

export async function getPendingCloseRequests(guildId: string): Promise<TicketCloseRequest[]> {
  const rows = await db.all<Record<string, unknown>>(`
    SELECT id, guild_id AS guildId, ticket_id AS ticketId, requested_by AS requestedBy,
      reason, status, created_at AS createdAt, resolved_at AS resolvedAt, resolved_by AS resolvedBy
    FROM ticket_close_requests WHERE guild_id = ? AND status = 'pending' ORDER BY id DESC
  `, [guildId]);
  return rows.map((row) => ({
    id: Number(row.id),
    guildId: row.guildId as string,
    ticketId: Number(row.ticketId),
    requestedBy: row.requestedBy as string,
    reason: row.reason as string,
    status: row.status as string,
    createdAt: String(row.createdAt),
    resolvedAt: row.resolvedAt ? String(row.resolvedAt) : null,
    resolvedBy: row.resolvedBy as string | null
  })) as TicketCloseRequest[];
}

export async function getPendingCloseRequestForTicket(guildId: string, ticketId: number): Promise<TicketCloseRequest | null> {
  const row = await db.get<Record<string, unknown>>(`SELECT id, guild_id AS guildId, ticket_id AS ticketId, requested_by AS requestedBy, reason, status, created_at AS createdAt, resolved_at AS resolvedAt, resolved_by AS resolvedBy FROM ticket_close_requests WHERE guild_id = ? AND ticket_id = ? AND status = 'pending'`, [guildId, ticketId]);
  if (!row) return null;
  return { id: Number(row.id), guildId: row.guildId as string, ticketId: Number(row.ticketId), requestedBy: row.requestedBy as string, reason: row.reason as string, status: row.status as string, createdAt: String(row.createdAt), resolvedAt: row.resolvedAt ? String(row.resolvedAt) : null, resolvedBy: row.resolvedBy as string | null } as TicketCloseRequest;
}

export async function getTicketCloseRequest(id: number, guildId: string): Promise<TicketCloseRequest | null> {
  const row = await db.get<Record<string, unknown>>(`
    SELECT id, guild_id AS guildId, ticket_id AS ticketId, requested_by AS requestedBy,
      reason, status, created_at AS createdAt, resolved_at AS resolvedAt, resolved_by AS resolvedBy
    FROM ticket_close_requests WHERE id = ? AND guild_id = ?
  `, [id, guildId]);
  if (!row) return null;
  return {
    id: Number(row.id),
    guildId: row.guildId as string,
    ticketId: Number(row.ticketId),
    requestedBy: row.requestedBy as string,
    reason: row.reason as string,
    status: row.status as string,
    createdAt: String(row.createdAt),
    resolvedAt: row.resolvedAt ? String(row.resolvedAt) : null,
    resolvedBy: row.resolvedBy as string | null
  } as TicketCloseRequest;
}

export async function resolveCloseRequest(id: number, guildId: string, resolvedBy: string, status: "approved" | "denied"): Promise<boolean> {
  return (await db.run(`
    UPDATE ticket_close_requests SET status = ?, resolved_by = ?, resolved_at = CURRENT_TIMESTAMP
    WHERE id = ? AND guild_id = ? AND status = 'pending'
  `, [status, resolvedBy, id, guildId])).changes > 0;
}
