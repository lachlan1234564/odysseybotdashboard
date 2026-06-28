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
  getGuildSettings,
  listDueGiveaways,
  listGiveaways,
  listGiveawayEntries,
  removeGiveawayEntry,
  updateGiveaway
} from "../database/index.js";
import type { Giveaway } from "../shared/types.js";
import { asColor, requireBotAdmin, sendGuildLog } from "./utils.js";
import { deferCommandReply, replyEphemeral, replyToCommand } from "./interactions.js";
import { logError } from "../shared/logging.js";
import { sendGiveawayWinnerDm } from "./dms.js";

function isHttpUrl(value: string): boolean {
  return /^https?:\/\/\S+$/i.test(value);
}

function statusLabel(giveaway: Giveaway): string {
  if (giveaway.status === "active") return "Open";
  if (giveaway.status === "scheduled") return "Scheduled";
  if (giveaway.status === "ended") return "Ended";
  if (giveaway.status === "cancelled") return "Cancelled";
  return "Draft";
}

function giveawayEmbed(giveaway: Giveaway, entriesCount = 0, ended = false): EmbedBuilder {
  const endsAt = Math.floor(new Date(giveaway.endsAt).getTime() / 1000);
  const startsAt = giveaway.startsAt ? Math.floor(new Date(giveaway.startsAt).getTime() / 1000) : null;
  const embed = new EmbedBuilder()
    .setColor(ended ? 0x879C68 : asColor("#C58B4B"))
    .setTitle(ended ? `Giveaway ended: ${giveaway.prize}` : `Giveaway: ${giveaway.prize}`)
    .setDescription([
      giveaway.description || "Click Enter Giveaway below to join.",
      "",
      `**Prize:** ${giveaway.prize}`,
      `**Winners:** ${giveaway.winnersCount}`,
      startsAt && giveaway.status === "scheduled" ? `**Starts:** <t:${startsAt}:R>` : "",
      ended ? `**Ended:** <t:${endsAt}:R>` : `**Ends:** <t:${endsAt}:R>`,
      giveaway.hostUserId ? `**Host:** <@${giveaway.hostUserId}>` : "",
      giveaway.requiredRoleId ? `**Required role:** <@&${giveaway.requiredRoleId}>` : "",
      giveaway.boosterBonusEntries ? `**Booster bonus:** +${giveaway.boosterBonusEntries} entries` : "",
      giveaway.bonusRoleId && giveaway.bonusRoleEntries ? `**Bonus role:** <@&${giveaway.bonusRoleId}> (+${giveaway.bonusRoleEntries})` : "",
      giveaway.winnerRoleId ? `**Winner role:** <@&${giveaway.winnerRoleId}>` : "",
      entriesCount ? `**Entries:** ${entriesCount}` : "",
      giveaway.winnerUserIds.length ? `**Winner(s):** ${giveaway.winnerUserIds.map((id) => `<@${id}>`).join(", ")}` : ""
    ].filter(Boolean).join("\n"))
    .addFields(
      { name: "Status", value: statusLabel(giveaway), inline: true },
      { name: "Access", value: giveaway.requiredRoleId ? `<@&${giveaway.requiredRoleId}>` : "Everyone", inline: true },
      { name: "Entries", value: String(entriesCount), inline: true }
    )
    .setFooter({ text: `Giveaway #${giveaway.id}` })
    .setTimestamp(new Date(giveaway.endsAt));
  if (isHttpUrl(giveaway.thumbnailUrl)) embed.setThumbnail(giveaway.thumbnailUrl);
  if (isHttpUrl(giveaway.imageUrl)) embed.setImage(giveaway.imageUrl);
  return embed;
}

function giveawayComponents(giveaway: Giveaway, disabled = false) {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`giveaway:enter:${giveaway.id}`)
        .setLabel(disabled ? "Giveaway Ended" : (giveaway.buttonText || "Enter Giveaway").slice(0, 80))
        .setStyle(disabled ? ButtonStyle.Secondary : ButtonStyle.Success)
        .setDisabled(disabled)
    )
  ];
}

async function sendGiveawayLog(guild: Guild, giveaway: Giveaway, title: string, description: string): Promise<void> {
  const settings = await getGuildSettings(guild.id);
  await sendGuildLog(
    guild.id,
    settings.modLogChannelId,
    (id) => guild.channels.fetch(id),
    new EmbedBuilder()
      .setColor(asColor("#C58B4B"))
      .setTitle(title)
      .setDescription(description)
      .addFields(
        { name: "Giveaway", value: `#${giveaway.id} · ${giveaway.prize.slice(0, 100)}` },
        { name: "Channel", value: `<#${giveaway.channelId}>`, inline: true },
        { name: "Status", value: statusLabel(giveaway), inline: true }
      )
      .setTimestamp()
  );
}

