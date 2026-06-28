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
  PermissionFlagsBits,
} from "discord.js";
import { parseDiscordComponentEmoji } from "../shared/discord-components.js";
import {
  createPoll,
  getGuildSettings,
  getPoll,
  listDuePolls,
  listPolls,
  listPollVotes,
  updatePoll,
  upsertPollVote
} from "../database/index.js";
import {
  nextPollSelection,
  pollDisplayTitle,
  pollPublicDescription,
  POLL_CLOSED_COLOR,
  POLL_OPEN_COLOR
} from "../shared/polls.js";
import type { Poll, PollOption, PollVote } from "../shared/types.js";
import { logError } from "../shared/logging.js";
import { deferCommandReply, replyEphemeral, replyToCommand } from "./interactions.js";
import { asColor, requireBotAdmin, sendGuildLog } from "./utils.js";

function pollOptionId(index: number): string {
  return String(index + 1);
}

function statusLabel(poll: Poll): string {
  if (poll.status === "active") return "Open";
  if (poll.status === "scheduled") return "Scheduled";
  if (poll.status === "ended") return "Ended";
  if (poll.status === "cancelled") return "Cancelled";
  return "Draft";
}

export function pollEmbed(poll: Poll, votes: PollVote[] = [], closed = false): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(poll.status === "cancelled" ? POLL_CLOSED_COLOR : POLL_OPEN_COLOR)
    .setTitle(pollDisplayTitle(poll, closed))
    .setDescription(pollPublicDescription(poll, votes, closed))
    .setFooter({ text: `Poll #${poll.id}` })
    .setTimestamp(closed || poll.status === "ended" || poll.status === "cancelled"
      ? new Date()
      : poll.endsAt ? new Date(poll.endsAt) : new Date());
  return embed;
}

export function pollComponents(poll: Poll, disabled = false) {
  const buttons = poll.options.slice(0, 10).map((option, index) => {
    const button = new ButtonBuilder()
      .setCustomId(`poll:vote:${poll.id}:${option.id}`)
      .setLabel(String(index + 1))
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled);
    if (option.emoji) {
      try {
        const emoji = parseDiscordComponentEmoji(option.emoji);
        if (emoji) button.setEmoji(emoji);
      } catch {
        // Invalid stored emoji should not stop the whole poll from rendering.
      }
    }
    return button;
  });

  const rows: Array<ActionRowBuilder<ButtonBuilder>> = [];
  for (let index = 0; index < buttons.length; index += 5) {
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(buttons.slice(index, index + 5)));
  }
  return rows;
}

async function sendPollLog(guild: Guild, poll: Poll, title: string, description: string): Promise<void> {
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
        { name: "Poll", value: `#${poll.id} · ${poll.question.slice(0, 100)}`, inline: false },
        { name: "Channel", value: `<#${poll.channelId}>`, inline: true },
        { name: "Status", value: statusLabel(poll), inline: true }
      )
      .setTimestamp()
  );
}

export async function publishPollMessage(
  guild: Guild,
  poll: Poll,
  channel: { id: string; send: (payload: unknown) => Promise<{ id: string }> }
): Promise<Poll> {
  const message = await channel.send({
    embeds: [pollEmbed(poll)],
    components: pollComponents(poll),
    allowedMentions: { parse: [] }
  });
  const updated = (await updatePoll(poll.id, guild.id, {
    messageId: message.id,
    status: "active",
    startsAt: poll.startsAt ?? new Date().toISOString()
  }))!;
  await sendPollLog(guild, updated, "Poll Started", "A poll was published from Bot Dashboard.").catch(() => undefined);
  return updated;
}

