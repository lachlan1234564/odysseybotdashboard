import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  Client,
  EmbedBuilder,
  Guild,
  MessageFlags,
  PermissionFlagsBits
} from "discord.js";
import {
  addGiveawayEntry,
  createGiveaway,
  getGiveaway,
  listDueGiveaways,
  listGiveawayEntries,
  removeGiveawayEntry,
  updateGiveaway
} from "../database/index.js";
import type { Giveaway } from "../shared/types.js";
import { asColor, requireBotAdmin } from "./utils.js";
import { deferCommandReply, replyEphemeral, replyToCommand } from "./interactions.js";
import { logError } from "../shared/logging.js";

function giveawayEmbed(giveaway: Giveaway, entriesCount = 0, ended = false): EmbedBuilder {
  const endsAt = Math.floor(new Date(giveaway.endsAt).getTime() / 1000);
  return new EmbedBuilder()
    .setColor(ended ? 0x879C68 : asColor("#C58B4B"))
    .setTitle(ended ? `Giveaway ended: ${giveaway.prize}` : `Giveaway: ${giveaway.prize}`)
    .setDescription([
      giveaway.description || "Click Enter Giveaway below to join.",
      "",
      `**Winners:** ${giveaway.winnersCount}`,
      ended ? `**Ended:** <t:${endsAt}:R>` : `**Ends:** <t:${endsAt}:R>`,
      giveaway.requiredRoleId ? `**Required role:** <@&${giveaway.requiredRoleId}>` : "",
      entriesCount ? `**Entries:** ${entriesCount}` : ""
    ].filter(Boolean).join("\n"))
    .setFooter({ text: `Giveaway #${giveaway.id}` })
    .setTimestamp(new Date(giveaway.endsAt));
}

function giveawayComponents(giveaway: Giveaway, disabled = false) {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`giveaway:enter:${giveaway.id}`)
        .setLabel(disabled ? "Giveaway Ended" : "Enter Giveaway")
        .setStyle(disabled ? ButtonStyle.Secondary : ButtonStyle.Success)
        .setDisabled(disabled)
    )
  ];
}

async function sendGiveawayMessage(
  guild: Guild,
  giveaway: Giveaway,
  channel: { id: string; send: (payload: unknown) => Promise<{ id: string }> }
): Promise<Giveaway> {
  const message = await channel.send({
    embeds: [giveawayEmbed(giveaway)],
    components: giveawayComponents(giveaway),
    allowedMentions: { parse: [] }
  });
  return (await updateGiveaway(giveaway.id, guild.id, { messageId: message.id, status: "active" }))!;
}

function drawWinners(entries: Array<{ userId: string; entries: number }>, count: number): string[] {
  const weighted = entries.flatMap((entry) => Array.from({ length: Math.max(1, entry.entries) }, () => entry.userId));
  const winners: string[] = [];
  while (weighted.length && winners.length < count) {
    const picked = weighted[Math.floor(Math.random() * weighted.length)]!;
    if (!winners.includes(picked)) winners.push(picked);
    for (let index = weighted.length - 1; index >= 0; index -= 1) {
      if (weighted[index] === picked) weighted.splice(index, 1);
    }
  }
  return winners;
}

export async function endGiveaway(guild: Guild, giveaway: Giveaway, reroll = false): Promise<Giveaway> {
  const entries = await listGiveawayEntries(giveaway.id, giveaway.guildId);
  const winners = drawWinners(entries, giveaway.winnersCount);
  const ended = (await updateGiveaway(giveaway.id, giveaway.guildId, {
    status: "ended",
    winnerUserIds: winners
  }))!;
  const channel = await guild.channels.fetch(giveaway.channelId).catch(() => null);
  if (channel?.isTextBased() && !channel.isDMBased()) {
    const winnerText = winners.length ? winners.map((id) => `<@${id}>`).join(", ") : "No eligible entries.";
    if (giveaway.messageId) {
      const message = await channel.messages.fetch(giveaway.messageId).catch(() => null);
      await message?.edit({
        embeds: [giveawayEmbed(ended, entries.length, true)],
        components: giveawayComponents(ended, true)
      }).catch(() => undefined);
    }
    await channel.send({
      content: reroll
        ? `Rerolled giveaway **${giveaway.prize}**. Winner(s): ${winnerText}`
        : `Giveaway **${giveaway.prize}** ended. Winner(s): ${winnerText}`,
      allowedMentions: { users: winners }
    }).catch(() => undefined);
  }
  return ended;
}

export async function processDueGiveaways(client: Client<true>): Promise<void> {
  const due = await listDueGiveaways();
  for (const giveaway of due) {
    const guild = await client.guilds.fetch(giveaway.guildId).catch(() => null);
    if (!guild) continue;
    await endGiveaway(guild, giveaway).catch((error) => {
      logError(`Giveaway #${giveaway.id} could not be ended`, error);
    });
  }
}

