import { ChatInputCommandInteraction, EmbedBuilder, PermissionFlagsBits, TextChannel, User } from "discord.js";
import type { ModerationCase } from "../shared/types.js";
import {
  addWarning,
  createModerationCase,
  getModerationCase,
  listModerationCases,
  listWarnings,
  updateModerationCase
} from "../database/index.js";
import { getTargetMember, logModeration } from "./utils.js";
import { deferCommandReply, replyEphemeral, replyToCommand } from "./interactions.js";
import { sendModerationDm } from "./dms.js";

const caseStatuses = ["active", "expired", "reversed", "deleted", "resolved"] as const;

function discordTimestamp(value: string): number {
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const withZone = /(?:Z|[+-]\d{2}(?::?\d{2})?)$/i.test(normalized) ? normalized : `${normalized}Z`;
  return Math.floor(new Date(withZone).getTime() / 1000);
}

function userTag(user: User): string {
  return user.tag || user.username;
}

function evidenceUrl(interaction: ChatInputCommandInteraction): string {
  return interaction.channelId ? `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}` : "";
}

function actionTitle(action: string): string {
  return action.split(/[_-]/).filter(Boolean).map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`).join(" ");
}

function statusColor(status: ModerationCase["status"]): number {
  if (status === "active") return 0xD0A65A;
  if (status === "resolved" || status === "expired") return 0x57D7A1;
  if (status === "reversed") return 0x8EA1FF;
  return 0xED4245;
}

function caseEmbed(item: ModerationCase): EmbedBuilder {
  const target = item.targetUserId
    ? `${item.targetTag || "Unknown user"} (<@${item.targetUserId}> / \`${item.targetUserId}\`)`
    : item.targetTag || "Unknown";
  const moderator = item.moderatorId
    ? `${item.moderatorTag || "Unknown moderator"} (<@${item.moderatorId}> / \`${item.moderatorId}\`)`
    : item.moderatorTag || "Unknown";
  const fields = [
    { name: "Action", value: actionTitle(item.actionType) || item.actionType, inline: true },
    { name: "Status", value: item.status, inline: true },
    { name: "Target", value: target.slice(0, 1024), inline: false },
    { name: "Moderator", value: moderator.slice(0, 1024), inline: false },
    { name: "Reason", value: item.reason || "No reason provided.", inline: false }
  ];
  if (item.durationSeconds) fields.push({ name: "Duration", value: `${Math.round(item.durationSeconds / 60)} minute(s)`, inline: true });
  if (item.expiresAt) fields.push({ name: "Expires", value: `<t:${discordTimestamp(item.expiresAt)}:R>`, inline: true });
  if (item.evidenceUrl) fields.push({ name: "Evidence", value: item.evidenceUrl.slice(0, 1024), inline: false });
  if (item.auditLogExecutorId || item.auditLogExecutorTag) {
    fields.push({
      name: "Audit executor",
      value: item.auditLogExecutorId
        ? `${item.auditLogExecutorTag || "Unknown"} (<@${item.auditLogExecutorId}> / \`${item.auditLogExecutorId}\`)`
        : item.auditLogExecutorTag || "Unknown",
      inline: false
    });
  }
  if (item.notes) fields.push({ name: "Staff notes", value: item.notes.slice(0, 1024), inline: false });

  return new EmbedBuilder()
    .setColor(statusColor(item.status))
    .setTitle(`Moderation Case #${item.caseNumber}`)
    .setDescription(`${actionTitle(item.actionType)} case for this server.`)
    .addFields(fields)
    .setFooter({ text: `Created ${item.createdAt} • Updated ${item.updatedAt}` })
    .setTimestamp();
}

function caseSummary(item: ModerationCase): string {
  const target = item.targetTag || item.targetUserId || "Unknown target";
  return `Case #${item.caseNumber} • ${item.actionType} • ${target} • ${item.status} • ${item.reason || "No reason"}`;
}

async function createCommandCase(
  interaction: ChatInputCommandInteraction,
  input: {
    targetUserId?: string;
    targetTag?: string;
    actionType: string;
    reason?: string;
    durationSeconds?: number | null;
    expiresAt?: string | null;
    evidenceUrl?: string;
    status?: ModerationCase["status"];
    notes?: string;
  }
): Promise<ModerationCase> {
  return createModerationCase({
    guildId: interaction.guildId!,
    targetUserId: input.targetUserId ?? "",
    targetTag: input.targetTag ?? "",
    moderatorId: interaction.user.id,
    moderatorTag: userTag(interaction.user),
    auditLogExecutorId: interaction.user.id,
    auditLogExecutorTag: userTag(interaction.user),
    actionType: input.actionType,
    reason: input.reason,
    durationSeconds: input.durationSeconds,
    expiresAt: input.expiresAt,
    evidenceUrl: input.evidenceUrl ?? evidenceUrl(interaction),
    status: input.status,
    notes: input.notes
  });
}

async function requireModerationPermission(interaction: ChatInputCommandInteraction, permission: bigint): Promise<boolean> {
  if (interaction.memberPermissions?.has(permission)) return true;
  await replyToCommand(interaction, {
    content: "You do not have the Discord permission required to use this moderation command."
  });
  return false;
}

export async function handleModeration(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId || !interaction.guild) {
    await replyEphemeral(interaction, "This command can only be used in a server.");
    return;
  }

  await deferCommandReply(interaction);
  const command = interaction.commandName;
  const requiredPermission = {
    warn: PermissionFlagsBits.ModerateMembers,
    warnings: PermissionFlagsBits.ModerateMembers,
    timeout: PermissionFlagsBits.ModerateMembers,
    untimeout: PermissionFlagsBits.ModerateMembers,
    kick: PermissionFlagsBits.KickMembers,
    ban: PermissionFlagsBits.BanMembers,
    unban: PermissionFlagsBits.BanMembers,
    clear: PermissionFlagsBits.ManageMessages
  }[command];
  if (!requiredPermission || !(await requireModerationPermission(interaction, requiredPermission))) return;

  if (command === "clear") {
    if (!(interaction.channel instanceof TextChannel)) {
      await replyToCommand(interaction, "This command requires a server text channel.");
      return;
    }
    const amount = interaction.options.getInteger("amount", true);
    const botMember = interaction.guild.members.me;
    if (!botMember || !interaction.channel.permissionsFor(botMember)?.has(PermissionFlagsBits.ManageMessages)) {
      await replyToCommand(interaction, "I need Manage Messages in this channel to clear messages.");
      return;
    }
    const deleted = await interaction.channel.bulkDelete(amount, true).catch(() => null);
    if (!deleted) {
      await replyToCommand(interaction, "I could not clear those messages. Messages older than 14 days cannot be bulk-deleted.");
      return;
    }
    const moderationCase = await createCommandCase(interaction, {
      targetTag: `#${interaction.channel.name}`,
      actionType: "message_delete",
      reason: `Bulk-cleared ${deleted.size} message(s).`,
      status: "resolved",
      notes: `Requested ${amount}; deleted ${deleted.size}.`
    });
    await logModeration({
      interaction,
      action: "message_delete",
      reason: `Bulk-cleared ${deleted.size} message(s).`,
      channelId: interaction.channelId,
      caseNumber: moderationCase.caseNumber,
      metadata: { requested: amount, deleted: deleted.size }
    });
    await replyToCommand(interaction, `Deleted ${deleted.size} recent messages. Case #${moderationCase.caseNumber}.`);
    return;
  }

  if (command === "unban") {
    const userId = interaction.options.getString("user_id", true).trim();
    if (!/^\d{17,20}$/.test(userId)) {
      await replyToCommand(interaction, "Enter a valid Discord user ID to unban.");
      return;
    }
    const reason = interaction.options.getString("reason")?.trim() || "No reason provided";
    const fetchedUser = await interaction.client.users.fetch(userId).catch(() => null);
    const unbanned = await interaction.guild.members.unban(userId, reason).then(() => true).catch(() => false);
    if (!unbanned) {
      await replyToCommand(interaction, "I could not unban that user. They may not be banned, or I may be missing Ban Members.");
      return;
    }
    const moderationCase = await createCommandCase(interaction, {
      targetUserId: userId,
      targetTag: fetchedUser ? userTag(fetchedUser) : "",
      actionType: "unban",
      reason,
      status: "resolved"
    });
    if (fetchedUser) {
      await sendModerationDm({
        guild: interaction.guild,
        user: fetchedUser,
        action: "unban",
        reason,
        caseNumber: moderationCase.caseNumber,
        moderatorTag: userTag(interaction.user),
        moderationCase
      }).catch(() => undefined);
    }
    await logModeration({
      interaction,
      action: "unban",
      targetUserId: userId,
      reason,
      channelId: interaction.channelId,
      caseNumber: moderationCase.caseNumber
    });
    await replyToCommand(interaction, `${fetchedUser ? userTag(fetchedUser) : userId} was unbanned. Case #${moderationCase.caseNumber}.`);
    return;
  }

  const member = await getTargetMember(interaction);
  const user = interaction.options.getUser("member", true);
  if (!["ban", "warnings"].includes(command) && !member) {
    await replyToCommand(interaction, "That member is not currently in the server.");
    return;
  }

  if (command === "warnings") {
    const warnings = await listWarnings(interaction.guildId, user.id, 10);
    const content = warnings.length
      ? warnings.map((warning) => `**#${warning.id}** • <t:${discordTimestamp(warning.createdAt)}:d> • ${warning.reason} • by <@${warning.moderatorId}>`).join("\n")
      : `${user} has no warnings.`;
    await replyToCommand(interaction, { content });
    return;
  }

  const reasonInput = interaction.options.getString("reason")?.trim() ?? "";
  const reason = reasonInput || "No reason provided";
  if (command === "warn" && !reasonInput) {
    await replyToCommand(interaction, "Add a clear warning reason before running this command.");
    return;
  }

  if (command === "warn") {
    const warningId = await addWarning({
      guildId: interaction.guildId,
      userId: user.id,
      moderatorId: interaction.user.id,
      reason
    });
    const moderationCase = await createCommandCase(interaction, {
      targetUserId: user.id,
      targetTag: userTag(user),
      actionType: "warn",
      reason,
      notes: `Warning #${warningId}`
    });
    await sendModerationDm({
      guild: interaction.guild,
      user,
      action: "warn",
      reason,
      caseNumber: moderationCase.caseNumber,
      moderatorTag: userTag(interaction.user),
      moderationCase
    }).catch(() => undefined);
    await logModeration({
      interaction,
      action: "warn",
      targetUserId: user.id,
      reason,
      channelId: interaction.channelId,
      caseNumber: moderationCase.caseNumber,
      metadata: { warningId }
    });
    await replyToCommand(interaction, `${user} was warned. Warning #${warningId}. Case #${moderationCase.caseNumber}.`);
    return;
  }

  if (command === "timeout" && member) {
    if (!member.moderatable) {
      await replyToCommand(interaction, "I cannot time out that member. Check role hierarchy and permissions.");
      return;
    }
    const minutes = interaction.options.getInteger("minutes", true);
    const durationSeconds = minutes * 60;
    const expiresAt = new Date(Date.now() + durationSeconds * 1000).toISOString();
    const timedOut = await member.timeout(durationSeconds * 1000, reason).then(() => true).catch(() => false);
    if (!timedOut) {
      await replyToCommand(interaction, "I could not time out that member. Check my permissions and role position.");
      return;
    }
    const moderationCase = await createCommandCase(interaction, {
      targetUserId: user.id,
      targetTag: userTag(user),
      actionType: "timeout",
      reason,
      durationSeconds,
      expiresAt
    });
    await sendModerationDm({
      guild: interaction.guild,
      user,
      action: "timeout",
      reason,
      caseNumber: moderationCase.caseNumber,
      durationSeconds,
      moderatorTag: userTag(interaction.user),
      moderationCase
    }).catch(() => undefined);
    await logModeration({
      interaction,
      action: "timeout",
      targetUserId: user.id,
      reason,
      channelId: interaction.channelId,
      caseNumber: moderationCase.caseNumber,
      durationSeconds,
      metadata: { minutes }
    });
    await replyToCommand(interaction, `${user} was timed out for ${minutes} minute(s). Case #${moderationCase.caseNumber}.`);
    return;
  }

  if (command === "untimeout" && member) {
    if (!member.moderatable) {
      await replyToCommand(interaction, "I cannot remove timeout from that member. Check role hierarchy and permissions.");
      return;
    }
    const cleared = await member.timeout(null, reason).then(() => true).catch(() => false);
    if (!cleared) {
      await replyToCommand(interaction, "I could not remove that timeout. Check my permissions and role position.");
      return;
    }
    const moderationCase = await createCommandCase(interaction, {
      targetUserId: user.id,
      targetTag: userTag(user),
      actionType: "untimeout",
      reason,
      status: "resolved"
    });
    await sendModerationDm({
      guild: interaction.guild,
      user,
      action: "untimeout",
      reason,
      caseNumber: moderationCase.caseNumber,
      moderatorTag: userTag(interaction.user),
      moderationCase
    }).catch(() => undefined);
    await logModeration({
      interaction,
      action: "untimeout",
      targetUserId: user.id,
      reason,
      channelId: interaction.channelId,
      caseNumber: moderationCase.caseNumber
    });
    await replyToCommand(interaction, `Removed timeout from ${user}. Case #${moderationCase.caseNumber}.`);
    return;
  }

  if (command === "kick" && member) {
    if (!member.kickable) {
      await replyToCommand(interaction, "I cannot kick that member. Check role hierarchy and permissions.");
      return;
    }
    const moderationCase = await createCommandCase(interaction, {
      targetUserId: user.id,
      targetTag: userTag(user),
      actionType: "kick",
      reason,
      status: "resolved"
    });
    await sendModerationDm({
      guild: interaction.guild,
      user,
      action: "kick",
      reason,
      caseNumber: moderationCase.caseNumber,
      moderatorTag: userTag(interaction.user),
      moderationCase
    }).catch(() => undefined);
    const kicked = await member.kick(reason).then(() => true).catch(() => false);
    if (!kicked) {
      await updateModerationCase(interaction.guildId, moderationCase.caseNumber, {
        status: "deleted",
        notes: "Kick failed after the case was created."
      });
      await replyToCommand(interaction, "I could not kick that member. Check my permissions and role position.");
      return;
    }
    await logModeration({
      interaction,
      action: "kick",
      targetUserId: user.id,
      reason,
      channelId: interaction.channelId,
      caseNumber: moderationCase.caseNumber
    });
    await replyToCommand(interaction, `${userTag(user)} was kicked. Case #${moderationCase.caseNumber}.`);
    return;
  }

  if (command === "ban") {
    const botMember = interaction.guild.members.me;
    if (!botMember?.permissions.has(PermissionFlagsBits.BanMembers)) {
      await replyToCommand(interaction, "I need Ban Members before I can ban users.");
      return;
    }
    if (member && !member.bannable) {
      await replyToCommand(interaction, "I cannot ban that member. Check role hierarchy and permissions.");
      return;
    }
    const deleteDays = interaction.options.getInteger("delete_days") ?? 0;
    const moderationCase = await createCommandCase(interaction, {
      targetUserId: user.id,
      targetTag: userTag(user),
      actionType: "ban",
      reason,
      notes: deleteDays ? `Deleted ${deleteDays} day(s) of messages.` : ""
    });
    await sendModerationDm({
      guild: interaction.guild,
      user,
      action: "ban",
      reason,
      caseNumber: moderationCase.caseNumber,
      moderatorTag: userTag(interaction.user),
      moderationCase
    }).catch(() => undefined);
    const banned = await interaction.guild.members.ban(user.id, {
      deleteMessageSeconds: deleteDays * 86_400,
      reason
    }).then(() => true).catch(() => false);
    if (!banned) {
      await updateModerationCase(interaction.guildId, moderationCase.caseNumber, {
        status: "deleted",
        notes: "Ban failed after the case was created."
      });
      await replyToCommand(interaction, "I could not ban that user. Check my permissions and role position.");
      return;
    }
    await logModeration({
      interaction,
      action: "ban",
      targetUserId: user.id,
      reason,
      channelId: interaction.channelId,
      caseNumber: moderationCase.caseNumber,
      metadata: { deleteDays }
    });
    await replyToCommand(interaction, `${userTag(user)} was banned. Case #${moderationCase.caseNumber}.`);
  }
}

