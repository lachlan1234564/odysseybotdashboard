import { ChatInputCommandInteraction, TextChannel } from "discord.js";
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
  if (command === "clear") {
    if (!(interaction.channel instanceof TextChannel)) {
      await interaction.reply({ content: "This command requires a server text channel.", ephemeral: true });
      return;
    }
    const amount = interaction.options.getInteger("amount", true);
    const deleted = await interaction.channel.bulkDelete(amount, true);
    await interaction.reply({ content: `Deleted ${deleted.size} recent messages.`, ephemeral: true });
    await logModeration({ interaction, action: "clear", metadata: { requested: amount, deleted: deleted.size } });
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

  const reason = interaction.options.getString("reason") ?? "No reason provided";

  if (command === "warn") {
    const warningId = await addWarning({
      guildId: interaction.guildId,
      userId: user.id,
      moderatorId: interaction.user.id,
      reason
    });
    await interaction.reply({ content: `${user} was warned. Warning #${warningId}.`, ephemeral: true });
    await logModeration({ interaction, action: "warn", targetUserId: user.id, reason, metadata: { warningId } });
    return;
  }

  if (command === "timeout" && member) {
    if (!member.moderatable) {
      await interaction.reply({ content: "I cannot time out that member. Check role hierarchy and permissions.", ephemeral: true });
      return;
    }
    const minutes = interaction.options.getInteger("minutes", true);
    await member.timeout(minutes * 60_000, reason);
    await interaction.reply({ content: `${user} was timed out for ${minutes} minute(s).`, ephemeral: true });
    await logModeration({ interaction, action: "timeout", targetUserId: user.id, reason, metadata: { minutes } });
    return;
  }

  if (command === "kick" && member) {
    if (!member.kickable) {
      await interaction.reply({ content: "I cannot kick that member. Check role hierarchy and permissions.", ephemeral: true });
      return;
    }
    await member.kick(reason);
    await interaction.reply({ content: `${user.tag} was kicked.`, ephemeral: true });
    await logModeration({ interaction, action: "kick", targetUserId: user.id, reason });
    return;
  }

  if (command === "ban") {
    const deleteDays = interaction.options.getInteger("delete_days") ?? 0;
    await interaction.guild.members.ban(user.id, {
      deleteMessageSeconds: deleteDays * 86_400,
      reason
    });
    await interaction.reply({ content: `${user.tag} was banned.`, ephemeral: true });
    await logModeration({ interaction, action: "ban", targetUserId: user.id, reason, metadata: { deleteDays } });
  }
}