export async function handleGiveawayButton(interaction: ButtonInteraction): Promise<void> {
  if (!interaction.guild || !interaction.guildId) return;
  const giveawayId = Number(interaction.customId.split(":")[2]);
  const giveaway = await getGiveaway(giveawayId, interaction.guildId);
  if (!giveaway || giveaway.status !== "active") {
    await interaction.reply({ content: "That giveaway is no longer active.", flags: MessageFlags.Ephemeral });
    return;
  }
  if (new Date(giveaway.endsAt).getTime() <= Date.now()) {
    await interaction.reply({ content: "That giveaway has already ended.", flags: MessageFlags.Ephemeral });
    return;
  }
  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member) {
    await interaction.reply({ content: "I could not check your server membership.", flags: MessageFlags.Ephemeral });
    return;
  }
  if (giveaway.requiredRoleId && !member.roles.cache.has(giveaway.requiredRoleId)) {
    await interaction.reply({ content: `You need <@&${giveaway.requiredRoleId}> to enter this giveaway.`, flags: MessageFlags.Ephemeral });
    return;
  }
  let entries = 1;
  if (giveaway.boosterBonusEntries > 0 && member.premiumSinceTimestamp) entries += giveaway.boosterBonusEntries;
  if (giveaway.bonusRoleId && member.roles.cache.has(giveaway.bonusRoleId)) entries += giveaway.bonusRoleEntries;
  await addGiveawayEntry({
    giveawayId: giveaway.id,
    guildId: giveaway.guildId,
    userId: interaction.user.id,
    entries,
    createdAt: new Date().toISOString()
  });
  await interaction.reply({ content: `You are entered for **${giveaway.prize}** with ${entries} entr${entries === 1 ? "y" : "ies"}.`, flags: MessageFlags.Ephemeral });
}

export async function handleGiveawayCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild || !interaction.guildId) {
    await replyEphemeral(interaction, "This command can only be used in a server.");
    return;
  }
  await deferCommandReply(interaction);
  if (!(await requireBotAdmin(interaction))) return;
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await replyToCommand(interaction, "You need Manage Server to run giveaway commands.");
    return;
  }

  const subcommand = interaction.options.getSubcommand();
  if (subcommand === "start") {
    const prize = interaction.options.getString("prize", true).trim();
    const minutes = interaction.options.getInteger("minutes", true);
    const winnersCount = interaction.options.getInteger("winners") ?? 1;
    const description = interaction.options.getString("description") ?? "";
    const requiredRole = interaction.options.getRole("required_role");
    const channel = interaction.options.getChannel("channel") ?? interaction.channel;
    if (!channel || !("send" in channel) || typeof channel.send !== "function") {
      await replyToCommand(interaction, "Choose a server text channel for the giveaway.");
      return;
    }
    const giveaway = await createGiveaway({
      guildId: interaction.guildId,
      channelId: channel.id,
      prize,
      description,
      winnersCount,
      endsAt: new Date(Date.now() + minutes * 60_000).toISOString(),
      requiredRoleId: requiredRole?.id ?? null,
      boosterBonusEntries: 0,
      bonusRoleId: null,
      bonusRoleEntries: 0,
      status: "draft",
      createdBy: interaction.user.id
    });
    const posted = await sendGiveawayMessage(interaction.guild, giveaway, channel as { id: string; send: (payload: unknown) => Promise<{ id: string }> });
    await replyToCommand(interaction, `Started giveaway #${posted.id} for **${posted.prize}** in ${channel}.`);
    return;
  }

  const id = interaction.options.getInteger("id", true);
  const giveaway = await getGiveaway(id, interaction.guildId);
  if (!giveaway) {
    await replyToCommand(interaction, `Giveaway #${id} was not found.`);
    return;
  }
  if (subcommand === "end") {
    if (giveaway.status !== "active") {
      await replyToCommand(interaction, "That giveaway is not active.");
      return;
    }
    await endGiveaway(interaction.guild, giveaway);
    await replyToCommand(interaction, `Ended giveaway #${id}.`);
    return;
  }
  if (subcommand === "reroll") {
    await endGiveaway(interaction.guild, giveaway, true);
    await replyToCommand(interaction, `Rerolled giveaway #${id}.`);
    return;
  }
  if (subcommand === "cancel") {
    await updateGiveaway(id, interaction.guildId, { status: "cancelled" });
    if (giveaway.messageId) {
      const channel = await interaction.guild.channels.fetch(giveaway.channelId).catch(() => null);
      if (channel?.isTextBased() && !channel.isDMBased()) {
        const message = await channel.messages.fetch(giveaway.messageId).catch(() => null);
        await message?.edit({ components: giveawayComponents(giveaway, true) }).catch(() => undefined);
      }
    }
    await replyToCommand(interaction, `Cancelled giveaway #${id}.`);
  }
}

export async function deleteGiveawayEntryForUser(giveawayId: number, guildId: string, userId: string): Promise<boolean> {
  return removeGiveawayEntry(giveawayId, guildId, userId);
}
