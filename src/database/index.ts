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
  DmSettings,
  GuildSettings,
  LoggingSettings,
  Giveaway,
  GiveawayEntry,
  ModerationCase,
  Poll,
  PollOption,
  PollVote,
  RolePanel,
  RolePanelCategoryRule,
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
import { decryptSecret, encryptSecret, hashPassword, maskSecret, secretStorageStatus } from "../shared/secrets.js";
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

export interface AppSetupPublic {
  setupComplete: boolean;
  dashboardName: string;
  botDisplayName: string;
  supportServerName: string;
  discordClientId: string;
  discordClientSecretConfigured: boolean;
  discordClientSecretMasked: string;
  discordTokenConfigured: boolean;
  discordTokenMasked: string;
  discordGuildId: string;
  publicBaseUrl: string;
  verifyPublicBaseUrl: string;
  discordOauthRedirectUri: string;
  adminUserIds: string[];
  encryptionReady: boolean;
  encryptionSource: "environment" | "local-file" | "missing";
  encryptionMessage: string;
  setupCompletedAt: string | null;
  updatedAt: string | null;
}

export interface RuntimeAppConfig {
  setupComplete: boolean;
  dashboardName: string;
  botDisplayName: string;
  supportServerName: string;
  discordToken: string;
  discordClientId: string;
  discordClientSecret: string;
  discordGuildId: string;
  publicBaseUrl: string;
  verifyPublicBaseUrl: string;
  discordOauthRedirectUri: string;
  dashboardPassword: string;
  dashboardPasswordHash: string;
  adminUserIds: string[];
  secretError: string | null;
}

export interface SaveAppSetupInput {
  dashboardName: string;
  botDisplayName: string;
  supportServerName?: string;
  discordToken: string;
  discordClientId: string;
  discordClientSecret?: string;
  discordGuildId?: string;
  publicBaseUrl?: string;
  verifyPublicBaseUrl?: string;
  discordOauthRedirectUri?: string;
  dashboardPassword: string;
  adminUserIds?: string[];
}

function envValue(name: string): string {
  return typeof process.env[name] === "string" ? process.env[name]!.trim() : "";
}

async function ensureAppSetupRow(): Promise<void> {
  await db.run("INSERT INTO app_setup (id) VALUES (1) ON CONFLICT (id) DO NOTHING");
}

async function getAppSetupRow(): Promise<Record<string, unknown>> {
  await ensureAppSetupRow();
  return (await db.get<Record<string, unknown>>("SELECT * FROM app_setup WHERE id = 1"))!;
}

function setupCompleteFrom(row: Record<string, unknown>): boolean {
  return Boolean(
    row.setup_completed_at
    || (envValue("DISCORD_TOKEN") && envValue("DISCORD_CLIENT_ID") && envValue("DASHBOARD_PASSWORD"))
    || (row.discord_token_encrypted && row.discord_client_id && row.dashboard_password_hash)
  );
}

function decryptStoredSecret(row: Record<string, unknown>, key: string): { value: string; error: string | null } {
  const encrypted = String(row[key] ?? "");
  if (!encrypted) return { value: "", error: null };
  try {
    return { value: decryptSecret(encrypted), error: null };
  } catch {
    return {
      value: "",
      error: "A stored setup secret could not be decrypted. Check SETUP_SECRET_KEY."
    };
  }
}

export async function getAppSetup(): Promise<AppSetupPublic> {
  const row = await getAppSetupRow();
  const storage = secretStorageStatus();
  const envToken = envValue("DISCORD_TOKEN");
  const envClientSecret = envValue("DISCORD_CLIENT_SECRET");
  return {
    setupComplete: setupCompleteFrom(row),
    dashboardName: String(row.dashboard_name ?? "Bot Dashboard"),
    botDisplayName: String(row.bot_display_name ?? "Discord Bot"),
    supportServerName: String(row.support_server_name ?? ""),
    discordClientId: envValue("DISCORD_CLIENT_ID") || String(row.discord_client_id ?? ""),
    discordClientSecretConfigured: Boolean(envClientSecret || row.discord_client_secret_encrypted),
    discordClientSecretMasked: envClientSecret ? maskSecret(envClientSecret) : (row.discord_client_secret_last4 ? `••••••••${row.discord_client_secret_last4}` : ""),
    discordTokenConfigured: Boolean(envToken || row.discord_token_encrypted),
    discordTokenMasked: envToken ? maskSecret(envToken) : (row.discord_token_last4 ? `••••••••${row.discord_token_last4}` : ""),
    discordGuildId: envValue("DISCORD_GUILD_ID") || String(row.discord_guild_id ?? ""),
    publicBaseUrl: envValue("PUBLIC_BASE_URL") || String(row.public_base_url ?? ""),
    verifyPublicBaseUrl: envValue("VERIFY_PUBLIC_BASE_URL") || String(row.verify_public_base_url ?? ""),
    discordOauthRedirectUri: envValue("DISCORD_OAUTH_REDIRECT_URI") || String(row.discord_oauth_redirect_uri ?? ""),
    adminUserIds: parseJsonArray(String(row.admin_user_ids ?? "[]")),
    encryptionReady: storage.ready,
    encryptionSource: storage.source,
    encryptionMessage: storage.message,
    setupCompletedAt: row.setup_completed_at ? String(row.setup_completed_at) : null,
    updatedAt: row.updated_at ? String(row.updated_at) : null
  };
}

