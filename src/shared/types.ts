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

export interface LoggingSettings {
  guildId: string;
  enabled: boolean;
  channelId: string | null;
  members: boolean;
  messages: boolean;
  voice: boolean;
  channels: boolean;
  roles: boolean;
  server: boolean;
  invites: boolean;
  threads: boolean;
  moderation: boolean;
  dashboard: boolean;
}

export interface Branding {
  guildId: string;
  serverName: string;
  accentColor: string;
  ticketButtonStyle: "secondary" | "primary" | "success";
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
  autoRolesEnabled: boolean;
  autoRoleIds: string[];
  goodbyeEnabled: boolean;
  goodbyeChannelId: string | null;
  goodbyeContent: string;
  goodbyeEmbedEnabled: boolean;
  boostEnabled: boolean;
  boostChannelId: string | null;
  boostMessage: string;
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
  mentionSpamThreshold: number;
  mentionWindowSeconds: number;
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
  verificationChannelId: string | null;
  verificationChannelName: string;
  verificationEmbedMessageId: string | null;
  embedTitle: string;
  embedDescription: string;
  embedColor: string;
  buttonText: string;
  successMessage: string;
  failureMessage: string;
  action: "allow" | "flag" | "deny" | "assign_role";
  logChannelId: string | null;
  minAccountAgeDays: number;
  minServerDays: number;
  vpnCheckEnabled: boolean;
  vpnFailClosed: boolean;
  recordRetentionHours: number;
  publicChannelIds: string[];
  publicCategoryIds: string[];
  hiddenChannelIds: string[];
  hiddenCategoryIds: string[];
  lockAllChannels: boolean;
  autoCreateChannel: boolean;
  lockVerificationChannel: boolean;
  updateEmbedOnSetup: boolean;
  applyPermissionsImmediately: boolean;
  permissionsApplied: boolean;
  lastSetupAt: string | null;
  updatedBy: string | null;
}

export interface VerificationPermissionBackup {
  guildId: string;
  channelId: string;
  targetId: string;
  targetType: 0 | 1;
  allow: string;
  deny: string;
  existed: boolean;
}

export interface VerificationSetupResult {
  dryRun: boolean;
  verificationChannelId: string | null;
  verificationMessageId: string | null;
  verificationUrl: string;
  channelCreated: boolean;
  embedPosted: boolean;
  embedUpdated: boolean;
  permissionChangesPlanned: number;
  permissionsApplied: number;
  permissionsFailed: number;
  visibleChannelIds: string[];
  hiddenChannelIds: string[];
  skippedChannelIds: string[];
  warnings: string[];
  failures: Array<{ channelId: string; message: string }>;
}

export interface VerificationRecord {
  id: number;
  guildId: string;
  userId: string;
  status: "pending" | "passed" | "flagged" | "denied";
  reasonCodes: string[];
  riskScore: number;
  accountCreatedAt: string;
  serverJoinedAt: string | null;
  vpnDetected: boolean | null;
  verifiedAt: string;
  expiresAt: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  staffNote: string;
}

export interface RolePanelOption {
  roleId: string;
  label: string;
  description: string;
  emoji: string;
  category: string;
  requiredRoleId: string | null;
}

export interface RolePanel {
  id: number;
  guildId: string;
  name: string;
  channelId: string | null;
  layout: "buttons" | "dropdown";
  title: string;
  description: string;
  color: string;
  active: boolean;
  maxSelectedPerCategory: number;
  removeRoleOnSelect: boolean;
  requiredRoleId: string | null;
  messageId: string | null;
  logChannelId: string | null;
  options: RolePanelOption[];
  roleIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ModerationCase {
  id: number;
  guildId: string;
  caseNumber: number;
  targetUserId: string;
  moderatorId: string;
  actionType: "warn" | "timeout" | "untimeout" | "kick" | "ban" | "unban" | "clear" | "role_punishment" | "message_delete" | "manual" | string;
  reason: string;
  durationSeconds: number | null;
  evidenceUrl: string;
  status: "active" | "expired" | "reversed" | "deleted" | "resolved";
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface Giveaway {
  id: number;
  guildId: string;
  channelId: string;
  messageId: string | null;
  prize: string;
  description: string;
  winnersCount: number;
  endsAt: string;
  requiredRoleId: string | null;
  boosterBonusEntries: number;
  bonusRoleId: string | null;
  bonusRoleEntries: number;
  status: "draft" | "active" | "ended" | "cancelled";
  winnerUserIds: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface GiveawayEntry {
  giveawayId: number;
  guildId: string;
  userId: string;
  entries: number;
  createdAt: string;
}

export interface TicketTranscriptMessage {
  id: string;
  authorId: string;
  authorTag: string;
  createdAt: string;
  content: string;
  attachments: string[];
  embeds: number;
}

export interface TicketTranscript {
  id: number;
  guildId: string;
  ticketId: number;
  channelId: string;
  channelName: string;
  openerId: string;
  closedBy: string;
  closeReason: string;
  messageCount: number;
  transcriptJson: TicketTranscriptMessage[];
  transcriptText: string;
  createdAt: string;
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