export async function endPoll(guild: Guild, poll: Poll, cancelled = false): Promise<Poll> {
  const votes = await listPollVotes(poll.id, poll.guildId);
  const updated = (await updatePoll(poll.id, poll.guildId, {
    status: cancelled ? "cancelled" : "ended"
  }))!;
  const channel = await guild.channels.fetch(poll.channelId).catch(() => null);
  if (channel?.isTextBased() && !channel.isDMBased()) {
    if (poll.messageId) {
      const message = await channel.messages.fetch(poll.messageId).catch(() => null);
      await message?.edit({
        embeds: [pollEmbed(updated, votes, true)],
        components: pollComponents(updated, true)
      }).catch(() => undefined);
    }
  }
  await sendPollLog(guild, updated, cancelled ? "Poll Cancelled" : "Poll Ended", cancelled ? "A poll was cancelled." : "A poll reached its end time or was ended manually.").catch(() => undefined);
  return updated;
}

export async function processDuePolls(client: Client<true>): Promise<void> {
  const due = await listDuePolls();
  for (const poll of due) {
    const guild = await client.guilds.fetch(poll.guildId).catch(() => null);
    if (!guild) continue;
    if (poll.status === "scheduled") {
      const channel = await guild.channels.fetch(poll.channelId).catch(() => null);
      if (channel?.isTextBased() && !channel.isDMBased() && "send" in channel && typeof channel.send === "function") {
        await publishPollMessage(guild, poll, channel as { id: string; send: (payload: unknown) => Promise<{ id: string }> }).catch((error) => {
          logError(`Poll #${poll.id} could not be started`, error);
        });
      } else {
        logError(`Poll #${poll.id} could not be started`, new Error("Target channel is missing or is not sendable."));
      }
      continue;
    }
    await endPoll(guild, poll).catch((error) => {
      logError(`Poll #${poll.id} could not be ended`, error);
    });
  }
}

