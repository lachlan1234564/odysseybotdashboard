export interface GuildSettings {
  guildId: string;
  modLogChannelId: string | null;
  announcementChannelId: string | null;
  ticketCategoryId: string | null;
  transcriptChannelId: string | null;
  staffRoleIds: string[];
  mutedRoleId: string | null;
  adminRoleIds: string[];
}

export interface Branding {
  guildId: string;
  serverName: string;
  footerText: string;
  ticketPanelTitle: string;
  ticketPanelDescription: string;
  ticketPanelColor: string;
  ticketPanelImageUrl: string;
  announcementDefaultColor: string;
  announcementDefaultImageUrl: string;
  announcementDefaultThumbnailUrl: string;
  embedIconUrl: string;
}

export type CustomCommandActionType =
  | "reply_message"
  | "reply_embed"
  | "send_channel"
  | "send_ephemeral"
  | "send_dm"
  | "add_role"
  | "remove_role"
  | "add_roles"
  | "remove_roles"
  | "toggle_role"
  | "post_ticket_panel"
  | "send_announcement"
  | "create_ticket"
  | "request_close_ticket"
  | "lock_channel"
  | "unlock_channel"
  | "rename_channel"
  | "move_channel"
  | "add_user_to_channel"
  | "remove_user_from_channel"
  | "timeout_user"
  | "remove_timeout"
  | "kick_user"
  | "ban_user"
  | "unban_user"
  | "purge_messages"
  | "require_role"
  | "require_permission"
  | "log_to_mod"
  | "action_sequence";

export interface EmbedFieldConfig {
  name: string;
  value: string;
  inline: boolean;
}

export interface EmbedConfig {
  content: string;
  title: string;
  titleUrl: string;
  description: string;
  color: string;
  authorName: string;
  authorIconUrl: string;
  authorUrl: string;
  imageUrl: string;
  thumbnailUrl: string;
  footerText: string;
  footerIconUrl: string;
  timestamp: boolean;
  fields: EmbedFieldConfig[];
}

export interface ActionSequenceItem {
  actionType: Exclude<CustomCommandActionType, "action_sequence">;
  content: string;
  targetChannelId: string | null;
  roleId: string | null;
  roleIds: string[];
  embed: EmbedConfig;
  targetUserId: string | null;
  durationMinutes: number | null;
  deleteMessageDays: number | null;
  amount: number | null;
  reason: string;
  logChannelId: string | null;
  newName: string;
  newCategoryId: string | null;
  pingType: "none" | "everyone" | "here";
}

export interface CustomCommandActionConfig {
  content: string;
  targetChannelId: string | null;
  roleId: string | null;
  roleIds: string[];
  ticketPanelId: number | null;
  announcementTemplateId: number | null;
  embed: EmbedConfig;
  targetUserId: string | null;
  durationMinutes: number | null;
  deleteMessageDays: number | null;
  amount: number | null;
  reason: string;
  logChannelId: string | null;
  newName: string;
  newCategoryId: string | null;
  pingType: "none" | "everyone" | "here";
  actionSequence: ActionSequenceItem[];
}