export async function handleCaseCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId || !interaction.guild) {
    await replyEphemeral(interaction, "This command can only be used in a server.");
    return;
  }
  await deferCommandReply(interaction);
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ModerateMembers)) {
    await replyToCommand(interaction, "You need Moderate Members to manage moderation cases.");
    return;
  }

  const subcommand = interaction.options.getSubcommand();
  if (subcommand === "view") {
    const caseNumber = interaction.options.getInteger("number", true);
    const item = await getModerationCase(interaction.guildId, caseNumber);
    if (!item) {
      await replyToCommand(interaction, `Case #${caseNumber} was not found.`);
      return;
    }
    await replyToCommand(interaction, { embeds: [caseEmbed(item)] });
    return;
  }

  if (subcommand === "search") {
    const user = interaction.options.getUser("member");
    const moderator = interaction.options.getUser("moderator");
    const actionType = interaction.options.getString("action") ?? undefined;
    const status = interaction.options.getString("status") ?? undefined;
    const query = interaction.options.getString("query") ?? undefined;
    const caseNumber = interaction.options.getInteger("number") ?? undefined;
    const cases = await listModerationCases(interaction.guildId, {
      caseNumber,
      query,
      targetUserId: user?.id,
      moderatorId: moderator?.id,
      actionType,
      status,
      limit: 10
    });
    const embed = new EmbedBuilder()
      .setColor(0xD0A65A)
      .setTitle("Moderation Case Search")
      .setDescription(cases.length ? cases.map(caseSummary).join("\n").slice(0, 4000) : "No matching moderation cases found.")
      .setTimestamp();
    await replyToCommand(interaction, { embeds: [embed] });
    return;
  }

  if (subcommand === "create") {
    const user = interaction.options.getUser("member", true);
    const actionType = interaction.options.getString("action", true);
    const reason = interaction.options.getString("reason")?.trim() || "No reason provided";
    const durationMinutes = interaction.options.getInteger("duration_minutes");
    const evidence = interaction.options.getString("evidence")?.trim() || evidenceUrl(interaction);
    const status = (interaction.options.getString("status") ?? "active") as ModerationCase["status"];
    const item = await createCommandCase(interaction, {
      targetUserId: user.id,
      targetTag: userTag(user),
      actionType,
      reason,
      status,
      durationSeconds: durationMinutes ? durationMinutes * 60 : null,
      expiresAt: durationMinutes ? new Date(Date.now() + durationMinutes * 60_000).toISOString() : null,
      evidenceUrl: evidence
    });
    await sendModerationDm({
      guild: interaction.guild,
      user,
      action: "manual",
      reason,
      caseNumber: item.caseNumber,
      durationSeconds: durationMinutes ? durationMinutes * 60 : null,
      moderatorTag: userTag(interaction.user),
      moderationCase: item
    }).catch(() => undefined);
    await logModeration({
      interaction,
      action: "manual_case",
      targetUserId: user.id,
      reason,
      channelId: interaction.channelId,
      caseNumber: item.caseNumber,
      metadata: { caseNumber: item.caseNumber, actionType }
    });
    await replyToCommand(interaction, { content: `Created manual case #${item.caseNumber} for ${user}.`, embeds: [caseEmbed(item)] });
    return;
  }

  if (subcommand === "edit" || subcommand === "note") {
    const caseNumber = interaction.options.getInteger("number", true);
    const current = await getModerationCase(interaction.guildId, caseNumber);
    if (!current) {
      await replyToCommand(interaction, `Case #${caseNumber} was not found.`);
      return;
    }
    const reason = interaction.options.getString("reason") ?? undefined;
    const note = interaction.options.getString("note") ?? undefined;
    const status = interaction.options.getString("status") ?? undefined;
    const notes = note && subcommand === "note"
      ? `${current.notes ? `${current.notes}\n` : ""}[${new Date().toISOString()}] ${userTag(interaction.user)}: ${note}`
      : note;
    const item = await updateModerationCase(interaction.guildId, caseNumber, {
      reason,
      notes,
      status: caseStatuses.includes(status as ModerationCase["status"]) ? status as ModerationCase["status"] : undefined
    });
    await replyToCommand(interaction, item ? { content: `Updated case #${item.caseNumber}.`, embeds: [caseEmbed(item)] } : `Case #${caseNumber} was not found.`);
    return;
  }

  if (subcommand === "resolve") {
    const caseNumber = interaction.options.getInteger("number", true);
    const note = interaction.options.getString("note")?.trim();
    const current = await getModerationCase(interaction.guildId, caseNumber);
    if (!current) {
      await replyToCommand(interaction, `Case #${caseNumber} was not found.`);
      return;
    }
    const notes = note
      ? `${current.notes ? `${current.notes}\n` : ""}[${new Date().toISOString()}] ${userTag(interaction.user)} resolved: ${note}`
      : current.notes;
    const item = await updateModerationCase(interaction.guildId, caseNumber, { status: "resolved", notes });
    await replyToCommand(interaction, item ? { content: `Resolved case #${item.caseNumber}.`, embeds: [caseEmbed(item)] } : `Case #${caseNumber} was not found.`);
  }
}