export async function getRuntimeAppConfig(): Promise<RuntimeAppConfig> {
  const row = await getAppSetupRow();
  const token = decryptStoredSecret(row, "discord_token_encrypted");
  const clientSecret = decryptStoredSecret(row, "discord_client_secret_encrypted");
  return {
    setupComplete: setupCompleteFrom(row),
    dashboardName: String(row.dashboard_name ?? "Bot Dashboard"),
    botDisplayName: String(row.bot_display_name ?? "Discord Bot"),
    supportServerName: String(row.support_server_name ?? ""),
    discordToken: envValue("DISCORD_TOKEN") || token.value,
    discordClientId: envValue("DISCORD_CLIENT_ID") || String(row.discord_client_id ?? ""),
    discordClientSecret: envValue("DISCORD_CLIENT_SECRET") || clientSecret.value,
    discordGuildId: envValue("DISCORD_GUILD_ID") || String(row.discord_guild_id ?? ""),
    publicBaseUrl: envValue("PUBLIC_BASE_URL") || String(row.public_base_url ?? ""),
    verifyPublicBaseUrl: envValue("VERIFY_PUBLIC_BASE_URL") || String(row.verify_public_base_url ?? ""),
    discordOauthRedirectUri: envValue("DISCORD_OAUTH_REDIRECT_URI") || String(row.discord_oauth_redirect_uri ?? ""),
    dashboardPassword: envValue("DASHBOARD_PASSWORD"),
    dashboardPasswordHash: String(row.dashboard_password_hash ?? ""),
    adminUserIds: parseJsonArray(String(row.admin_user_ids ?? "[]")),
    secretError: token.error || clientSecret.error
  };
}

export async function saveAppSetup(input: SaveAppSetupInput): Promise<AppSetupPublic> {
  await ensureAppSetupRow();
  const token = input.discordToken.trim();
  const clientSecret = input.discordClientSecret?.trim() ?? "";
  await db.run(`
    UPDATE app_setup SET
      dashboard_name = @dashboardName,
      bot_display_name = @botDisplayName,
      support_server_name = @supportServerName,
      discord_client_id = @discordClientId,
      discord_client_secret_encrypted = @discordClientSecretEncrypted,
      discord_client_secret_last4 = @discordClientSecretLast4,
      discord_token_encrypted = @discordTokenEncrypted,
      discord_token_last4 = @discordTokenLast4,
      discord_guild_id = @discordGuildId,
      public_base_url = @publicBaseUrl,
      verify_public_base_url = @verifyPublicBaseUrl,
      discord_oauth_redirect_uri = @discordOauthRedirectUri,
      dashboard_password_hash = @dashboardPasswordHash,
      admin_user_ids = @adminUserIds,
      setup_completed_at = COALESCE(setup_completed_at, CURRENT_TIMESTAMP),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = 1
  `, {
    dashboardName: input.dashboardName.trim(),
    botDisplayName: input.botDisplayName.trim(),
    supportServerName: input.supportServerName?.trim() ?? "",
    discordClientId: input.discordClientId.trim(),
    discordClientSecretEncrypted: clientSecret ? encryptSecret(clientSecret) : "",
    discordClientSecretLast4: clientSecret.slice(-4),
    discordTokenEncrypted: encryptSecret(token),
    discordTokenLast4: token.slice(-4),
    discordGuildId: input.discordGuildId?.trim() ?? "",
    publicBaseUrl: input.publicBaseUrl?.trim() ?? "",
    verifyPublicBaseUrl: input.verifyPublicBaseUrl?.trim() ?? "",
    discordOauthRedirectUri: input.discordOauthRedirectUri?.trim() ?? "",
    dashboardPasswordHash: hashPassword(input.dashboardPassword),
    adminUserIds: JSON.stringify(input.adminUserIds ?? [])
  });
  return getAppSetup();
}

export async function replaceDiscordToken(discordToken: string): Promise<AppSetupPublic> {
  await ensureAppSetupRow();
  const token = discordToken.trim();
  await db.run(`
    UPDATE app_setup SET
      discord_token_encrypted = @discordTokenEncrypted,
      discord_token_last4 = @discordTokenLast4,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = 1
  `, {
    discordTokenEncrypted: encryptSecret(token),
    discordTokenLast4: token.slice(-4)
  });
  return getAppSetup();
}

export async function resetAppSetup(): Promise<AppSetupPublic> {
  await db.run("DELETE FROM app_setup WHERE id = 1");
  await ensureAppSetupRow();
  return getAppSetup();
}

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
  await db.run("INSERT INTO dm_settings (guild_id) VALUES (?) ON CONFLICT (guild_id) DO NOTHING", [guildId]);
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