export interface CustomCommand {
  id: number;
  guildId: string;
  name: string;
  description: string;
  enabled: boolean;
  actionType: CustomCommandActionType;
  accessMode: "everyone" | "admins" | "roles" | "staff";
  allowedRoleIds: string[];
  blockedRoleIds: string[];
  allowedChannelIds: string[];
  blockedChannelIds: string[];
  cooldownType: "none" | "user" | "server";
  cooldownSeconds: number;
  replyVisibility: "public" | "private";
  deleteUsage: boolean;
  actionConfig: CustomCommandActionConfig;
  createdByUserId: string;
  updatedByUserId: string;
  response: string;
  ephemeral: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TicketType {
  id: number;
  guildId: string;
  label: string;
  description: string;
  emoji: string;
  staffRoleIds: string[];
  pingRoleIds: string[];
  allowedRoleIds: string[];
  blockedRoleIds: string[];
  categoryId: string | null;
  welcomeMessage: string;
  color: string;
  imageUrl: string;
  thumbnailUrl: string;
  footerText: string;
  footerIconUrl: string;
  transcriptChannelId: string | null;
  maxOpenTickets: number;
  namingFormat: string;
  claimButtonEnabled: boolean;
  closeButtonEnabled: boolean;
  closeReasonRequired: boolean;
  requestCloseEnabled: boolean;
  closeRequestDelaySeconds: number;
  autoCloseHours: number;
  active: boolean;
  sortOrder: number;
}

export interface TicketPanel {
  id: number;
  guildId: string;
  name: string;
  targetChannelId: string | null;
  title: string;
  description: string;
  color: string;
  imageUrl: string;
  thumbnailUrl: string;
  footerText: string;
  footerIconUrl: string;
  displayMode: "dropdown" | "buttons";
  dropdownPlaceholder: string;
  active: boolean;
  panelKind: "standard" | "multi";
  ticketTypeIds: number[];
  childPanelIds: number[];
  createdAt: string;
  updatedAt: string;
}

export interface AnnouncementTemplate {
  id: number;
  guildId: string;
  name: string;
  outputMode: "embed" | "plain";
  title: string;
  body: string;
  color: string;
  imageUrl: string;
  thumbnailUrl: string;
  footer: string;
  targetChannelId: string | null;
  pingType: "none" | "everyone" | "here";
  createdAt: string;
  updatedAt: string;
}

export const emptyEmbedConfig = (): EmbedConfig => ({
  content: "",
  title: "",
  titleUrl: "",
  description: "",
  color: "#5865F2",
  authorName: "",
  authorIconUrl: "",
  authorUrl: "",
  imageUrl: "",
  thumbnailUrl: "",
  footerText: "",
  footerIconUrl: "",
  timestamp: false,
  fields: []
});

export const emptyActionConfig = (): CustomCommandActionConfig => ({
  content: "",
  targetChannelId: null,
  roleId: null,
  roleIds: [],
  ticketPanelId: null,
  announcementTemplateId: null,
  embed: emptyEmbedConfig(),
  targetUserId: null,
  durationMinutes: null,
  deleteMessageDays: null,
  amount: null,
  reason: "",
  logChannelId: null,
  newName: "",
  newCategoryId: null,
  pingType: "none",
  actionSequence: []
});

export interface WelcomeSettings {
  guildId: string;
  enabled: boolean;
  channelId: string | null;
  dmEnabled: boolean;
  dmContent: string;
  dmEmbedEnabled: boolean;
  content: string;
  embedTitle: string;
  embedDescription: string;
  embedColor: string;
  embedImageUrl: string;
  embedThumbnailUrl: string;
  embedFooterText: string;
  autoRoleIds: string[];
}

export interface AntiRaidSettings {
  guildId: string;
  enabled: boolean;
  joinThreshold: number;
  timeWindowSeconds: number;
  action: "alert" | "lockdown" | "timeout_new" | "kick_suspicious" | "disable_invites";
  lockdownDurationSeconds: number;
  minAccountAgeDays: number;
  blockNoAvatar: boolean;
  bypassRoleIds: string[];
  bypassUserIds: string[];
  alertChannelId: string | null;
  logChannelId: string | null;
}

export interface AntiNukeSettings {
  guildId: string;
  enabled: boolean;
  channelDeleteThreshold: number;
  channelCreateThreshold: number;
  roleDeleteThreshold: number;
  roleCreateThreshold: number;
  banThreshold: number;
  kickThreshold: number;
  webhookThreshold: number;
  permissionThreshold: number;
  botAddThreshold: number;
  adminRoleThreshold: number;
  timeWindowSeconds: number;
  action: "alert" | "remove_roles" | "timeout_executor" | "kick_executor" | "ban_executor";
  alertChannelId: string | null;
  logChannelId: string | null;
}

export interface AntiNukeTrusted {
  id: number;
  guildId: string;
  userId: string | null;
  roleId: string | null;
}

export interface AntiRoleSettings {
  guildId: string;
  enabled: boolean;
  protectedRoleIds: string[];
  trustedUserIds: string[];
  trustedRoleIds: string[];
  action: "log" | "remove_permission" | "remove_role" | "timeout" | "kick" | "ban";
  massChangeThreshold: number;
  timeWindowSeconds: number;
  logChannelId: string | null;
}

export interface AutoModSettings {
  guildId: string;
  enabled: boolean;
  blockInvites: boolean;
  blockSuspiciousLinks: boolean;
  blockCaps: boolean;
  blockSpam: boolean;
  blockMassMentions: boolean;
  capsPercentage: number;
  spamThreshold: number;
  mentionThreshold: number;
  action: "delete" | "warn" | "timeout" | "log";
  timeoutMinutes: number;
  alwaysBlockDiscordInvites: boolean;
  linkChannelRules: Array<{
    channelId: string;
    allowedDomains: string[];
    blockedDomains: string[];
  }>;
  ignoredChannelIds: string[];
  ignoredRoleIds: string[];
  ignoredUserIds: string[];
  logChannelId: string | null;
}

export interface SocialPromotionSettings {
  guildId: string;
  outputMode: "embed" | "plain";
  title: string;
  description: string;
  color: string;
  thumbnailUrl: string;
  imageUrl: string;
  targetChannelId: string | null;
  links: Array<{ label: string; url: string }>;
  memberEntries: Array<{ label: string; url: string }>;
}

export interface VerificationSettings {
  guildId: string;
  enabled: boolean;
  verifiedRoleId: string | null;
  action: "allow" | "flag" | "deny" | "assign_role";
  logChannelId: string | null;
  minAccountAgeDays: number;
  minServerDays: number;
  vpnCheckEnabled: boolean;
  vpnFailClosed: boolean;
  deviceCheckEnabled: boolean;
  recordRetentionHours: number;
}

export interface VerificationRecord {
  id: number;
  guildId: string;
  userId: string;
  status: "passed" | "flagged" | "denied";
  reasonCodes: string[];
  riskScore: number;
  deviceHash: string | null;
  accountCreatedAt: string;
  serverJoinedAt: string | null;
  vpnDetected: boolean | null;
  verifiedAt: string;
  expiresAt: string;
}

export interface RolePanel {
  id: number;
  guildId: string;
  name: string;
  channelId: string | null;
  title: string;
  description: string;
  color: string;
  active: boolean;
  roleIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface StickyMessage {
  id: number;
  guildId: string;
  channelId: string;
  content: string;
  enabled: boolean;
  minIntervalSeconds: number;
  lastMessageId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduledAnnouncement {
  id: number;
  guildId: string;
  name: string;
  announcementTemplateId: number;
  channelId: string;
  pingType: "none" | "everyone" | "here";
  scheduleType: "once" | "repeat";
  nextRunAt: string;
  intervalMinutes: number | null;
  enabled: boolean;
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TicketCloseRequest {
  id: number;
  guildId: string;
  ticketId: number;
  requestedBy: string;
  requestSource: "staff" | "community";
  reason: string;
  status: "pending" | "approved" | "denied";
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
}