export async function sendGiveawayMessage(
  guild: Guild,
  giveaway: Giveaway,
  channel: { id: string; send: (payload: unknown) => Promise<{ id: string }> }
): Promise<Giveaway> {
  const message = await channel.send({
    content: giveaway.createMessage || undefined,
    embeds: [giveawayEmbed(giveaway)],
    components: giveawayComponents(giveaway),
    allowedMentions: { parse: [] }
  });
  const updated = (await updateGiveaway(giveaway.id, guild.id, {
    messageId: message.id,
    status: "active",
    startsAt: giveaway.startsAt ?? new Date().toISOString()
  }))!;
  await sendGiveawayLog(guild, updated, "Giveaway Started", "A giveaway was published from CorePanel.").catch(() => undefined);
  return updated;
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
  for (const winnerId of winners) {
    const member = await guild.members.fetch(winnerId).catch(() => null);
    if (member && giveaway.winnerRoleId) {
      await member.roles.add(giveaway.winnerRoleId, `Won giveaway #${giveaway.id}`).catch((error) => {
        logError(`Could not give giveaway winner role for #${giveaway.id}`, error);
      });
    }
    const winnerUser = member?.user ?? await guild.client.users.fetch(winnerId).catch(() => null);
    if (winnerUser) {
      await sendGiveawayWinnerDm({ guild, giveaway, user: winnerUser }).catch((error) => {
        logError(`Could not process giveaway winner DM for #${giveaway.id}`, error);
      });
    }
  }
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
  await sendGiveawayLog(guild, ended, reroll ? "Giveaway Rerolled" : "Giveaway Ended", winners.length
    ? `Winner(s): ${winners.map((id) => `<@${id}>`).join(", ")}`
    : "No eligible entries were found.").catch(() => undefined);
  return ended;
}

export async function processDueGiveaways(client: Client<true>): Promise<void> {
  const due = await listDueGiveaways();
  for (const giveaway of due) {
    const guild = await client.guilds.fetch(giveaway.guildId).catch(() => null);
    if (!guild) continue;
    if (giveaway.status === "scheduled") {
      const channel = await guild.channels.fetch(giveaway.channelId).catch(() => null);
      if (channel?.isTextBased() && !channel.isDMBased() && "send" in channel && typeof channel.send === "function") {
        await sendGiveawayMessage(guild, giveaway, channel as { id: string; send: (payload: unknown) => Promise<{ id: string }> }).catch((error) => {
          logError(`Giveaway #${giveaway.id} could not be started`, error);
        });
      } else {
        logError(`Giveaway #${giveaway.id} could not be started`, new Error("Target channel is missing or is not sendable."));
      }
      continue;
    }
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
  const currentEntries = await listGiveawayEntries(giveaway.id, giveaway.guildId);
  if (currentEntries.some((entry) => entry.userId === interaction.user.id)) {
    await interaction.reply({ content: `You are already entered for **${giveaway.prize}**.`, flags: MessageFlags.Ephemeral });
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
    const bonusRole = interaction.options.getRole("bonus_role");
    const bonusRoleEntries = interaction.options.getInteger("bonus_role_entries") ?? 0;
    const channel = interaction.options.getChannel("channel") ?? interaction.channel;
    const host = interaction.options.getUser("host") ?? interaction.user;
    if (bonusRoleEntries > 0 && !bonusRole) {
      await replyToCommand(interaction, "Choose a bonus role when bonus role entries are greater than 0.");
      return;
    }
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
      startsAt: null,
      endsAt: new Date(Date.now() + minutes * 60_000).toISOString(),
      hostUserId: host.id,
      requiredRoleId: requiredRole?.id ?? null,
      boosterBonusEntries: interaction.options.getInteger("booster_bonus_entries") ?? 0,
      bonusRoleId: bonusRole?.id ?? null,
      bonusRoleEntries,
      winnerRoleId: null,
      winnerDmMessage: "",
      createMessage: "",
      imageUrl: "",
      thumbnailUrl: "",
      buttonText: "Enter Giveaway",
      status: "draft",
      createdBy: interaction.user.id
    });
    const posted = await sendGiveawayMessage(interaction.guild, giveaway, channel as { id: string; send: (payload: unknown) => Promise<{ id: string }> });
    await replyToCommand(interaction, `Started giveaway #${posted.id} for **${posted.prize}** in ${channel}.`);
    return;
  }

  if (subcommand === "list") {
    const giveaways = await listGiveaways(interaction.guildId, 10);
    await replyToCommand(interaction, giveaways.length
      ? giveaways.map((giveaway) => `#${giveaway.id} · **${giveaway.status}** · ${giveaway.prize} · ends ${new Date(giveaway.endsAt).toLocaleString()}`).join("\n")
      : "No giveaways have been created for this server yet.");
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
        await message?.edit({ embeds: [giveawayEmbed({ ...giveaway, status: "cancelled" }, 0, true)], components: giveawayComponents(giveaway, true) }).catch(() => undefined);
      }
    }
    await sendGiveawayLog(interaction.guild, { ...giveaway, status: "cancelled" }, "Giveaway Cancelled", "A giveaway was cancelled.").catch(() => undefined);
    await replyToCommand(interaction, `Cancelled giveaway #${id}.`);
  }
}

export async function deleteGiveawayEntryForUser(giveawayId: number, guildId: string, userId: string): Promise<boolean> {
  return removeGiveawayEntry(giveawayId, guildId, userId);
}