function mapDmSettings(row: Record<string, unknown>): DmSettings {
  return {
    guildId: String(row.guild_id ?? row.guildId),
    dmCommandEnabled: row.dm_command_enabled === undefined ? true : Boolean(row.dm_command_enabled),
    dmCommandLogContent: Boolean(row.dm_command_log_content),
    dmCommandRateLimitSeconds: Number(row.dm_command_rate_limit_seconds ?? 30),
    moderationDmEnabled: Boolean(row.moderation_dm_enabled),
    dmOnWarn: row.dm_on_warn === undefined ? true : Boolean(row.dm_on_warn),
    dmOnTimeout: row.dm_on_timeout === undefined ? true : Boolean(row.dm_on_timeout),
    dmOnKick: row.dm_on_kick === undefined ? true : Boolean(row.dm_on_kick),
    dmOnBan: row.dm_on_ban === undefined ? true : Boolean(row.dm_on_ban),
    dmOnUnban: Boolean(row.dm_on_unban),
    dmOnManualCase: Boolean(row.dm_on_manual_case),
    moderationDmTemplate: String(row.moderation_dm_template ?? "You received a moderation action in {server}: {action}. Reason: {reason}. Case: {case}. {duration}"),
    moderationAppealMessage: String(row.moderation_appeal_message ?? ""),
    giveawayWinnerDmEnabled: row.giveaway_winner_dm_enabled === undefined ? true : Boolean(row.giveaway_winner_dm_enabled),
    giveawayDefaultWinnerDmMessage: String(row.giveaway_default_winner_dm_message ?? "You won the giveaway in {serverName}: {prize}. Please contact staff or check the giveaway channel for next steps.")
  };
}

export async function getDmSettings(guildId: string): Promise<DmSettings> {
  await ensureGuildRows(guildId);
  const row = (await db.get<Record<string, unknown>>(
    "SELECT * FROM dm_settings WHERE guild_id = ?",
    [guildId]
  ))!;
  return mapDmSettings(row);
}

export async function saveDmSettings(settings: DmSettings): Promise<DmSettings> {
  await ensureGuildRows(settings.guildId);
  await db.run(`
    UPDATE dm_settings SET
      dm_command_enabled = @dmCommandEnabled,
      dm_command_log_content = @dmCommandLogContent,
      dm_command_rate_limit_seconds = @dmCommandRateLimitSeconds,
      moderation_dm_enabled = @moderationDmEnabled,
      dm_on_warn = @dmOnWarn,
      dm_on_timeout = @dmOnTimeout,
      dm_on_kick = @dmOnKick,
      dm_on_ban = @dmOnBan,
      dm_on_unban = @dmOnUnban,
      dm_on_manual_case = @dmOnManualCase,
      moderation_dm_template = @moderationDmTemplate,
      moderation_appeal_message = @moderationAppealMessage,
      giveaway_winner_dm_enabled = @giveawayWinnerDmEnabled,
      giveaway_default_winner_dm_message = @giveawayDefaultWinnerDmMessage,
      updated_at = CURRENT_TIMESTAMP
    WHERE guild_id = @guildId
  `, {
    ...settings,
    dmCommandEnabled: Number(settings.dmCommandEnabled),
    dmCommandLogContent: Number(settings.dmCommandLogContent),
    moderationDmEnabled: Number(settings.moderationDmEnabled),
    dmOnWarn: Number(settings.dmOnWarn),
    dmOnTimeout: Number(settings.dmOnTimeout),
    dmOnKick: Number(settings.dmOnKick),
    dmOnBan: Number(settings.dmOnBan),
    dmOnUnban: Number(settings.dmOnUnban),
    dmOnManualCase: Number(settings.dmOnManualCase),
    giveawayWinnerDmEnabled: Number(settings.giveawayWinnerDmEnabled)
  });
  return getDmSettings(settings.guildId);
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
  priority: string;
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
      priority,
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
      tickets.status, tickets.priority, tickets.claimed_by AS "claimedBy",
      tickets.close_reason AS "closeReason", tickets.opened_at AS "openedAt",
      tickets.closed_at AS "closedAt", tickets.closed_by AS "closedBy",
      ticket_types.label AS "typeLabel"
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
    targetTag: String(row.target_tag ?? row.targetTag ?? ""),
    moderatorId: String(row.moderator_id ?? row.moderatorId),
    moderatorTag: String(row.moderator_tag ?? row.moderatorTag ?? ""),
    actionType: String(row.action_type ?? row.actionType),
    reason: String(row.reason ?? ""),
    durationSeconds: row.duration_seconds === null || row.duration_seconds === undefined
      ? null
      : Number(row.duration_seconds),
    expiresAt: row.expires_at || row.expiresAt ? String(row.expires_at ?? row.expiresAt) : null,
    evidenceUrl: String(row.evidence_url ?? row.evidenceUrl ?? ""),
    status: (row.status as ModerationCase["status"]) ?? "active",
    notes: String(row.notes ?? ""),
    auditLogExecutorId: row.audit_log_executor_id || row.auditLogExecutorId ? String(row.audit_log_executor_id ?? row.auditLogExecutorId) : null,
    auditLogExecutorTag: String(row.audit_log_executor_tag ?? row.auditLogExecutorTag ?? ""),
    createdAt: String(row.created_at ?? row.createdAt),
    updatedAt: String(row.updated_at ?? row.updatedAt)
  };
}

