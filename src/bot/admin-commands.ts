import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  ChannelType
} from "discord.js";
import { requireBotAdmin } from "./utils.js";
import { deferCommandReply, replyEphemeral, replyToCommand } from "./interactions.js";

export async function handleLockdown(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await replyEphemeral(interaction, "This command only works in a server.");
    return;
  }

  await deferCommandReply(interaction);
  if (!(await requireBotAdmin(interaction))) return;

  const channels = interaction.guild.channels.cache.filter(
    (channel) => channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement
  );

  const targetChannel = interaction.options.getChannel("channel");
  const channelList = targetChannel ? [targetChannel] : [...channels.values()];

  let locked = 0;
  let failed = 0;

  for (const channel of channelList) {
    if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement) continue;
    if (!("permissionOverwrites" in channel)) continue;

    try {
      await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
        SendMessages: false
      });
      locked++;
    } catch {
      failed++;
    }
  }

  const embed = new EmbedBuilder()
    .setColor(0xED4245)
    .setTitle("Server locked down")
    .setDescription(`${locked} channel(s) locked.${failed > 0 ? ` ${failed} failed (check bot permissions).` : ""}`)
    .setFooter({ text: `Lockdown by ${interaction.user.username}` });

  await replyToCommand(interaction, { embeds: [embed] });
}

export async function handleUnlockdown(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await replyEphemeral(interaction, "This command only works in a server.");
    return;
  }

  await deferCommandReply(interaction);
  if (!(await requireBotAdmin(interaction))) return;

  const channels = interaction.guild.channels.cache.filter(
    (channel) => channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement
  );

  const targetChannel = interaction.options.getChannel("channel");
  const channelList = targetChannel ? [targetChannel] : [...channels.values()];

  let unlocked = 0;
  let failed = 0;

  for (const channel of channelList) {
    if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement) continue;
    if (!("permissionOverwrites" in channel)) continue;

    try {
      await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
        SendMessages: null
      });
      unlocked++;
    } catch {
      failed++;
    }
  }

  const embed = new EmbedBuilder()
    .setColor(0x57F287)
    .setTitle("Lockdown lifted")
    .setDescription(`${unlocked} channel(s) unlocked.${failed > 0 ? ` ${failed} failed (check bot permissions).` : ""}`)
    .setFooter({ text: `Unlocked by ${interaction.user.username}` });

  await replyToCommand(interaction, { embeds: [embed] });
}

export async function handleBotStatus(interaction: ChatInputCommandInteraction): Promise<void> {
  const client = interaction.client;
  const uptime = Math.floor(client.uptime! / 1000);
  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);

  const memory = process.memoryUsage();
  const heapUsed = Math.round(memory.heapUsed / 1024 / 1024);

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle("CorePanel status")
    .addFields(
      { name: "Uptime", value: `${hours}h ${minutes}m`, inline: true },
      { name: "Latency", value: `${client.ws.ping}ms`, inline: true },
      { name: "Servers", value: `${client.guilds.cache.size}`, inline: true },
      { name: "Memory", value: `${heapUsed} MB heap`, inline: true },
      { name: "Discord.js", value: `v14`, inline: true },
      { name: "Node.js", value: process.version, inline: true }
    )
    .setFooter({ text: "CorePanel diagnostics" });

  await replyEphemeral(interaction, { embeds: [embed] });
}
