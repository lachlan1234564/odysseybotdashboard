import type {
  ActionSequenceItem,
  AnnouncementTemplate,
  AntiRoleSettings,
  AutoModSettings,
  AntiNukeSettings,
  AntiNukeTrusted,
  AntiRaidSettings,
  Branding,
  CustomCommand,
  CustomCommandActionConfig,
  GuildSettings,
  LoggingSettings,
  Giveaway,
  GiveawayEntry,
  ModerationCase,
  RolePanel,
  RolePanelOption,
  ScheduledAnnouncement,
  SocialPromotionSettings,
  StickyMessage,
  TicketCloseRequest,
  TicketPanel,
  TicketTranscript,
  TicketTranscriptMessage,
  TicketType,
  VerificationRecord,
  VerificationPermissionBackup,
  VerificationSettings,
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

async function clearDeprecatedVerificationDeviceData(): Promise<void> {
  if (db.dialect === "postgres") {
    const columns = await db.all<{ table_name: string; column_name: string }>(`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (
          (table_name = 'verification_settings' AND column_name = 'device_check_enabled')
          OR (table_name = 'verification_records' AND column_name = 'device_hash')
        )
    `);
    if (columns.some((column) => column.table_name === "verification_settings")) {
      await db.run("UPDATE verification_settings SET device_check_enabled = 0");
    }
    if (columns.some((column) => column.table_name === "verification_records")) {
      await db.run("UPDATE verification_records SET device_hash = NULL WHERE device_hash IS NOT NULL");
    }
    return;
  }

  const settingsColumns = await db.all<{ name: string }>("PRAGMA table_info(verification_settings)");
  if (settingsColumns.some((column) => column.name === "device_check_enabled")) {
    await db.run("UPDATE verification_settings SET device_check_enabled = 0");
  }
  const recordColumns = await db.all<{ name: string }>("PRAGMA table_info(verification_records)");
  if (recordColumns.some((column) => column.name === "device_hash")) {
    await db.run("UPDATE verification_records SET device_hash = NULL WHERE device_hash IS NOT NULL");
  }
}

await clearDeprecatedVerificationDeviceData();

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
  await db.run("INSERT INTO anti_role_settings (guild_id) VALUES (?) ON CONFLICT (guild_id) DO NOTHING", [guildId]);
  await db.run("INSERT INTO auto_mod_settings (guild_id) VALUES (?) ON CONFLICT (guild_id) DO NOTHING", [guildId]);
  await db.run("INSERT INTO social_promotion_settings (guild_id) VALUES (?) ON CONFLICT (guild_id) DO NOTHING", [guildId]);
  await db.run("INSERT INTO verification_settings (guild_id) VALUES (?) ON CONFLICT (guild_id) DO NOTHING", [guildId]);
  await db.run("INSERT INTO logging_settings (guild_id) VALUES (?) ON CONFLICT (guild_id) DO NOTHING", [guildId]);
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

export async function getLoggingSettings(guildId: string): Promise<LoggingSettings> {
  await ensureGuildRows(guildId);
  const row = (await db.get<Record<string, unknown>>(
    "SELECT * FROM logging_settings WHERE guild_id = ?",
    [guildId]
  ))!;
  return {
    guildId,
    enabled: Boolean(row.enabled),
    channelId: row.channel_id as string | null,
    members: Boolean(row.members),
    messages: Boolean(row.messages),
    voice: Boolean(row.voice),
    channels: Boolean(row.channels),
    roles: Boolean(row.roles),
    server: Boolean(row.server),
    invites: Boolean(row.invites),
    threads: Boolean(row.threads),
    moderation: Boolean(row.moderation),
    dashboard: Boolean(row.dashboard)
  };
}

export async function saveLoggingSettings(settings: LoggingSettings): Promise<LoggingSettings> {
  await ensureGuildRows(settings.guildId);
  await db.run(`
    UPDATE logging_settings SET
      enabled = @enabled,
      channel_id = @channelId,
      members = @members,
      messages = @messages,
      voice = @voice,
      channels = @channels,
      roles = @roles,
      server = @server,
      invites = @invites,
      threads = @threads,
      moderation = @moderation,
      dashboard = @dashboard,
      updated_at = CURRENT_TIMESTAMP
    WHERE guild_id = @guildId
  `, {
    ...settings,
    enabled: Number(settings.enabled),
    members: Number(settings.members),
    messages: Number(settings.messages),
    voice: Number(settings.voice),
    channels: Number(settings.channels),
    roles: Number(settings.roles),
    server: Number(settings.server),
    invites: Number(settings.invites),
    threads: Number(settings.threads),
    moderation: Number(settings.moderation),
    dashboard: Number(settings.dashboard)
  });
  return getLoggingSettings(settings.guildId);
}

export async function getBranding(guildId: string): Promise<Branding> {
  await ensureGuildRows(guildId);
  const row = (await db.get<Record<string, unknown>>("SELECT * FROM branding WHERE guild_id = ?", [guildId]))!;
  return {
    guildId,
    serverName: row.server_name as string,
    accentColor: (row.accent_color as string) ?? "#C58B4B",
    ticketButtonStyle: (row.ticket_button_style as Branding["ticketButtonStyle"]) ?? "secondary",
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
      server_name = @serverName, accent_color = @accentColor,
      ticket_button_style = @ticketButtonStyle, footer_text = @footerText,
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

export async function resetBranding(guildId: string): Promise<Branding> {
  await db.run("DELETE FROM branding WHERE guild_id = ?", [guildId]);
  return getBranding(guildId);
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
    outputMode: (row.output_mode as AnnouncementTemplate["outputMode"]) ?? "embed",
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
      guild_id, name, output_mode, title, body, color, image_url, thumbnail_url, footer, target_channel_id, ping_type
    ) VALUES (
      @guildId, @name, @outputMode, @title, @body, @color, @imageUrl, @thumbnailUrl, @footer, @targetChannelId, @pingType
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
      name = @name, output_mode = @outputMode, title = @title, body = @body, color = @color,
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

function mapModerationCase(row: Record<string, unknown>): ModerationCase {
  return {
    id: Number(row.id),
    guildId: String(row.guild_id ?? row.guildId),
    caseNumber: Number(row.case_number ?? row.caseNumber),
    targetUserId: String(row.target_user_id ?? row.targetUserId),
    moderatorId: String(row.moderator_id ?? row.moderatorId),
    actionType: String(row.action_type ?? row.actionType),
    reason: String(row.reason ?? ""),
    durationSeconds: row.duration_seconds === null || row.duration_seconds === undefined
      ? null
      : Number(row.duration_seconds),
    evidenceUrl: String(row.evidence_url ?? row.evidenceUrl ?? ""),
    status: (row.status as ModerationCase["status"]) ?? "active",
    notes: String(row.notes ?? ""),
    createdAt: String(row.created_at ?? row.createdAt),
    updatedAt: String(row.updated_at ?? row.updatedAt)
  };
}

export async function createModerationCase(input: {
  guildId: string;
  targetUserId: string;
  moderatorId: string;
  actionType: string;
  reason?: string;
  durationSeconds?: number | null;
  evidenceUrl?: string;
  status?: ModerationCase["status"];
  notes?: string;
}): Promise<ModerationCase> {
  await ensureGuildRows(input.guildId);
  const row = await db.get<Record<string, unknown>>(`
    INSERT INTO moderation_cases (
      guild_id, case_number, target_user_id, moderator_id, action_type,
      reason, duration_seconds, evidence_url, status, notes
    ) VALUES (
      @guildId,
      COALESCE((SELECT MAX(case_number) + 1 FROM moderation_cases WHERE guild_id = @guildId), 1),
      @targetUserId, @moderatorId, @actionType,
      @reason, @durationSeconds, @evidenceUrl, @status, @notes
    ) RETURNING *
  `, {
    ...input,
    reason: input.reason ?? "",
    durationSeconds: input.durationSeconds ?? null,
    evidenceUrl: input.evidenceUrl ?? "",
    status: input.status ?? "active",
    notes: input.notes ?? ""
  });
  return mapModerationCase(row!);
}

export async function listModerationCases(
  guildId: string,
  filters: { targetUserId?: string; moderatorId?: string; actionType?: string; status?: string; limit?: number } = {}
): Promise<ModerationCase[]> {
  const clauses = ["guild_id = ?"];
  const params: unknown[] = [guildId];
  if (filters.targetUserId) {
    clauses.push("target_user_id = ?");
    params.push(filters.targetUserId);
  }
  if (filters.moderatorId) {
    clauses.push("moderator_id = ?");
    params.push(filters.moderatorId);
  }
  if (filters.actionType) {
    clauses.push("action_type = ?");
    params.push(filters.actionType);
  }
  if (filters.status) {
    clauses.push("status = ?");
    params.push(filters.status);
  }
  params.push(filters.limit ?? 100);
  const rows = await db.all<Record<string, unknown>>(`
    SELECT * FROM moderation_cases
    WHERE ${clauses.join(" AND ")}
    ORDER BY case_number DESC
    LIMIT ?
  `, params);
  return rows.map(mapModerationCase);
}

export async function getModerationCase(guildId: string, caseNumber: number): Promise<ModerationCase | null> {
  const row = await db.get<Record<string, unknown>>(
    "SELECT * FROM moderation_cases WHERE guild_id = ? AND case_number = ?",
    [guildId, caseNumber]
  );
  return row ? mapModerationCase(row) : null;
}

export async function updateModerationCase(
  guildId: string,
  caseNumber: number,
  input: Partial<Pick<ModerationCase, "reason" | "notes" | "status">>
): Promise<ModerationCase | null> {
  const current = await getModerationCase(guildId, caseNumber);
  if (!current) return null;
  const row = await db.get<Record<string, unknown>>(`
    UPDATE moderation_cases SET
      reason = @reason, notes = @notes, status = @status, updated_at = CURRENT_TIMESTAMP
    WHERE guild_id = @guildId AND case_number = @caseNumber
    RETURNING *
  `, {
    guildId,
    caseNumber,
    reason: input.reason ?? current.reason,
    notes: input.notes ?? current.notes,
    status: input.status ?? current.status
  });
  return row ? mapModerationCase(row) : null;
}

function mapGiveaway(row: Record<string, unknown>): Giveaway {
  return {
    id: Number(row.id),
    guildId: String(row.guild_id ?? row.guildId),
    channelId: String(row.channel_id ?? row.channelId),
    messageId: row.message_id || row.messageId ? String(row.message_id ?? row.messageId) : null,
    prize: String(row.prize ?? ""),
    description: String(row.description ?? ""),
    winnersCount: Number(row.winners_count ?? row.winnersCount ?? 1),
    endsAt: String(row.ends_at ?? row.endsAt),
    requiredRoleId: row.required_role_id || row.requiredRoleId ? String(row.required_role_id ?? row.requiredRoleId) : null,
    boosterBonusEntries: Number(row.booster_bonus_entries ?? row.boosterBonusEntries ?? 0),
    bonusRoleId: row.bonus_role_id || row.bonusRoleId ? String(row.bonus_role_id ?? row.bonusRoleId) : null,
    bonusRoleEntries: Number(row.bonus_role_entries ?? row.bonusRoleEntries ?? 0),
    status: (row.status as Giveaway["status"]) ?? "draft",
    winnerUserIds: parseJsonArray(row.winner_user_ids as string | null),
    createdBy: String(row.created_by ?? row.createdBy),
    createdAt: String(row.created_at ?? row.createdAt),
    updatedAt: String(row.updated_at ?? row.updatedAt)
  };
}

export async function createGiveaway(input: Omit<Giveaway, "id" | "messageId" | "winnerUserIds" | "createdAt" | "updatedAt"> & {
  messageId?: string | null;
  winnerUserIds?: string[];
}): Promise<Giveaway> {
  await ensureGuildRows(input.guildId);
  const row = await db.get<Record<string, unknown>>(`
    INSERT INTO giveaways (
      guild_id, channel_id, message_id, prize, description, winners_count,
      ends_at, required_role_id, booster_bonus_entries, bonus_role_id,
      bonus_role_entries, status, winner_user_ids, created_by
    ) VALUES (
      @guildId, @channelId, @messageId, @prize, @description, @winnersCount,
      @endsAt, @requiredRoleId, @boosterBonusEntries, @bonusRoleId,
      @bonusRoleEntries, @status, @winnerUserIds, @createdBy
    ) RETURNING *
  `, {
    ...input,
    messageId: input.messageId ?? null,
    winnerUserIds: JSON.stringify(input.winnerUserIds ?? [])
  });
  return mapGiveaway(row!);
}

export async function updateGiveaway(
  id: number,
  guildId: string,
  input: Partial<Omit<Giveaway, "id" | "guildId" | "createdAt" | "updatedAt">>
): Promise<Giveaway | null> {
  const current = await getGiveaway(id, guildId);
  if (!current) return null;
  const next = { ...current, ...input };
  const row = await db.get<Record<string, unknown>>(`
    UPDATE giveaways SET
      channel_id = @channelId, message_id = @messageId, prize = @prize,
      description = @description, winners_count = @winnersCount, ends_at = @endsAt,
      required_role_id = @requiredRoleId, booster_bonus_entries = @boosterBonusEntries,
      bonus_role_id = @bonusRoleId, bonus_role_entries = @bonusRoleEntries,
      status = @status, winner_user_ids = @winnerUserIds, updated_at = CURRENT_TIMESTAMP
    WHERE id = @id AND guild_id = @guildId
    RETURNING *
  `, {
    ...next,
    id,
    guildId,
    winnerUserIds: JSON.stringify(next.winnerUserIds)
  });
  return row ? mapGiveaway(row) : null;
}

export async function getGiveaway(id: number, guildId: string): Promise<Giveaway | null> {
  const row = await db.get<Record<string, unknown>>(
    "SELECT * FROM giveaways WHERE id = ? AND guild_id = ?",
    [id, guildId]
  );
  return row ? mapGiveaway(row) : null;
}

export async function listGiveaways(guildId: string, limit = 100): Promise<Giveaway[]> {
  const rows = await db.all<Record<string, unknown>>(
    "SELECT * FROM giveaways WHERE guild_id = ? ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END, ends_at DESC LIMIT ?",
    [guildId, limit]
  );
  return rows.map(mapGiveaway);
}

export async function listDueGiveaways(): Promise<Giveaway[]> {
  const sql = db.dialect === "postgres"
    ? "SELECT * FROM giveaways WHERE status = 'active' AND ends_at <= CURRENT_TIMESTAMP ORDER BY ends_at"
    : "SELECT * FROM giveaways WHERE status = 'active' AND datetime(ends_at) <= CURRENT_TIMESTAMP ORDER BY datetime(ends_at)";
  return (await db.all<Record<string, unknown>>(sql)).map(mapGiveaway);
}

export async function addGiveawayEntry(input: GiveawayEntry): Promise<void> {
  await db.run(`
    INSERT INTO giveaway_entries (giveaway_id, guild_id, user_id, entries)
    VALUES (@giveawayId, @guildId, @userId, @entries)
    ON CONFLICT (giveaway_id, user_id) DO UPDATE SET entries = excluded.entries
  `, { ...input });
}

export async function removeGiveawayEntry(giveawayId: number, guildId: string, userId: string): Promise<boolean> {
  return (await db.run(
    "DELETE FROM giveaway_entries WHERE giveaway_id = ? AND guild_id = ? AND user_id = ?",
    [giveawayId, guildId, userId]
  )).changes > 0;
}

export async function listGiveawayEntries(giveawayId: number, guildId: string): Promise<GiveawayEntry[]> {
  const rows = await db.all<Record<string, unknown>>(
    "SELECT * FROM giveaway_entries WHERE giveaway_id = ? AND guild_id = ? ORDER BY created_at",
    [giveawayId, guildId]
  );
  return rows.map((row) => ({
    giveawayId: Number(row.giveaway_id),
    guildId: String(row.guild_id),
    userId: String(row.user_id),
    entries: Number(row.entries ?? 1),
    createdAt: String(row.created_at)
  }));
}

export async function createTicketTranscript(
  input: Omit<TicketTranscript, "id" | "createdAt">
): Promise<TicketTranscript> {
  const row = await db.get<Record<string, unknown>>(`
    INSERT INTO ticket_transcripts (
      guild_id, ticket_id, channel_id, channel_name, opener_id, closed_by,
      close_reason, message_count, transcript_json, transcript_text
    ) VALUES (
      @guildId, @ticketId, @channelId, @channelName, @openerId, @closedBy,
      @closeReason, @messageCount, @transcriptJson, @transcriptText
    ) RETURNING *
  `, {
    ...input,
    transcriptJson: JSON.stringify(input.transcriptJson)
  });
  return mapTicketTranscript(row!);
}

function parseTranscriptMessages(value: string | null): TicketTranscriptMessage[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is TicketTranscriptMessage =>
      Boolean(item) && typeof item === "object" && !Array.isArray(item)
    );
  } catch {
    return [];
  }
}

function mapTicketTranscript(row: Record<string, unknown>): TicketTranscript {
  return {
    id: Number(row.id),
    guildId: String(row.guild_id ?? row.guildId),
    ticketId: Number(row.ticket_id ?? row.ticketId),
    channelId: String(row.channel_id ?? row.channelId),
    channelName: String(row.channel_name ?? row.channelName),
    openerId: String(row.opener_id ?? row.openerId),
    closedBy: String(row.closed_by ?? row.closedBy),
    closeReason: String(row.close_reason ?? row.closeReason ?? ""),
    messageCount: Number(row.message_count ?? row.messageCount ?? 0),
    transcriptJson: parseTranscriptMessages(row.transcript_json as string | null),
    transcriptText: String(row.transcript_text ?? row.transcriptText ?? ""),
    createdAt: String(row.created_at ?? row.createdAt)
  };
}

export async function listTicketTranscripts(guildId: string, limit = 100): Promise<TicketTranscript[]> {
  const rows = await db.all<Record<string, unknown>>(
    "SELECT * FROM ticket_transcripts WHERE guild_id = ? ORDER BY id DESC LIMIT ?",
    [guildId, limit]
  );
  return rows.map(mapTicketTranscript);
}

export async function getTicketTranscript(id: number, guildId: string): Promise<TicketTranscript | null> {
  const row = await db.get<Record<string, unknown>>(
    "SELECT * FROM ticket_transcripts WHERE id = ? AND guild_id = ?",
    [id, guildId]
  );
  return row ? mapTicketTranscript(row) : null;
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
    autoRolesEnabled: Boolean(row.auto_roles_enabled),
    autoRoleIds: parseJsonArray(row.auto_role_ids as string | null),
    goodbyeEnabled: Boolean(row.goodbye_enabled),
    goodbyeChannelId: row.goodbye_channel_id as string | null,
    goodbyeContent: (row.goodbye_content as string) ?? "",
    goodbyeEmbedEnabled: Boolean(row.goodbye_embed_enabled),
    boostEnabled: Boolean(row.boost_enabled),
    boostChannelId: row.boost_channel_id as string | null,
    boostMessage: (row.boost_message as string)
      ?? "Thank you {user} for boosting {server}! We now have {boostCount} boosts and are at {tier}."
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
      auto_roles_enabled = @autoRolesEnabled, auto_role_ids = @autoRoleIds,
      goodbye_enabled = @goodbyeEnabled, goodbye_channel_id = @goodbyeChannelId,
      goodbye_content = @goodbyeContent, goodbye_embed_enabled = @goodbyeEmbedEnabled,
      boost_enabled = @boostEnabled, boost_channel_id = @boostChannelId,
      boost_message = @boostMessage,
      updated_at = CURRENT_TIMESTAMP
    WHERE guild_id = @guildId
  `, {
    ...settings,
    enabled: Number(settings.enabled),
    dmEnabled: Number(settings.dmEnabled),
    dmEmbedEnabled: Number(settings.dmEmbedEnabled),
    autoRolesEnabled: Number(settings.autoRolesEnabled),
    goodbyeEnabled: Number(settings.goodbyeEnabled),
    goodbyeEmbedEnabled: Number(settings.goodbyeEmbedEnabled),
    boostEnabled: Number(settings.boostEnabled),
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

function mapAntiRole(row: Record<string, unknown>): AntiRoleSettings {
  return {
    guildId: row.guild_id as string,
    enabled: Boolean(row.enabled),
    protectedRoleIds: parseJsonArray(row.protected_role_ids as string | null),
    trustedUserIds: parseJsonArray(row.trusted_user_ids as string | null),
    trustedRoleIds: parseJsonArray(row.trusted_role_ids as string | null),
    action: (row.action as AntiRoleSettings["action"]) ?? "log",
    massChangeThreshold: Number(row.mass_change_threshold ?? 4),
    timeWindowSeconds: Number(row.time_window_seconds ?? 20),
    logChannelId: row.log_channel_id as string | null
  };
}

export async function getAntiRoleSettings(guildId: string): Promise<AntiRoleSettings> {
  await ensureGuildRows(guildId);
  const row = await db.get<Record<string, unknown>>("SELECT * FROM anti_role_settings WHERE guild_id = ?", [guildId]);
  return mapAntiRole(row!);
}

export async function saveAntiRoleSettings(settings: AntiRoleSettings): Promise<AntiRoleSettings> {
  await ensureGuildRows(settings.guildId);
  await db.run(`
    UPDATE anti_role_settings SET
      enabled = @enabled, protected_role_ids = @protectedRoleIds,
      trusted_user_ids = @trustedUserIds, trusted_role_ids = @trustedRoleIds,
      action = @action, mass_change_threshold = @massChangeThreshold,
      time_window_seconds = @timeWindowSeconds, log_channel_id = @logChannelId,
      updated_at = CURRENT_TIMESTAMP
    WHERE guild_id = @guildId
  `, {
    ...settings,
    enabled: Number(settings.enabled),
    protectedRoleIds: JSON.stringify(settings.protectedRoleIds),
    trustedUserIds: JSON.stringify(settings.trustedUserIds),
    trustedRoleIds: JSON.stringify(settings.trustedRoleIds)
  });
  return getAntiRoleSettings(settings.guildId);
}

function mapAutoMod(row: Record<string, unknown>): AutoModSettings {
  return {
    guildId: row.guild_id as string,
    enabled: Boolean(row.enabled),
    blockInvites: Boolean(row.block_invites),
    blockSuspiciousLinks: Boolean(row.block_suspicious_links),
    blockCaps: Boolean(row.block_caps),
    blockSpam: Boolean(row.block_spam),
    blockMassMentions: Boolean(row.block_mass_mentions),
    capsPercentage: Number(row.caps_percentage ?? 75),
    spamThreshold: Number(row.spam_threshold ?? 4),
    mentionThreshold: Number(row.mention_threshold ?? 5),
    mentionSpamThreshold: Number(row.mention_spam_threshold ?? 3),
    mentionWindowSeconds: Number(row.mention_window_seconds ?? 30),
    action: (row.action as AutoModSettings["action"]) ?? "delete",
    timeoutMinutes: Number(row.timeout_minutes ?? 10),
    alwaysBlockDiscordInvites: row.always_block_discord_invites === undefined
      ? true
      : Boolean(row.always_block_discord_invites),
    linkChannelRules: parseJsonArrayOfObjects(row.link_channel_rules as string | null),
    ignoredChannelIds: parseJsonArray(row.ignored_channel_ids as string | null),
    ignoredRoleIds: parseJsonArray(row.ignored_role_ids as string | null),
    ignoredUserIds: parseJsonArray(row.ignored_user_ids as string | null),
    logChannelId: row.log_channel_id as string | null
  };
}

export async function getAutoModSettings(guildId: string): Promise<AutoModSettings> {
  await ensureGuildRows(guildId);
  const row = await db.get<Record<string, unknown>>("SELECT * FROM auto_mod_settings WHERE guild_id = ?", [guildId]);
  return mapAutoMod(row!);
}

export async function saveAutoModSettings(settings: AutoModSettings): Promise<AutoModSettings> {
  await ensureGuildRows(settings.guildId);
  await db.run(`
    UPDATE auto_mod_settings SET
      enabled = @enabled, block_invites = @blockInvites,
      block_suspicious_links = @blockSuspiciousLinks, block_caps = @blockCaps,
      block_spam = @blockSpam, block_mass_mentions = @blockMassMentions,
      caps_percentage = @capsPercentage, spam_threshold = @spamThreshold,
      mention_threshold = @mentionThreshold,
      mention_spam_threshold = @mentionSpamThreshold,
      mention_window_seconds = @mentionWindowSeconds, action = @action,
      timeout_minutes = @timeoutMinutes, ignored_channel_ids = @ignoredChannelIds,
      always_block_discord_invites = @alwaysBlockDiscordInvites,
      link_channel_rules = @linkChannelRules,
      ignored_role_ids = @ignoredRoleIds, ignored_user_ids = @ignoredUserIds,
      log_channel_id = @logChannelId, updated_at = CURRENT_TIMESTAMP
    WHERE guild_id = @guildId
  `, {
    ...settings,
    enabled: Number(settings.enabled),
    blockInvites: Number(settings.blockInvites),
    blockSuspiciousLinks: Number(settings.blockSuspiciousLinks),
    blockCaps: Number(settings.blockCaps),
    blockSpam: Number(settings.blockSpam),
    blockMassMentions: Number(settings.blockMassMentions),
    alwaysBlockDiscordInvites: Number(settings.alwaysBlockDiscordInvites),
    linkChannelRules: JSON.stringify(settings.linkChannelRules),
    ignoredChannelIds: JSON.stringify(settings.ignoredChannelIds),
    ignoredRoleIds: JSON.stringify(settings.ignoredRoleIds),
    ignoredUserIds: JSON.stringify(settings.ignoredUserIds)
  });
  return getAutoModSettings(settings.guildId);
}

function parseJsonArrayOfObjects<T extends Record<string, unknown>>(value: string | null): T[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is T => Boolean(item) && typeof item === "object" && !Array.isArray(item))
      : [];
  } catch {
    return [];
  }
}

export async function getSocialPromotionSettings(guildId: string): Promise<SocialPromotionSettings> {
  await ensureGuildRows(guildId);
  const row = (await db.get<Record<string, unknown>>(
    "SELECT * FROM social_promotion_settings WHERE guild_id = ?",
    [guildId]
  ))!;
  return {
    guildId,
    outputMode: (row.output_mode as SocialPromotionSettings["outputMode"]) ?? "embed",
    title: String(row.title ?? "Follow our socials"),
    description: String(row.description ?? ""),
    color: String(row.color ?? "#5865F2"),
    thumbnailUrl: String(row.thumbnail_url ?? ""),
    imageUrl: String(row.image_url ?? ""),
    targetChannelId: (row.target_channel_id as string | null) ?? null,
    links: parseJsonArrayOfObjects(row.links as string | null),
    memberEntries: parseJsonArrayOfObjects(row.member_entries as string | null)
  };
}

export async function saveSocialPromotionSettings(
  settings: SocialPromotionSettings
): Promise<SocialPromotionSettings> {
  await ensureGuildRows(settings.guildId);
  await db.run(`
    UPDATE social_promotion_settings SET
      output_mode = @outputMode, title = @title, description = @description,
      color = @color, thumbnail_url = @thumbnailUrl, image_url = @imageUrl,
      target_channel_id = @targetChannelId, links = @links,
      member_entries = @memberEntries, updated_at = CURRENT_TIMESTAMP
    WHERE guild_id = @guildId
  `, {
    ...settings,
    links: JSON.stringify(settings.links),
    memberEntries: JSON.stringify(settings.memberEntries)
  });
  return getSocialPromotionSettings(settings.guildId);
}

export async function getVerificationSettings(guildId: string): Promise<VerificationSettings> {
  await ensureGuildRows(guildId);
  const row = (await db.get<Record<string, unknown>>(
    "SELECT * FROM verification_settings WHERE guild_id = ?",
    [guildId]
  ))!;
  return {
    guildId,
    enabled: Boolean(row.enabled),
    verifiedRoleId: row.verified_role_id as string | null,
    verificationChannelId: row.verification_channel_id as string | null,
    verificationChannelName: String(row.verification_channel_name ?? "verify"),
    verificationEmbedMessageId: row.verification_embed_message_id as string | null,
    embedTitle: String(row.embed_title ?? "Verify to Access the Server"),
    embedDescription: String(
      row.embed_description
      ?? "Click the button below to verify your Discord account. Once verified, you will receive the community role and unlock the rest of the server."
    ),
    embedColor: String(row.embed_color ?? "#C58B4B"),
    buttonText: String(row.button_text ?? "Verify Me"),
    successMessage: String(row.success_message ?? "Verification passed. You can return to Discord."),
    failureMessage: String(
      row.failure_message
      ?? "Verification did not meet this server's requirements. Contact server staff if you need help."
    ),
    action: (row.action as VerificationSettings["action"]) ?? "flag",
    logChannelId: row.log_channel_id as string | null,
    minAccountAgeDays: Number(row.min_account_age_days ?? 0),
    minServerDays: Number(row.min_server_days ?? 0),
    vpnCheckEnabled: Boolean(row.vpn_check_enabled),
    vpnFailClosed: Boolean(row.vpn_fail_closed),
    recordRetentionHours: Number(row.record_retention_hours ?? 168),
    publicChannelIds: parseJsonArray(row.public_channel_ids as string),
    publicCategoryIds: parseJsonArray(row.public_category_ids as string),
    hiddenChannelIds: parseJsonArray(row.hidden_channel_ids as string),
    hiddenCategoryIds: parseJsonArray(row.hidden_category_ids as string),
    lockAllChannels: Boolean(row.lock_all_channels ?? 1),
    autoCreateChannel: Boolean(row.auto_create_channel ?? 1),
    lockVerificationChannel: Boolean(row.lock_verification_channel ?? 1),
    updateEmbedOnSetup: Boolean(row.update_embed_on_setup ?? 1),
    applyPermissionsImmediately: Boolean(row.apply_permissions_immediately),
    permissionsApplied: Boolean(row.permissions_applied),
    lastSetupAt: row.last_setup_at ? String(row.last_setup_at) : null,
    updatedBy: row.updated_by ? String(row.updated_by) : null
  };
}

export async function saveVerificationSettings(settings: VerificationSettings): Promise<VerificationSettings> {
  await ensureGuildRows(settings.guildId);
  await db.run(`
    UPDATE verification_settings SET
      enabled = @enabled, verified_role_id = @verifiedRoleId,
      verification_channel_id = @verificationChannelId,
      verification_channel_name = @verificationChannelName,
      verification_embed_message_id = @verificationEmbedMessageId,
      embed_title = @embedTitle,
      embed_description = @embedDescription,
      embed_color = @embedColor,
      button_text = @buttonText,
      success_message = @successMessage,
      failure_message = @failureMessage,
      action = @action, log_channel_id = @logChannelId,
      min_account_age_days = @minAccountAgeDays,
      min_server_days = @minServerDays,
      vpn_check_enabled = @vpnCheckEnabled,
      vpn_fail_closed = @vpnFailClosed,
      record_retention_hours = @recordRetentionHours,
      public_channel_ids = @publicChannelIds,
      public_category_ids = @publicCategoryIds,
      hidden_channel_ids = @hiddenChannelIds,
      hidden_category_ids = @hiddenCategoryIds,
      lock_all_channels = @lockAllChannels,
      auto_create_channel = @autoCreateChannel,
      lock_verification_channel = @lockVerificationChannel,
      update_embed_on_setup = @updateEmbedOnSetup,
      apply_permissions_immediately = @applyPermissionsImmediately,
      permissions_applied = @permissionsApplied,
      last_setup_at = @lastSetupAt,
      updated_by = @updatedBy,
      updated_at = CURRENT_TIMESTAMP
    WHERE guild_id = @guildId
  `, {
    ...settings,
    enabled: Number(settings.enabled),
    vpnCheckEnabled: Number(settings.vpnCheckEnabled),
    vpnFailClosed: Number(settings.vpnFailClosed),
    publicChannelIds: JSON.stringify(settings.publicChannelIds),
    publicCategoryIds: JSON.stringify(settings.publicCategoryIds),
    hiddenChannelIds: JSON.stringify(settings.hiddenChannelIds),
    hiddenCategoryIds: JSON.stringify(settings.hiddenCategoryIds),
    lockAllChannels: Number(settings.lockAllChannels),
    autoCreateChannel: Number(settings.autoCreateChannel),
    lockVerificationChannel: Number(settings.lockVerificationChannel),
    updateEmbedOnSetup: Number(settings.updateEmbedOnSetup),
    applyPermissionsImmediately: Number(settings.applyPermissionsImmediately),
    permissionsApplied: Number(settings.permissionsApplied)
  });
  return getVerificationSettings(settings.guildId);
}

export async function saveVerificationSetupState(input: {
  guildId: string;
  verificationChannelId: string | null;
  verificationEmbedMessageId: string | null;
  permissionsApplied: boolean;
  lastSetupAt: string | null;
  updatedBy: string | null;
}): Promise<VerificationSettings> {
  await ensureGuildRows(input.guildId);
  await db.run(`
    UPDATE verification_settings SET
      verification_channel_id = @verificationChannelId,
      verification_embed_message_id = @verificationEmbedMessageId,
      permissions_applied = @permissionsApplied,
      last_setup_at = @lastSetupAt,
      updated_by = @updatedBy,
      updated_at = CURRENT_TIMESTAMP
    WHERE guild_id = @guildId
  `, {
    ...input,
    permissionsApplied: Number(input.permissionsApplied)
  });
  return getVerificationSettings(input.guildId);
}

export async function getVerificationPermissionBackup(
  guildId: string,
  channelId: string,
  targetId: string
): Promise<VerificationPermissionBackup | null> {
  const row = await db.get<Record<string, unknown>>(`
    SELECT * FROM verification_permission_backups
    WHERE guild_id = ? AND channel_id = ? AND target_id = ?
  `, [guildId, channelId, targetId]);
  if (!row) return null;
  return {
    guildId,
    channelId,
    targetId,
    targetType: Number(row.target_type) === 1 ? 1 : 0,
    allow: String(row.allow_bits ?? "0"),
    deny: String(row.deny_bits ?? "0"),
    existed: Boolean(row.existed)
  };
}

export async function saveVerificationPermissionBackup(
  backup: VerificationPermissionBackup
): Promise<void> {
  await db.run(`
    INSERT INTO verification_permission_backups (
      guild_id, channel_id, target_id, target_type, allow_bits, deny_bits, existed
    ) VALUES (@guildId, @channelId, @targetId, @targetType, @allow, @deny, @existed)
    ON CONFLICT (guild_id, channel_id, target_id) DO NOTHING
  `, {
    ...backup,
    existed: Number(backup.existed)
  });
}

export async function listVerificationPermissionBackups(
  guildId: string
): Promise<VerificationPermissionBackup[]> {
  const rows = await db.all<Record<string, unknown>>(`
    SELECT * FROM verification_permission_backups
    WHERE guild_id = ?
    ORDER BY channel_id, target_id
  `, [guildId]);
  return rows.map((row) => ({
    guildId,
    channelId: String(row.channel_id),
    targetId: String(row.target_id),
    targetType: Number(row.target_type) === 1 ? 1 : 0,
    allow: String(row.allow_bits ?? "0"),
    deny: String(row.deny_bits ?? "0"),
    existed: Boolean(row.existed)
  }));
}

export async function clearVerificationPermissionBackups(guildId: string): Promise<void> {
  await db.run("DELETE FROM verification_permission_backups WHERE guild_id = ?", [guildId]);
}

export async function deleteVerificationPermissionBackup(
  guildId: string,
  channelId: string,
  targetId: string
): Promise<void> {
  await db.run(`
    DELETE FROM verification_permission_backups
    WHERE guild_id = ? AND channel_id = ? AND target_id = ?
  `, [guildId, channelId, targetId]);
}

export async function createVerificationLink(
  guildId: string,
  tokenHash: string,
  expiresAt: string
): Promise<void> {
  await db.run(
    "INSERT INTO verification_links (guild_id, token_hash, expires_at) VALUES (?, ?, ?)",
    [guildId, tokenHash, expiresAt]
  );
}

export async function getVerificationLink(tokenHash: string): Promise<{ guildId: string; expiresAt: string } | null> {
  const row = await db.get<Record<string, unknown>>(
    "SELECT guild_id, expires_at FROM verification_links WHERE token_hash = ? AND expires_at > CURRENT_TIMESTAMP",
    [tokenHash]
  );
  return row ? { guildId: String(row.guild_id), expiresAt: String(row.expires_at) } : null;
}

export async function createVerificationRecord(
  record: Omit<VerificationRecord, "id" | "verifiedAt" | "reviewedBy" | "reviewedAt" | "staffNote">
): Promise<void> {
  await db.run(`
    INSERT INTO verification_records (
      guild_id, user_id, status, reason_codes, risk_score,
      account_created_at, server_joined_at, vpn_detected, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    record.guildId,
    record.userId,
    record.status,
    JSON.stringify(record.reasonCodes),
    record.riskScore,
    record.accountCreatedAt,
    record.serverJoinedAt ?? null,
    record.vpnDetected === null ? null : Number(record.vpnDetected),
    record.expiresAt
  ]);
}

export async function listVerificationRecords(guildId: string, limit = 50): Promise<VerificationRecord[]> {
  await db.run("DELETE FROM verification_records WHERE expires_at <= CURRENT_TIMESTAMP");
  const rows = await db.all<Record<string, unknown>>(`
    SELECT * FROM verification_records
    WHERE guild_id = ?
    ORDER BY verified_at DESC
    LIMIT ?
  `, [guildId, limit]);
  return rows.map((row) => ({
    id: Number(row.id),
    guildId: String(row.guild_id),
    userId: String(row.user_id),
    status: row.status as VerificationRecord["status"],
    reasonCodes: parseJsonArray(row.reason_codes as string),
    riskScore: Number(row.risk_score ?? 0),
    accountCreatedAt: String(row.account_created_at ?? ""),
    serverJoinedAt: row.server_joined_at ? String(row.server_joined_at) : null,
    vpnDetected: row.vpn_detected === null || row.vpn_detected === undefined
      ? null
      : Boolean(row.vpn_detected),
    verifiedAt: String(row.verified_at),
    expiresAt: String(row.expires_at),
    reviewedBy: row.reviewed_by ? String(row.reviewed_by) : null,
    reviewedAt: row.reviewed_at ? String(row.reviewed_at) : null,
    staffNote: String(row.staff_note ?? "")
  }));
}

export async function updateVerificationRecordReview(input: {
  guildId: string;
  recordId: number;
  status: VerificationRecord["status"];
  reviewedBy: string;
  staffNote?: string;
}): Promise<VerificationRecord | null> {
  const row = await db.get<Record<string, unknown>>(`
    UPDATE verification_records SET
      status = @status,
      reviewed_by = @reviewedBy,
      reviewed_at = CURRENT_TIMESTAMP,
      staff_note = @staffNote
    WHERE id = @recordId AND guild_id = @guildId
    RETURNING *
  `, {
    ...input,
    staffNote: input.staffNote ?? ""
  });
  if (!row) return null;
  return {
    id: Number(row.id),
    guildId: String(row.guild_id),
    userId: String(row.user_id),
    status: row.status as VerificationRecord["status"],
    reasonCodes: parseJsonArray(row.reason_codes as string),
    riskScore: Number(row.risk_score ?? 0),
    accountCreatedAt: String(row.account_created_at ?? ""),
    serverJoinedAt: row.server_joined_at ? String(row.server_joined_at) : null,
    vpnDetected: row.vpn_detected === null || row.vpn_detected === undefined
      ? null
      : Boolean(row.vpn_detected),
    verifiedAt: String(row.verified_at),
    expiresAt: String(row.expires_at),
    reviewedBy: row.reviewed_by ? String(row.reviewed_by) : null,
    reviewedAt: row.reviewed_at ? String(row.reviewed_at) : null,
    staffNote: String(row.staff_note ?? "")
  };
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

async function getRolePanelOptions(panelId: number): Promise<RolePanelOption[]> {
  const rows = await db.all<Record<string, unknown>>(
    `SELECT role_id AS "roleId", label, description, emoji, category,
      required_role_id AS "requiredRoleId"
     FROM role_panel_roles WHERE panel_id = ? ORDER BY sort_order, role_id`,
    [panelId]
  );
  return rows.map((row) => ({
    roleId: String(row.roleId),
    label: String(row.label ?? ""),
    description: String(row.description ?? ""),
    emoji: String(row.emoji ?? ""),
    category: String(row.category ?? "General") || "General",
    requiredRoleId: row.requiredRoleId ? String(row.requiredRoleId) : null
  }));
}

async function mapRolePanel(row: Record<string, unknown>): Promise<RolePanel> {
  const options = await getRolePanelOptions(Number(row.id));
  return {
    id: Number(row.id),
    guildId: row.guild_id as string,
    name: row.name as string,
    channelId: row.channel_id as string | null,
    layout: ((row.layout as RolePanel["layout"]) ?? "buttons") === "dropdown" ? "dropdown" : "buttons",
    title: row.title as string,
    description: row.description as string,
    color: row.color as string,
    active: Boolean(row.active),
    maxSelectedPerCategory: Number(row.max_selected_per_category ?? 0),
    removeRoleOnSelect: Boolean(row.remove_role_on_select),
    requiredRoleId: row.required_role_id as string | null,
    messageId: row.message_id as string | null,
    logChannelId: row.log_channel_id as string | null,
    options,
    roleIds: options.map((option) => option.roleId),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

export async function listRolePanels(guildId: string): Promise<RolePanel[]> {
  const rows = await db.all<Record<string, unknown>>(
    "SELECT * FROM role_panels WHERE guild_id = ? ORDER BY name",
    [guildId]
  );
  return Promise.all(rows.map(mapRolePanel));
}

export async function getRolePanel(id: number, guildId: string): Promise<RolePanel | null> {
  const row = await db.get<Record<string, unknown>>(
    "SELECT * FROM role_panels WHERE id = ? AND guild_id = ?",
    [id, guildId]
  );
  return row ? mapRolePanel(row) : null;
}

async function saveRolePanelRoles(panelId: number, options: RolePanelOption[]): Promise<void> {
  await db.run("DELETE FROM role_panel_roles WHERE panel_id = ?", [panelId]);
  for (const [index, option] of options.entries()) {
    await db.run(
      `INSERT INTO role_panel_roles (
        panel_id, role_id, sort_order, label, description, emoji, category, required_role_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        panelId,
        option.roleId,
        index,
        option.label,
        option.description,
        option.emoji,
        option.category || "General",
        option.requiredRoleId
      ]
    );
  }
}

export async function createRolePanel(
  input: Omit<RolePanel, "id" | "createdAt" | "updatedAt">
): Promise<RolePanel> {
  const id = await db.transaction(async () => {
    const row = await db.get<{ id: number }>(`
      INSERT INTO role_panels (
        guild_id, name, channel_id, layout, title, description, color, active,
        max_selected_per_category, remove_role_on_select, required_role_id,
        message_id, log_channel_id
      ) VALUES (
        @guildId, @name, @channelId, @layout, @title, @description, @color, @active,
        @maxSelectedPerCategory, @removeRoleOnSelect, @requiredRoleId,
        @messageId, @logChannelId
      ) RETURNING id
    `, {
      ...input,
      active: Number(input.active),
      removeRoleOnSelect: Number(input.removeRoleOnSelect),
      messageId: input.messageId ?? null,
      logChannelId: input.logChannelId ?? null
    });
    const panelId = Number(row!.id);
    await saveRolePanelRoles(panelId, input.options.length
      ? input.options
      : input.roleIds.map((roleId) => ({
        roleId,
        label: "",
        description: "",
        emoji: "",
        category: "General",
        requiredRoleId: null
      })));
    return panelId;
  });
  return (await getRolePanel(id, input.guildId))!;
}

export async function updateRolePanel(
  id: number,
  guildId: string,
  input: Omit<RolePanel, "id" | "guildId" | "createdAt" | "updatedAt">
): Promise<RolePanel | null> {
  const changed = await db.transaction(async () => {
    const result = await db.run(`
      UPDATE role_panels SET
        name = @name, channel_id = @channelId, layout = @layout, title = @title,
        description = @description, color = @color, active = @active,
        max_selected_per_category = @maxSelectedPerCategory,
        remove_role_on_select = @removeRoleOnSelect,
        required_role_id = @requiredRoleId,
        message_id = @messageId,
        log_channel_id = @logChannelId,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = @id AND guild_id = @guildId
    `, {
      ...input,
      id,
      guildId,
      active: Number(input.active),
      removeRoleOnSelect: Number(input.removeRoleOnSelect),
      messageId: input.messageId ?? null,
      logChannelId: input.logChannelId ?? null
    });
    if (!result.changes) return false;
    await saveRolePanelRoles(id, input.options.length
      ? input.options
      : input.roleIds.map((roleId) => ({
        roleId,
        label: "",
        description: "",
        emoji: "",
        category: "General",
        requiredRoleId: null
      })));
    return true;
  });
  return changed ? getRolePanel(id, guildId) : null;
}

export async function deleteRolePanel(id: number, guildId: string): Promise<boolean> {
  return (await db.run("DELETE FROM role_panels WHERE id = ? AND guild_id = ?", [id, guildId])).changes > 0;
}

function mapStickyMessage(row: Record<string, unknown>): StickyMessage {
  return {
    id: Number(row.id),
    guildId: row.guild_id as string,
    channelId: row.channel_id as string,
    content: row.content as string,
    enabled: Boolean(row.enabled),
    minIntervalSeconds: Number(row.min_interval_seconds ?? 30),
    lastMessageId: row.last_message_id as string | null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

export async function listStickyMessages(guildId: string): Promise<StickyMessage[]> {
  return (await db.all<Record<string, unknown>>(
    "SELECT * FROM sticky_messages WHERE guild_id = ? ORDER BY id DESC",
    [guildId]
  )).map(mapStickyMessage);
}

export async function getStickyMessageByChannel(guildId: string, channelId: string): Promise<StickyMessage | null> {
  const row = await db.get<Record<string, unknown>>(
    "SELECT * FROM sticky_messages WHERE guild_id = ? AND channel_id = ?",
    [guildId, channelId]
  );
  return row ? mapStickyMessage(row) : null;
}

export async function createStickyMessage(
  input: Omit<StickyMessage, "id" | "lastMessageId" | "createdAt" | "updatedAt">
): Promise<StickyMessage> {
  const row = await db.get<Record<string, unknown>>(`
    INSERT INTO sticky_messages (
      guild_id, channel_id, content, enabled, min_interval_seconds
    ) VALUES (
      @guildId, @channelId, @content, @enabled, @minIntervalSeconds
    ) RETURNING *
  `, { ...input, enabled: Number(input.enabled) });
  return mapStickyMessage(row!);
}

export async function updateStickyMessage(
  id: number,
  guildId: string,
  input: Omit<StickyMessage, "id" | "guildId" | "lastMessageId" | "createdAt" | "updatedAt">
): Promise<StickyMessage | null> {
  const row = await db.get<Record<string, unknown>>(`
    UPDATE sticky_messages SET
      channel_id = @channelId, content = @content, enabled = @enabled,
      min_interval_seconds = @minIntervalSeconds, updated_at = CURRENT_TIMESTAMP
    WHERE id = @id AND guild_id = @guildId RETURNING *
  `, { ...input, id, guildId, enabled: Number(input.enabled) });
  return row ? mapStickyMessage(row) : null;
}

export async function updateStickyMessageLastMessage(
  id: number,
  guildId: string,
  lastMessageId: string | null
): Promise<void> {
  await db.run(
    "UPDATE sticky_messages SET last_message_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND guild_id = ?",
    [lastMessageId, id, guildId]
  );
}

export async function deleteStickyMessage(id: number, guildId: string): Promise<boolean> {
  return (await db.run("DELETE FROM sticky_messages WHERE id = ? AND guild_id = ?", [id, guildId])).changes > 0;
}

function mapScheduledAnnouncement(row: Record<string, unknown>): ScheduledAnnouncement {
  return {
    id: Number(row.id),
    guildId: row.guild_id as string,
    name: row.name as string,
    announcementTemplateId: Number(row.announcement_template_id),
    channelId: row.channel_id as string,
    pingType: row.ping_type as ScheduledAnnouncement["pingType"],
    scheduleType: row.schedule_type as ScheduledAnnouncement["scheduleType"],
    nextRunAt: String(row.next_run_at),
    intervalMinutes: row.interval_minutes === null ? null : Number(row.interval_minutes),
    enabled: Boolean(row.enabled),
    lastRunAt: row.last_run_at ? String(row.last_run_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

export async function listScheduledAnnouncements(guildId: string): Promise<ScheduledAnnouncement[]> {
  return (await db.all<Record<string, unknown>>(
    "SELECT * FROM scheduled_announcements WHERE guild_id = ? ORDER BY next_run_at, name",
    [guildId]
  )).map(mapScheduledAnnouncement);
}

export async function getScheduledAnnouncement(id: number, guildId: string): Promise<ScheduledAnnouncement | null> {
  const row = await db.get<Record<string, unknown>>(
    "SELECT * FROM scheduled_announcements WHERE id = ? AND guild_id = ?",
    [id, guildId]
  );
  return row ? mapScheduledAnnouncement(row) : null;
}

export async function createScheduledAnnouncement(
  input: Omit<ScheduledAnnouncement, "id" | "lastRunAt" | "createdAt" | "updatedAt">
): Promise<ScheduledAnnouncement> {
  const row = await db.get<Record<string, unknown>>(`
    INSERT INTO scheduled_announcements (
      guild_id, name, announcement_template_id, channel_id, ping_type,
      schedule_type, next_run_at, interval_minutes, enabled
    ) VALUES (
      @guildId, @name, @announcementTemplateId, @channelId, @pingType,
      @scheduleType, @nextRunAt, @intervalMinutes, @enabled
    ) RETURNING *
  `, { ...input, enabled: Number(input.enabled) });
  return mapScheduledAnnouncement(row!);
}

export async function updateScheduledAnnouncement(
  id: number,
  guildId: string,
  input: Omit<ScheduledAnnouncement, "id" | "guildId" | "lastRunAt" | "createdAt" | "updatedAt">
): Promise<ScheduledAnnouncement | null> {
  const row = await db.get<Record<string, unknown>>(`
    UPDATE scheduled_announcements SET
      name = @name, announcement_template_id = @announcementTemplateId,
      channel_id = @channelId, ping_type = @pingType,
      schedule_type = @scheduleType, next_run_at = @nextRunAt,
      interval_minutes = @intervalMinutes, enabled = @enabled,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = @id AND guild_id = @guildId RETURNING *
  `, { ...input, id, guildId, enabled: Number(input.enabled) });
  return row ? mapScheduledAnnouncement(row) : null;
}

export async function deleteScheduledAnnouncement(id: number, guildId: string): Promise<boolean> {
  return (await db.run(
    "DELETE FROM scheduled_announcements WHERE id = ? AND guild_id = ?",
    [id, guildId]
  )).changes > 0;
}

export async function listDueScheduledAnnouncements(): Promise<ScheduledAnnouncement[]> {
  const sql = db.dialect === "postgres"
    ? "SELECT * FROM scheduled_announcements WHERE enabled = 1 AND next_run_at <= CURRENT_TIMESTAMP ORDER BY next_run_at"
    : "SELECT * FROM scheduled_announcements WHERE enabled = 1 AND datetime(next_run_at) <= CURRENT_TIMESTAMP ORDER BY datetime(next_run_at)";
  return (await db.all<Record<string, unknown>>(sql)).map(mapScheduledAnnouncement);
}

export async function markScheduledAnnouncementRun(
  schedule: ScheduledAnnouncement,
  nextRunAt: string | null
): Promise<void> {
  await db.run(`
    UPDATE scheduled_announcements SET
      last_run_at = CURRENT_TIMESTAMP, next_run_at = COALESCE(@nextRunAt, next_run_at),
      enabled = @enabled, updated_at = CURRENT_TIMESTAMP
    WHERE id = @id AND guild_id = @guildId
  `, {
    id: schedule.id,
    guildId: schedule.guildId,
    nextRunAt,
    enabled: Number(Boolean(nextRunAt))
  });
}

function mapTicketCloseRequest(row: Record<string, unknown>): TicketCloseRequest {
  return {
    id: Number(row.id),
    guildId: (row.guildId ?? row.guild_id) as string,
    ticketId: Number(row.ticketId ?? row.ticket_id),
    requestedBy: (row.requestedBy ?? row.requested_by) as string,
    requestSource: ((row.requestSource ?? row.request_source) as TicketCloseRequest["requestSource"]) ?? "community",
    reason: row.reason as string,
    status: row.status as TicketCloseRequest["status"],
    createdAt: String(row.createdAt ?? row.created_at),
    resolvedAt: (row.resolvedAt ?? row.resolved_at) ? String(row.resolvedAt ?? row.resolved_at) : null,
    resolvedBy: (row.resolvedBy ?? row.resolved_by) as string | null
  };
}

export async function createCloseRequest(input: Omit<TicketCloseRequest, "id" | "createdAt" | "resolvedAt" | "resolvedBy" | "status">): Promise<TicketCloseRequest | null> {
  const existing = await getPendingCloseRequestForTicket(input.guildId, input.ticketId);
  if (existing) return null;

  let row: Record<string, unknown> | undefined;
  try {
    row = await db.get<Record<string, unknown>>(`
      INSERT INTO ticket_close_requests (
        guild_id, ticket_id, requested_by, request_source, reason, status
      )
      VALUES (
        @guildId, @ticketId, @requestedBy, @requestSource, @reason, 'pending'
      ) RETURNING *
    `, input);
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    const message = error instanceof Error ? error.message : "";
    if (code === "23505" || message.includes("UNIQUE constraint failed")) return null;
    throw error;
  }
  return mapTicketCloseRequest(row!);
}

export async function listTicketCloseRequests(guildId: string, limit = 100) {
  const rows = await db.all<Record<string, unknown>>(`
    SELECT requests.id, requests.ticket_id AS "ticketId",
      requests.requested_by AS "requestedBy", requests.request_source AS "requestSource",
      requests.reason, requests.status,
      requests.created_at AS "createdAt", requests.resolved_at AS "resolvedAt",
      requests.resolved_by AS "resolvedBy", tickets.channel_id AS "channelId",
      tickets.user_id AS "ticketOwnerId", ticket_types.label AS "typeLabel"
    FROM ticket_close_requests requests
    JOIN tickets ON tickets.id = requests.ticket_id
    LEFT JOIN ticket_types ON ticket_types.id = tickets.ticket_type_id
    WHERE requests.guild_id = ?
    ORDER BY requests.id DESC LIMIT ?
  `, [guildId, limit]);
  return rows.map((row) => ({
    ...row,
    id: Number(row.id),
    ticketId: Number(row.ticketId),
    createdAt: String(row.createdAt),
    resolvedAt: row.resolvedAt ? String(row.resolvedAt) : null
  }));
}

export async function getPendingCloseRequests(guildId: string): Promise<TicketCloseRequest[]> {
  const rows = await db.all<Record<string, unknown>>(`
    SELECT id, guild_id AS guildId, ticket_id AS ticketId, requested_by AS requestedBy,
      request_source AS requestSource, reason, status, created_at AS createdAt,
      resolved_at AS resolvedAt, resolved_by AS resolvedBy
    FROM ticket_close_requests WHERE guild_id = ? AND status = 'pending' ORDER BY id DESC
  `, [guildId]);
  return rows.map(mapTicketCloseRequest);
}

export async function getPendingCloseRequestForTicket(guildId: string, ticketId: number): Promise<TicketCloseRequest | null> {
  const row = await db.get<Record<string, unknown>>(`
    SELECT id, guild_id AS guildId, ticket_id AS ticketId, requested_by AS requestedBy,
      request_source AS requestSource, reason, status, created_at AS createdAt,
      resolved_at AS resolvedAt, resolved_by AS resolvedBy
    FROM ticket_close_requests
    WHERE guild_id = ? AND ticket_id = ? AND status = 'pending'
  `, [guildId, ticketId]);
  if (!row) return null;
  return mapTicketCloseRequest(row);
}

export async function getTicketCloseRequest(id: number, guildId: string): Promise<TicketCloseRequest | null> {
  const row = await db.get<Record<string, unknown>>(`
    SELECT id, guild_id AS guildId, ticket_id AS ticketId, requested_by AS requestedBy,
      request_source AS requestSource, reason, status, created_at AS createdAt,
      resolved_at AS resolvedAt, resolved_by AS resolvedBy
    FROM ticket_close_requests WHERE id = ? AND guild_id = ?
  `, [id, guildId]);
  if (!row) return null;
  return mapTicketCloseRequest(row);
}

export async function resolveCloseRequest(id: number, guildId: string, resolvedBy: string, status: "approved" | "denied"): Promise<boolean> {
  return (await db.run(`
    UPDATE ticket_close_requests SET status = ?, resolved_by = ?, resolved_at = CURRENT_TIMESTAMP
    WHERE id = ? AND guild_id = ? AND status = 'pending'
  `, [status, resolvedBy, id, guildId])).changes > 0;
}