export async function createModerationCase(input: {
  guildId: string;
  targetUserId: string;
  targetTag?: string;
  moderatorId: string;
  moderatorTag?: string;
  actionType: string;
  reason?: string;
  durationSeconds?: number | null;
  expiresAt?: string | null;
  evidenceUrl?: string;
  status?: ModerationCase["status"];
  notes?: string;
  auditLogExecutorId?: string | null;
  auditLogExecutorTag?: string;
}): Promise<ModerationCase> {
  await ensureGuildRows(input.guildId);
  const row = await db.get<Record<string, unknown>>(`
    INSERT INTO moderation_cases (
      guild_id, case_number, target_user_id, target_tag, moderator_id, moderator_tag, action_type,
      reason, duration_seconds, expires_at, evidence_url, status, notes,
      audit_log_executor_id, audit_log_executor_tag
    ) VALUES (
      @guildId,
      COALESCE((SELECT MAX(case_number) + 1 FROM moderation_cases WHERE guild_id = @guildId), 1),
      @targetUserId, @targetTag, @moderatorId, @moderatorTag, @actionType,
      @reason, @durationSeconds, @expiresAt, @evidenceUrl, @status, @notes,
      @auditLogExecutorId, @auditLogExecutorTag
    ) RETURNING *
  `, {
    ...input,
    targetTag: input.targetTag ?? "",
    moderatorTag: input.moderatorTag ?? "",
    reason: input.reason ?? "",
    durationSeconds: input.durationSeconds ?? null,
    expiresAt: input.expiresAt ?? null,
    evidenceUrl: input.evidenceUrl ?? "",
    status: input.status ?? "active",
    notes: input.notes ?? "",
    auditLogExecutorId: input.auditLogExecutorId ?? null,
    auditLogExecutorTag: input.auditLogExecutorTag ?? ""
  });
  return mapModerationCase(row!);
}

