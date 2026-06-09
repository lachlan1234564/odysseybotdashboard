import { ChatInputCommandInteraction, PermissionFlagsBits, TextChannel } from "discord.js";
import { addWarning, listWarnings } from "../database/index.js";
import { getTargetMember, logModeration } from "./utils.js";

function discordTimestamp(value: string): number {
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const withZone = /(?:Z|[+-]\d{2}(?::?\d{2})?)$/i.test(normalized) ? normalized : `${normalized}Z`;
  return Math.floor(new Date(withZone).getTime() / 1000);
}

export async function handleModeration(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId || !interaction.guild) {
    await interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
    return;
  }

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
    await interaction.reply({
      content: "You do not have the Discord permission required to use this moderation command.",
      ephemeral: true
    });
    return;
  }

  if (command === "clear") {
    if (!(interaction.channel instanceof TextChannel)) {
      await interaction.reply({ content: "This command requires a server text channel.", ephemeral: true });
      return;
    }
    const amount = interaction.options.getInteger("amount", true);
    const botMember = interaction.guild.members.me;
    if (!botMember || !interaction.channel.permissionsFor(botMember)?.has(PermissionFlagsBits.ManageMessages)) {
      await interaction.reply({ content: "I need Manage Messages in this channel to clear messages.", ephemeral: true });
      return;
    }
    const deleted = await interaction.channel.bulkDelete(amount, true).catch(() => null);
    if (!deleted) {
      await interaction.reply({ content: "I could not clear those messages. Messages older than 14 days cannot be bulk-deleted.", ephemeral: true });
      return;
    }
    await interaction.reply({ content: `Deleted ${deleted.size} recent messages.`, ephemeral: true });
    await logModeration({ interaction, action: "clear", channelId: interaction.channelId, metadata: { requested: amount, deleted: deleted.size } });
    return;
  }

  const member = await getTargetMember(interaction);
  const user = interaction.options.getUser("member", true);
  if (command !== "ban" && !member) {
    await interaction.reply({ content: "That member is not currently in the server.", ephemeral: true });
    return;
  }

  if (command === "warnings") {
    const warnings = await listWarnings(interaction.guildId, user.id, 10);
    const content = warnings.length
      ? warnings.map((warning) => `**#${warning.id}** • <t:${discordTimestamp(warning.createdAt)}:d> • ${warning.reason} • by <@${warning.moderatorId}>`).join("\n")
      : `${user} has no warnings.`;
    await interaction.reply({ content, ephemeral: true });
    return;
  }

  const reasonInput = interaction.options.getString("reason")?.trim() ?? "";
  const reason = reasonInput || "No reason provided";
  if (command === "warn" && !reasonInput) {
    await interaction.reply({ content: "Add a clear warning reason before running this command.", ephemeral: true });
    return;
  }

  if (command === "warn") {
    const warningId = await addWarning({
      guildId: interaction.guildId,
      userId: user.id,
      moderatorId: interaction.user.id,
      reason
    });
    await interaction.reply({ content: `${user} was warned. Warning #${warningId}.`, ephemeral: true });
    await logModeration({ interaction, action: "warn", targetUserId: user.id, reason, channelId: interaction.channelId, metadata: { warningId } });
    return;
  }

  if (command === "timeout" && member) {
    if (!member.moderatable) {
      await interaction.reply({ content: "I cannot time out that member. Check role hierarchy and permissions.", ephemeral: true });
      return;
    }
    const minutes = interaction.options.getInteger("minutes", true);
    const timedOut = await member.timeout(minutes * 60_000, reason).then(() => true).catch(() => false);
    if (!timedOut) {
      await interaction.reply({ content: "I could not time out that member. Check my permissions and role position.", ephemeral: true });
      return;
    }
    await interaction.reply({ content: `${user} was timed out for ${minutes} minute(s).`, ephemeral: true });
    await logModeration({ interaction, action: "timeout", targetUserId: user.id, reason, channelId: interaction.channelId, metadata: { minutes } });
    return;
  }

  if (command === "kick" && member) {
    if (!member.kickable) {
      await interaction.reply({ content: "I cannot kick that member. Check role hierarchy and permissions.", ephemeral: true });
      return;
    }
    const kicked = await member.kick(reason).then(() => true).catch(() => false);
    if (!kicked) {
      await interaction.reply({ content: "I could not kick that member. Check my permissions and role position.", ephemeral: true });
      return;
    }
    await interaction.reply({ content: `${user.tag} was kicked.`, ephemeral: true });
    await logModeration({ interaction, action: "kick", targetUserId: user.id, reason, channelId: interaction.channelId });
    return;
  }

  if (command === "ban") {
    const botMember = interaction.guild.members.me;
    if (!botMember?.permissions.has(PermissionFlagsBits.BanMembers)) {
      await interaction.reply({ content: "I need Ban Members before I can ban users.", ephemeral: true });
      return;
    }
    if (member && !member.bannable) {
      await interaction.reply({ content: "I cannot ban that member. Check role hierarchy and permissions.", ephemeral: true });
      return;
    }
    const deleteDays = interaction.options.getInteger("delete_days") ?? 0;
    const banned = await interaction.guild.members.ban(user.id, {
      deleteMessageSeconds: deleteDays * 86_400,
      reason
    }).then(() => true).catch(() => false);
    if (!banned) {
      await interaction.reply({ content: "I could not ban that user. Check my permissions and role position.", ephemeral: true });
      return;
    }
    await interaction.reply({ content: `${user.tag} was banned.`, ephemeral: true });
    await logModeration({ interaction, action: "ban", targetUserId: user.id, reason, channelId: interaction.channelId, metadata: { deleteDays } });
  }
}