export async function handlePollVote(interaction: ButtonInteraction): Promise<void> {
  if (!interaction.guild || !interaction.guildId) return;
  const pollId = Number(interaction.customId.split(":")[2]);
  const clickedOptionId = interaction.customId.split(":")[3];
  const poll = await getPoll(pollId, interaction.guildId);
  if (!poll || poll.status !== "active") {
    await interaction.reply({ content: "That poll is no longer active.", flags: MessageFlags.Ephemeral });
    return;
  }
  if (poll.endsAt && new Date(poll.endsAt).getTime() <= Date.now()) {
    await endPoll(interaction.guild, poll).catch(() => undefined);
    await interaction.reply({ content: "That poll just ended. Final results are now available.", flags: MessageFlags.Ephemeral });
    return;
  }
  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member) {
    await interaction.reply({ content: "I could not check your server membership.", flags: MessageFlags.Ephemeral });
    return;
  }
  if (poll.requiredRoleId && !member.roles.cache.has(poll.requiredRoleId)) {
    await interaction.reply({ content: `You need <@&${poll.requiredRoleId}> to vote in this poll.`, flags: MessageFlags.Ephemeral });
    return;
  }
  const validOptionIds = new Set(poll.options.map((option) => option.id));
  if (!clickedOptionId || !validOptionIds.has(clickedOptionId)) {
    await interaction.reply({ content: "That poll option is no longer available.", flags: MessageFlags.Ephemeral });
    return;
  }
  const existingVotes = await listPollVotes(poll.id, poll.guildId);
  const existing = existingVotes.find((vote) => vote.userId === interaction.user.id);
  const optionIds = nextPollSelection(poll, existing?.optionIds ?? [], clickedOptionId);
  await upsertPollVote({
    pollId: poll.id,
    guildId: poll.guildId,
    userId: interaction.user.id,
    optionIds,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  const votes = await listPollVotes(poll.id, poll.guildId);
  if (poll.showLiveResults && poll.resultsVisibility === "public" && poll.messageId) {
    await interaction.message.edit({
      embeds: [pollEmbed(poll, votes)],
      components: pollComponents(poll)
    }).catch(() => undefined);
  }
  const clickedOption = poll.options.find((option) => option.id === clickedOptionId);
  const optionName = clickedOption ? ` **${clickedOption.label || clickedOption.text}**` : "";
  const removed = poll.multipleChoice && !optionIds.includes(clickedOptionId);
  await interaction.reply({
    content: removed
      ? `Removed${optionName} from your ballot.`
      : existing ? "Your vote was updated." : "Your vote was recorded.",
    flags: MessageFlags.Ephemeral
  });
}

function commandOptions(interaction: ChatInputCommandInteraction): PollOption[] {
  return Array.from({ length: 10 }, (_value, index) => {
    const name = index < 2 ? `option${index + 1}` : `option_${index + 1}`;
    return interaction.options.getString(name)?.trim();
  })
    .filter((value): value is string => Boolean(value))
    .map((text, index) => ({ id: pollOptionId(index), label: text, text, description: "", emoji: "" }));
}

export async function handlePollCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild || !interaction.guildId) {
    await replyEphemeral(interaction, "This command can only be used in a server.");
    return;
  }
  await deferCommandReply(interaction);
  if (!(await requireBotAdmin(interaction))) return;
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await replyToCommand(interaction, "You need Manage Server to run poll commands.");
    return;
  }

  const subcommand = interaction.options.getSubcommand();
  if (subcommand === "create") {
    const question = interaction.options.getString("question", true).trim();
    const options = commandOptions(interaction);
    const minutes = interaction.options.getInteger("minutes");
    const channel = interaction.options.getChannel("channel") ?? interaction.channel;
    const requiredRole = interaction.options.getRole("required_role");
    if (options.length < 2) {
      await replyToCommand(interaction, "Add at least two poll options.");
      return;
    }
    if (!channel || !("send" in channel) || typeof channel.send !== "function") {
      await replyToCommand(interaction, "Choose a server text channel for the poll.");
      return;
    }
    const poll = await createPoll({
      guildId: interaction.guildId,
      channelId: channel.id,
      title: "",
      question,
      options,
      startsAt: null,
      endsAt: minutes ? new Date(Date.now() + minutes * 60_000).toISOString() : null,
      anonymous: interaction.options.getBoolean("anonymous") ?? false,
      multipleChoice: interaction.options.getBoolean("multiple_choice") ?? false,
      requiredRoleId: requiredRole?.id ?? null,
      showLiveResults: interaction.options.getBoolean("show_results") ?? true,
      resultsVisibility: "public",
      status: "draft",
      createdBy: interaction.user.id
    });
    const posted = await publishPollMessage(interaction.guild, poll, channel as { id: string; send: (payload: unknown) => Promise<{ id: string }> });
    await replyToCommand(interaction, `Started poll #${posted.id} in ${channel}.`);
    return;
  }

  if (subcommand === "list") {
    const polls = await listPolls(interaction.guildId, 10);
    await replyToCommand(interaction, polls.length
      ? polls.map((poll) => `#${poll.id} · **${poll.status}** · ${poll.question}`).join("\n")
      : "No polls have been created for this server yet.");
    return;
  }

  const id = interaction.options.getInteger("id", true);
  const poll = await getPoll(id, interaction.guildId);
  if (!poll) {
    await replyToCommand(interaction, `Poll #${id} was not found.`);
    return;
  }
  if (subcommand === "end") {
    if (poll.status !== "active") {
      await replyToCommand(interaction, "That poll is not active.");
      return;
    }
    await endPoll(interaction.guild, poll);
    await replyToCommand(interaction, `Ended poll #${id}.`);
    return;
  }
  if (subcommand === "cancel") {
    if (!["draft", "scheduled", "active"].includes(poll.status)) {
      await replyToCommand(interaction, "Only draft, scheduled, or active polls can be cancelled.");
      return;
    }
    if (poll.status === "active") await endPoll(interaction.guild, poll, true);
    else await updatePoll(id, interaction.guildId, { status: "cancelled" });
    await replyToCommand(interaction, `Cancelled poll #${id}.`);
    return;
  }
  if (subcommand === "results") {
    const votes = await listPollVotes(poll.id, poll.guildId);
    await replyToCommand(interaction, { embeds: [pollEmbed(poll, votes, true)] });
  }
}