export async function listModerationCases(
  guildId: string,
  filters: {
    caseNumber?: number;
    query?: string;
    targetUserId?: string;
    moderatorId?: string;
    actionType?: string;
    status?: string;
    limit?: number;
  } = {}
): Promise<ModerationCase[]> {
  const clauses = ["guild_id = ?"];
  const params: unknown[] = [guildId];
  if (filters.caseNumber) {
    clauses.push("case_number = ?");
    params.push(filters.caseNumber);
  }
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
  const query = filters.query?.trim();
  if (query) {
    const like = `%${query.toLowerCase()}%`;
    const queryClauses = [
      "LOWER(target_user_id) LIKE ?",
      "LOWER(target_tag) LIKE ?",
      "LOWER(moderator_id) LIKE ?",
      "LOWER(moderator_tag) LIKE ?",
      "LOWER(reason) LIKE ?",
      "LOWER(notes) LIKE ?"
    ];
    params.push(like, like, like, like, like, like);
    const numeric = Number.parseInt(query.replace(/^#/, ""), 10);
    if (Number.isFinite(numeric)) {
      queryClauses.push("case_number = ?");
      params.push(numeric);
    }
    clauses.push(`(${queryClauses.join(" OR ")})`);
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
    startsAt: row.starts_at || row.startsAt ? String(row.starts_at ?? row.startsAt) : null,
    endsAt: String(row.ends_at ?? row.endsAt),
    hostUserId: row.host_user_id || row.hostUserId ? String(row.host_user_id ?? row.hostUserId) : null,
    requiredRoleId: row.required_role_id || row.requiredRoleId ? String(row.required_role_id ?? row.requiredRoleId) : null,
    boosterBonusEntries: Number(row.booster_bonus_entries ?? row.boosterBonusEntries ?? 0),
    bonusRoleId: row.bonus_role_id || row.bonusRoleId ? String(row.bonus_role_id ?? row.bonusRoleId) : null,
    bonusRoleEntries: Number(row.bonus_role_entries ?? row.bonusRoleEntries ?? 0),
    winnerRoleId: row.winner_role_id || row.winnerRoleId ? String(row.winner_role_id ?? row.winnerRoleId) : null,
    winnerDmMessage: String(row.winner_dm_message ?? row.winnerDmMessage ?? ""),
    createMessage: String(row.create_message ?? row.createMessage ?? ""),
    imageUrl: String(row.image_url ?? row.imageUrl ?? ""),
    thumbnailUrl: String(row.thumbnail_url ?? row.thumbnailUrl ?? ""),
    buttonText: String(row.button_text ?? row.buttonText ?? "Enter Giveaway"),
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
      starts_at, ends_at, host_user_id, required_role_id, booster_bonus_entries, bonus_role_id,
      bonus_role_entries, winner_role_id, winner_dm_message, create_message, image_url,
      thumbnail_url, button_text, status, winner_user_ids, created_by
    ) VALUES (
      @guildId, @channelId, @messageId, @prize, @description, @winnersCount,
      @startsAt, @endsAt, @hostUserId, @requiredRoleId, @boosterBonusEntries, @bonusRoleId,
      @bonusRoleEntries, @winnerRoleId, @winnerDmMessage, @createMessage, @imageUrl,
      @thumbnailUrl, @buttonText, @status, @winnerUserIds, @createdBy
    ) RETURNING *
  `, {
    ...input,
    messageId: input.messageId ?? null,
    startsAt: input.startsAt ?? null,
    hostUserId: input.hostUserId ?? null,
    winnerRoleId: input.winnerRoleId ?? null,
    winnerDmMessage: input.winnerDmMessage ?? "",
    createMessage: input.createMessage ?? "",
    imageUrl: input.imageUrl ?? "",
    thumbnailUrl: input.thumbnailUrl ?? "",
    buttonText: input.buttonText || "Enter Giveaway",
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
      description = @description, winners_count = @winnersCount, starts_at = @startsAt,
      ends_at = @endsAt, host_user_id = @hostUserId,
      required_role_id = @requiredRoleId, booster_bonus_entries = @boosterBonusEntries,
      bonus_role_id = @bonusRoleId, bonus_role_entries = @bonusRoleEntries,
      winner_role_id = @winnerRoleId, winner_dm_message = @winnerDmMessage,
      create_message = @createMessage, image_url = @imageUrl, thumbnail_url = @thumbnailUrl,
      button_text = @buttonText,
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
    "SELECT * FROM giveaways WHERE guild_id = ? ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'scheduled' THEN 1 WHEN 'draft' THEN 2 ELSE 3 END, COALESCE(starts_at, ends_at, updated_at) DESC LIMIT ?",
    [guildId, limit]
  );
  return rows.map(mapGiveaway);
}

export async function listDueGiveaways(): Promise<Giveaway[]> {
  const sql = db.dialect === "postgres"
    ? `SELECT * FROM giveaways
       WHERE (status = 'scheduled' AND starts_at IS NOT NULL AND starts_at <= CURRENT_TIMESTAMP)
          OR (status = 'active' AND ends_at <= CURRENT_TIMESTAMP)
       ORDER BY COALESCE(starts_at, ends_at)`
    : `SELECT * FROM giveaways
       WHERE (status = 'scheduled' AND starts_at IS NOT NULL AND datetime(starts_at) <= CURRENT_TIMESTAMP)
          OR (status = 'active' AND datetime(ends_at) <= CURRENT_TIMESTAMP)
       ORDER BY datetime(COALESCE(starts_at, ends_at))`;
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

function parsePollOptions(value: string | null): PollOption[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item, index): PollOption | null => {
        if (typeof item === "string") {
          const text = item.trim();
          return text ? { id: String(index + 1), label: text, text, description: "", emoji: "" } : null;
        }
        if (!item || typeof item !== "object" || Array.isArray(item)) return null;
        const candidate = item as Record<string, unknown>;
        const id = typeof candidate.id === "string" && candidate.id.trim()
          ? candidate.id.trim()
          : String(index + 1);
        const label = typeof candidate.label === "string" && candidate.label.trim()
          ? candidate.label.trim()
          : typeof candidate.text === "string"
            ? candidate.text.trim()
            : "";
        const text = typeof candidate.text === "string" && candidate.text.trim()
          ? candidate.text.trim()
          : label;
        const description = typeof candidate.description === "string" ? candidate.description.trim() : "";
        const emoji = typeof candidate.emoji === "string" ? candidate.emoji.trim() : "";
        return label ? { id, label, text, description, emoji } : null;
      })
      .filter((item): item is PollOption => Boolean(item));
  } catch {
    return [];
  }
}

function mapPoll(row: Record<string, unknown>): Poll {
  return {
    id: Number(row.id),
    guildId: String(row.guild_id ?? row.guildId),
    channelId: String(row.channel_id ?? row.channelId),
    messageId: row.message_id || row.messageId ? String(row.message_id ?? row.messageId) : null,
    title: String(row.title ?? ""),
    question: String(row.question ?? ""),
    options: parsePollOptions(row.options_json as string | null),
    startsAt: row.starts_at || row.startsAt ? String(row.starts_at ?? row.startsAt) : null,
    endsAt: row.ends_at || row.endsAt ? String(row.ends_at ?? row.endsAt) : null,
    anonymous: Boolean(row.anonymous),
    multipleChoice: Boolean(row.multiple_choice ?? row.multipleChoice),
    requiredRoleId: row.required_role_id || row.requiredRoleId ? String(row.required_role_id ?? row.requiredRoleId) : null,
    showLiveResults: row.show_live_results === undefined ? true : Boolean(row.show_live_results ?? row.showLiveResults),
    resultsVisibility: (row.results_visibility as Poll["resultsVisibility"]) ?? "public",
    status: (row.status as Poll["status"]) ?? "draft",
    createdBy: String(row.created_by ?? row.createdBy),
    createdAt: String(row.created_at ?? row.createdAt),
    updatedAt: String(row.updated_at ?? row.updatedAt)
  };
}

export async function createPoll(input: Omit<Poll, "id" | "messageId" | "createdAt" | "updatedAt"> & {
  messageId?: string | null;
}): Promise<Poll> {
  await ensureGuildRows(input.guildId);
  const row = await db.get<Record<string, unknown>>(`
    INSERT INTO polls (
      guild_id, channel_id, message_id, title, question, options_json, starts_at, ends_at,
      anonymous, multiple_choice, required_role_id, show_live_results, results_visibility, status, created_by
    ) VALUES (
      @guildId, @channelId, @messageId, @title, @question, @optionsJson, @startsAt, @endsAt,
      @anonymous, @multipleChoice, @requiredRoleId, @showLiveResults, @resultsVisibility, @status, @createdBy
    ) RETURNING *
  `, {
    ...input,
    messageId: input.messageId ?? null,
    title: input.title ?? "",
    startsAt: input.startsAt ?? null,
    optionsJson: JSON.stringify(input.options),
    anonymous: Number(input.anonymous),
    multipleChoice: Number(input.multipleChoice),
    showLiveResults: Number(input.showLiveResults),
    resultsVisibility: input.resultsVisibility ?? "public"
  });
  return mapPoll(row!);
}

export async function updatePoll(
  id: number,
  guildId: string,
  input: Partial<Omit<Poll, "id" | "guildId" | "createdAt" | "updatedAt">>
): Promise<Poll | null> {
  const current = await getPoll(id, guildId);
  if (!current) return null;
  const next = { ...current, ...input };
  const row = await db.get<Record<string, unknown>>(`
    UPDATE polls SET
      channel_id = @channelId, message_id = @messageId, title = @title, question = @question,
      options_json = @optionsJson, starts_at = @startsAt, ends_at = @endsAt, anonymous = @anonymous,
      multiple_choice = @multipleChoice, required_role_id = @requiredRoleId,
      show_live_results = @showLiveResults, results_visibility = @resultsVisibility,
      status = @status, updated_at = CURRENT_TIMESTAMP
    WHERE id = @id AND guild_id = @guildId
    RETURNING *
  `, {
    ...next,
    id,
    guildId,
    optionsJson: JSON.stringify(next.options),
    anonymous: Number(next.anonymous),
    multipleChoice: Number(next.multipleChoice),
    showLiveResults: Number(next.showLiveResults)
  });
  return row ? mapPoll(row) : null;
}

export async function getPoll(id: number, guildId: string): Promise<Poll | null> {
  const row = await db.get<Record<string, unknown>>(
    "SELECT * FROM polls WHERE id = ? AND guild_id = ?",
    [id, guildId]
  );
  return row ? mapPoll(row) : null;
}

export async function listPolls(guildId: string, limit = 100): Promise<Poll[]> {
  const rows = await db.all<Record<string, unknown>>(
    "SELECT * FROM polls WHERE guild_id = ? ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'scheduled' THEN 1 WHEN 'draft' THEN 2 ELSE 3 END, COALESCE(starts_at, ends_at, updated_at) DESC LIMIT ?",
    [guildId, limit]
  );
  return rows.map(mapPoll);
}

export async function listDuePolls(): Promise<Poll[]> {
  const sql = db.dialect === "postgres"
    ? `SELECT * FROM polls
       WHERE (status = 'scheduled' AND starts_at IS NOT NULL AND starts_at <= CURRENT_TIMESTAMP)
          OR (status = 'active' AND ends_at IS NOT NULL AND ends_at <= CURRENT_TIMESTAMP)
       ORDER BY COALESCE(starts_at, ends_at)`
    : `SELECT * FROM polls
       WHERE (status = 'scheduled' AND starts_at IS NOT NULL AND datetime(starts_at) <= CURRENT_TIMESTAMP)
          OR (status = 'active' AND ends_at IS NOT NULL AND datetime(ends_at) <= CURRENT_TIMESTAMP)
       ORDER BY datetime(COALESCE(starts_at, ends_at))`;
  return (await db.all<Record<string, unknown>>(sql)).map(mapPoll);
}

export async function upsertPollVote(input: PollVote): Promise<void> {
  await db.run(`
    INSERT INTO poll_votes (poll_id, guild_id, user_id, option_ids)
    VALUES (@pollId, @guildId, @userId, @optionIds)
    ON CONFLICT (poll_id, user_id) DO UPDATE SET
      option_ids = excluded.option_ids,
      updated_at = CURRENT_TIMESTAMP
  `, {
    ...input,
    optionIds: JSON.stringify(input.optionIds)
  });
}

export async function listPollVotes(pollId: number, guildId: string): Promise<PollVote[]> {
  const rows = await db.all<Record<string, unknown>>(
    "SELECT * FROM poll_votes WHERE poll_id = ? AND guild_id = ? ORDER BY updated_at",
    [pollId, guildId]
  );
  return rows.map((row) => ({
    pollId: Number(row.poll_id),
    guildId: String(row.guild_id),
    userId: String(row.user_id),
    optionIds: parseJsonArray(row.option_ids as string | null),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  }));
}

export async function createTicketTranscript(
  input: Omit<TicketTranscript, "id" | "createdAt">
): Promise<TicketTranscript> {
  const row = await db.get<Record<string, unknown>>(`
    INSERT INTO ticket_transcripts (
      guild_id, ticket_id, channel_id, channel_name, opener_id, closed_by,
      close_reason, opened_at, closed_at, category_label, claimed_by, priority,
      message_count, transcript_json, transcript_text
    ) VALUES (
      @guildId, @ticketId, @channelId, @channelName, @openerId, @closedBy,
      @closeReason, @openedAt, @closedAt, @categoryLabel, @claimedBy, @priority,
      @messageCount, @transcriptJson, @transcriptText
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
    return parsed
      .filter((item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === "object" && !Array.isArray(item)
      )
      .map((item) => ({
        id: String(item.id ?? ""),
        authorId: String(item.authorId ?? ""),
        authorTag: String(item.authorTag ?? "Unknown user"),
        createdAt: String(item.createdAt ?? ""),
        content: String(item.content ?? ""),
        attachments: Array.isArray(item.attachments)
          ? item.attachments.map((attachment) => {
            if (typeof attachment === "string") {
              return { name: attachment.split("/").pop() || "Attachment", url: attachment, contentType: null, size: null };
            }
            const record = attachment as Record<string, unknown>;
            return {
              name: String(record.name ?? "Attachment"),
              url: String(record.url ?? ""),
              contentType: record.contentType === null || record.contentType === undefined ? null : String(record.contentType),
              size: typeof record.size === "number" ? record.size : null
            };
          }).filter((attachment) => attachment.url)
          : [],
        embeds: Number(item.embeds ?? 0),
        embedSummaries: Array.isArray(item.embedSummaries)
          ? item.embedSummaries.map((embed) => {
            const record = embed as Record<string, unknown>;
            return {
              title: String(record.title ?? ""),
              description: String(record.description ?? ""),
              url: String(record.url ?? ""),
              fields: Array.isArray(record.fields)
                ? record.fields.map((field) => {
                  const fieldRecord = field as Record<string, unknown>;
                  return {
                    name: String(fieldRecord.name ?? ""),
                    value: String(fieldRecord.value ?? ""),
                    inline: Boolean(fieldRecord.inline)
                  };
                })
                : []
            };
          })
          : []
      }));
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
    openedAt: row.opened_at || row.openedAt ? String(row.opened_at ?? row.openedAt) : null,
    closedAt: row.closed_at || row.closedAt ? String(row.closed_at ?? row.closedAt) : null,
    categoryLabel: String(row.category_label ?? row.categoryLabel ?? ""),
    claimedBy: row.claimed_by || row.claimedBy ? String(row.claimed_by ?? row.claimedBy) : null,
    priority: String(row.priority ?? "normal"),
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
    autoKickUnverified: Boolean(row.auto_kick_unverified),
    autoKickAfterHours: Number(row.auto_kick_after_hours ?? 24),
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
      auto_kick_unverified = @autoKickUnverified,
      auto_kick_after_hours = @autoKickAfterHours,
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
    autoKickUnverified: Number(settings.autoKickUnverified),
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

function mapVerificationRecord(row: Record<string, unknown>): VerificationRecord {
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

export async function createVerificationRecord(
  record: Omit<VerificationRecord, "id" | "verifiedAt" | "reviewedBy" | "reviewedAt" | "staffNote"> & {
    verifiedAt?: string;
    reviewedBy?: string | null;
    reviewedAt?: string | null;
    staffNote?: string;
  }
): Promise<VerificationRecord> {
  const row = await db.get<Record<string, unknown>>(`
    INSERT INTO verification_records (
      guild_id, user_id, status, reason_codes, risk_score,
      account_created_at, server_joined_at, vpn_detected, verified_at,
      expires_at, reviewed_by, reviewed_at, staff_note
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING *
  `, [
    record.guildId,
    record.userId,
    record.status,
    JSON.stringify(record.reasonCodes),
    record.riskScore,
    record.accountCreatedAt,
    record.serverJoinedAt ?? null,
    record.vpnDetected === null ? null : Number(record.vpnDetected),
    record.verifiedAt ?? new Date().toISOString(),
    record.expiresAt,
    record.reviewedBy ?? null,
    record.reviewedAt ?? null,
    record.staffNote ?? ""
  ]);
  if (!row) throw new Error("Verification record could not be created.");
  return mapVerificationRecord(row);
}

export async function listVerificationRecords(guildId: string, limit = 50): Promise<VerificationRecord[]> {
  await db.run("DELETE FROM verification_records WHERE expires_at <= CURRENT_TIMESTAMP");
  const rows = await db.all<Record<string, unknown>>(`
    SELECT * FROM verification_records
    WHERE guild_id = ?
    ORDER BY verified_at DESC
    LIMIT ?
  `, [guildId, limit]);
  return rows.map(mapVerificationRecord);
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
  return mapVerificationRecord(row);
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
      required_role_id AS "requiredRoleId", button_style AS "buttonStyle"
     FROM role_panel_roles WHERE panel_id = ? ORDER BY sort_order, role_id`,
    [panelId]
  );
  return rows.map((row) => ({
    roleId: String(row.roleId),
    label: String(row.label ?? ""),
    description: String(row.description ?? ""),
    emoji: String(row.emoji ?? ""),
    category: String(row.category ?? "General") || "General",
    requiredRoleId: row.requiredRoleId ? String(row.requiredRoleId) : null,
    buttonStyle: normalizeRolePanelButtonStyle(row.buttonStyle)
  }));
}

function normalizeRolePanelButtonStyle(value: unknown): RolePanel["buttonStyle"] | "" {
  return value === "primary" || value === "success" || value === "danger" || value === "secondary" ? value : "";
}

function normalizeRolePanelToggleMode(value: unknown): RolePanel["toggleMode"] {
  return value === "add_only" ? "add_only" : "toggle";
}

function parseRolePanelCategoryRules(value: string | null): RolePanelCategoryRule[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
      .map((item) => ({
        name: String(item.name ?? "General").trim() || "General",
        title: String(item.title ?? "").trim(),
        description: String(item.description ?? "").trim(),
        maxSelected: Math.max(0, Number(item.maxSelected ?? 0) || 0),
        removeRoleOnSelect: Boolean(item.removeRoleOnSelect)
      }));
  } catch {
    return [];
  }
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
    imageUrl: String(row.image_url ?? ""),
    thumbnailUrl: String(row.thumbnail_url ?? ""),
    active: Boolean(row.active),
    buttonStyle: normalizeRolePanelButtonStyle(row.button_style) || "secondary",
    toggleMode: normalizeRolePanelToggleMode(row.toggle_mode),
    maxSelectedPerCategory: Number(row.max_selected_per_category ?? 0),
    removeRoleOnSelect: Boolean(row.remove_role_on_select),
    requiredRoleId: row.required_role_id as string | null,
    messageId: row.message_id as string | null,
    logChannelId: row.log_channel_id as string | null,
    categoryRules: parseRolePanelCategoryRules(row.category_rules_json as string | null),
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
        panel_id, role_id, sort_order, label, description, emoji, category, required_role_id, button_style
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        panelId,
        option.roleId,
        index,
        option.label,
        option.description,
        option.emoji,
        option.category || "General",
        option.requiredRoleId,
        normalizeRolePanelButtonStyle(option.buttonStyle)
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
        image_url, thumbnail_url, button_style, toggle_mode,
        max_selected_per_category, remove_role_on_select, required_role_id,
        message_id, log_channel_id, category_rules_json
      ) VALUES (
        @guildId, @name, @channelId, @layout, @title, @description, @color, @active,
        @imageUrl, @thumbnailUrl, @buttonStyle, @toggleMode,
        @maxSelectedPerCategory, @removeRoleOnSelect, @requiredRoleId,
        @messageId, @logChannelId, @categoryRulesJson
      ) RETURNING id
    `, {
      ...input,
      active: Number(input.active),
      imageUrl: input.imageUrl ?? "",
      thumbnailUrl: input.thumbnailUrl ?? "",
      buttonStyle: normalizeRolePanelButtonStyle(input.buttonStyle) || "secondary",
      toggleMode: normalizeRolePanelToggleMode(input.toggleMode),
      removeRoleOnSelect: Number(input.removeRoleOnSelect),
      messageId: input.messageId ?? null,
      logChannelId: input.logChannelId ?? null,
      categoryRulesJson: JSON.stringify(input.categoryRules ?? [])
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
        requiredRoleId: null,
        buttonStyle: ""
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
        image_url = @imageUrl,
        thumbnail_url = @thumbnailUrl,
        button_style = @buttonStyle,
        toggle_mode = @toggleMode,
        max_selected_per_category = @maxSelectedPerCategory,
        remove_role_on_select = @removeRoleOnSelect,
        required_role_id = @requiredRoleId,
        message_id = @messageId,
        log_channel_id = @logChannelId,
        category_rules_json = @categoryRulesJson,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = @id AND guild_id = @guildId
    `, {
      ...input,
      id,
      guildId,
      active: Number(input.active),
      imageUrl: input.imageUrl ?? "",
      thumbnailUrl: input.thumbnailUrl ?? "",
      buttonStyle: normalizeRolePanelButtonStyle(input.buttonStyle) || "secondary",
      toggleMode: normalizeRolePanelToggleMode(input.toggleMode),
      removeRoleOnSelect: Number(input.removeRoleOnSelect),
      messageId: input.messageId ?? null,
      logChannelId: input.logChannelId ?? null,
      categoryRulesJson: JSON.stringify(input.categoryRules ?? [])
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
        requiredRoleId: null,
        buttonStyle: ""
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
