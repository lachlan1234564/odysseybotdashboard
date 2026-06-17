import { ChatInputCommandInteraction, PermissionFlagsBits, TextChannel } from "discord.js";
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

function discordTimestamp(value: string): number {
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const withZone = /(?:Z|[+-]\d{2}(?::?\d{2})?)$/i.test(normalized) ? normalized : `${normalized}Z`;
  return Math.floor(new Date(withZone).getTime() / 1000);
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
    kick: PermissionFlagsBits.KickMembers,
    ban: PermissionFlagsBits.BanMembers,
    clear: PermissionFlagsBits.ManageMessages
  }[command];
  if (!requiredPermission || !interaction.memberPermissions?.has(requiredPermission)) {
    await replyToCommand(interaction, {
      content: "You do not have the Discord permission required to use this moderation command."
    });
    return;
  }

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
    await replyToCommand(interaction, `Deleted ${deleted.size} recent messages.`);
    await logModeration({ interaction, action: "clear", channelId: interaction.channelId, metadata: { requested: amount, deleted: deleted.size } });
    return;
  }

  const member = await getTargetMember(interaction);
  const user = interaction.options.getUser("member", true);
  if (command !== "ban" && !member) {
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
    await logModeration({ interaction, action: "warn", targetUserId: user.id, reason, channelId: interaction.channelId, metadata: { warningId } });
    const moderationCase = await createModerationCase({
      guildId: interaction.guildId,
      targetUserId: user.id,
      moderatorId: interaction.user.id,
      actionType: "warn",
      reason,
      evidenceUrl: interaction.channelId ? `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}` : "",
      notes: `Warning #${warningId}`
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
    const timedOut = await member.timeout(minutes * 60_000, reason).then(() => true).catch(() => false);
    if (!timedOut) {
      await replyToCommand(interaction, "I could not time out that member. Check my permissions and role position.");
      return;
    }
    const moderationCase = await createModerationCase({
      guildId: interaction.guildId,
      targetUserId: user.id,
      moderatorId: interaction.user.id,
      actionType: "timeout",
      reason,
      durationSeconds: minutes * 60,
      evidenceUrl: interaction.channelId ? `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}` : ""
    });
    await replyToCommand(interaction, `${user} was timed out for ${minutes} minute(s). Case #${moderationCase.caseNumber}.`);
    await logModeration({ interaction, action: "timeout", targetUserId: user.id, reason, channelId: interaction.channelId, metadata: { minutes } });
    return;
  }

  if (command === "kick" && member) {
    if (!member.kickable) {
      await replyToCommand(interaction, "I cannot kick that member. Check role hierarchy and permissions.");
      return;
    }
    const kicked = await member.kick(reason).then(() => true).catch(() => false);
    if (!kicked) {
      await replyToCommand(interaction, "I could not kick that member. Check my permissions and role position.");
      return;
    }
    const moderationCase = await createModerationCase({
      guildId: interaction.guildId,
      targetUserId: user.id,
      moderatorId: interaction.user.id,
      actionType: "kick",
      reason,
      status: "resolved",
      evidenceUrl: interaction.channelId ? `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}` : ""
    });
    await replyToCommand(interaction, `${user.tag} was kicked. Case #${moderationCase.caseNumber}.`);
    await logModeration({ interaction, action: "kick", targetUserId: user.id, reason, channelId: interaction.channelId });
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
    const banned = await interaction.guild.members.ban(user.id, {
      deleteMessageSeconds: deleteDays * 86_400,
      reason
    }).then(() => true).catch(() => false);
    if (!banned) {
      await replyToCommand(interaction, "I could not ban that user. Check my permissions and role position.");
      return;
    }
    const moderationCase = await createModerationCase({
      guildId: interaction.guildId,
      targetUserId: user.id,
      moderatorId: interaction.user.id,
      actionType: "ban",
      reason,
      evidenceUrl: interaction.channelId ? `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}` : "",
      notes: deleteDays ? `Deleted ${deleteDays} day(s) of messages.` : ""
    });
    await replyToCommand(interaction, `${user.tag} was banned. Case #${moderationCase.caseNumber}.`);
    await logModeration({ interaction, action: "ban", targetUserId: user.id, reason, channelId: interaction.channelId, metadata: { deleteDays } });
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
    await replyToCommand(interaction, {
      content: [
        `**Case #${item.caseNumber}** • ${item.actionType} • ${item.status}`,
        `Target: <@${item.targetUserId}> (\`${item.targetUserId}\`)`,
        `Moderator: <@${item.moderatorId}>`,
        `Reason: ${item.reason || "No reason provided."}`,
        item.durationSeconds ? `Duration: ${Math.round(item.durationSeconds / 60)} minute(s)` : "",
        item.evidenceUrl ? `Evidence: ${item.evidenceUrl}` : "",
        item.notes ? `Notes: ${item.notes}` : ""
      ].filter(Boolean).join("\n")
    });
    return;
  }

  if (subcommand === "search") {
    const user = interaction.options.getUser("member");
    const actionType = interaction.options.getString("action") ?? undefined;
    const cases = await listModerationCases(interaction.guildId, {
      targetUserId: user?.id,
      actionType,
      limit: 10
    });
    await replyToCommand(interaction, {
      content: cases.length
        ? cases.map((item) => `#${item.caseNumber} • **${item.actionType}** • <@${item.targetUserId}> • ${item.status} • ${item.reason || "No reason"}`).join("\n")
        : "No matching moderation cases found."
    });
    return;
  }

  if (subcommand === "create") {
    const user = interaction.options.getUser("member", true);
    const actionType = interaction.options.getString("action", true);
    const reason = interaction.options.getString("reason")?.trim() || "No reason provided";
    const item = await createModerationCase({
      guildId: interaction.guildId,
      targetUserId: user.id,
      moderatorId: interaction.user.id,
      actionType,
      reason,
      status: "active",
      evidenceUrl: interaction.channelId ? `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}` : ""
    });
    await logModeration({ interaction, action: "manual_case", targetUserId: user.id, reason, channelId: interaction.channelId, metadata: { caseNumber: item.caseNumber, actionType } });
    await replyToCommand(interaction, `Created manual case #${item.caseNumber} for ${user}.`);
    return;
  }

  if (subcommand === "edit" || subcommand === "note") {
    const caseNumber = interaction.options.getInteger("number", true);
    const reason = interaction.options.getString("reason") ?? undefined;
    const note = interaction.options.getString("note") ?? undefined;
    const status = interaction.options.getString("status") ?? undefined;
    const item = await updateModerationCase(interaction.guildId, caseNumber, {
      reason,
      notes: note,
      status: status as any
    });
    if (!item) {
      await replyToCommand(interaction, `Case #${caseNumber} was not found.`);
      return;
    }
    await replyToCommand(interaction, `Updated case #${item.caseNumber}.`);
  }
}
