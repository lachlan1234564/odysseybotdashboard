import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChannelType,
  ChatInputCommandInteraction,
  EmbedBuilder,
  Guild,
  GuildMember,
  InteractionReplyOptions,
  Message,
  MessageFlags,
  ModalBuilder,
  ModalSubmitInteraction,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  TextChannel,
  TextInputBuilder,
  TextInputStyle
} from "discord.js";
import {
  claimTicket,
  closeTicket,
  countOpenTicketsForUser,
  createCloseRequest,
  createTicketTranscript,
  createTicketRecord,
  getBranding,
  getGuildSettings,
  getTicketByChannel,
  getTicketPanel,
  getTicketType,
  getPendingCloseRequestForTicket,
  getTicketCloseRequest,
  listInactiveTickets,
  listTicketPanels,
  listTicketTypes,
  resolveCloseRequest
} from "../database/index.js";
import type { TicketRecord } from "../database/index.js";
import type { TicketCloseRequest, TicketPanel, TicketTranscriptMessage, TicketType } from "../shared/types.js";
import { emptyEmbedConfig } from "../shared/types.js";
import { parseDiscordComponentEmoji } from "../shared/discord-components.js";
import { renderEmbedMessage } from "./messages.js";
import { buildDiscordPlaceholders } from "./placeholders.js";
import { deferCommandReply, replyEphemeral, replyToCommand } from "./interactions.js";
import { friendlyDiscordError, logDiscordError, logError } from "../shared/logging.js";
import {
  closeRequestAudience,
  closeRequestCreationDenial,
  closeRequestDecisionDenial,
  type CloseRequestSource
} from "./ticket-close-policy.js";
import { asColor, requireBotAdmin, sendGuildLog } from "./utils.js";

type SendableChannel = {
  id?: string;
  name?: string | null;
  send: (message: any) => Promise<unknown>;
  isThread?: () => boolean;
  permissionsFor?: (member: GuildMember) => Readonly<import("discord.js").PermissionsBitField> | null;
};
type TicketCreateInteraction = StringSelectMenuInteraction | ButtonInteraction;
type CloseRequestInteraction = ChatInputCommandInteraction | ModalSubmitInteraction;

async function ticketPanelMessage(guild: Guild, panel: TicketPanel, channel?: SendableChannel | null) {
  if (panel.guildId !== guild.id) {
    throw new Error("That ticket panel belongs to a different server.");
  }
  if (!panel.title.trim() || !panel.description.trim()) {
    throw new Error("The ticket panel needs both a title and description.");
  }
  const embedConfig = {
    ...emptyEmbedConfig(),
    title: panel.title,
    description: panel.description,
    color: panel.color,
    imageUrl: panel.imageUrl,
    thumbnailUrl: panel.thumbnailUrl,
    footerText: panel.footerText,
    footerIconUrl: panel.footerIconUrl
  };
  const rendered = renderEmbedMessage(embedConfig, buildDiscordPlaceholders({
    guild,
    channel: channel?.id ? { id: channel.id, name: channel.name } : null
  }));
  const branding = await getBranding(guild.id);
  const panelButtonStyle = branding.ticketButtonStyle === "primary"
    ? ButtonStyle.Primary
    : branding.ticketButtonStyle === "success"
      ? ButtonStyle.Success
      : ButtonStyle.Secondary;
  const components: ActionRowBuilder<any>[] = [];

  if (panel.panelKind === "multi") {
    const children = (await Promise.all(panel.childPanelIds
      .map((id) => getTicketPanel(id, guild.id))))
      .filter((child): child is TicketPanel => Boolean(child?.active))
      .slice(0, 25);
    if (children.length) {
      components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`ticket:panel-select:${panel.id}`)
          .setPlaceholder(panel.dropdownPlaceholder || "Choose a ticket panel")
          .addOptions(children.map((child) => ({
            label: child.name.slice(0, 100),
            description: child.description.slice(0, 100) || undefined,
            value: String(child.id)
          })))
      ));
    }
    if (!children.length) {
      throw new Error("This multi-panel has no active child panels.");
    }
    return { ...rendered, components };
  }

  const types = (await Promise.all(panel.ticketTypeIds
    .map((id) => getTicketType(id, guild.id))))
    .filter((type): type is TicketType => Boolean(type?.active))
    .slice(0, 25);

  if (panel.displayMode === "buttons") {
    for (let index = 0; index < types.length; index += 5) {
      const row = new ActionRowBuilder<ButtonBuilder>();
      row.addComponents(...types.slice(index, index + 5).map((type) =>
        new ButtonBuilder()
          .setCustomId(`ticket:create-button:${panel.id}:${type.id}`)
          .setLabel(type.label.slice(0, 80))
          .setEmoji(parseDiscordComponentEmoji(type.emoji || "🎫")!)
          .setStyle(panelButtonStyle)
      ));
      components.push(row);
    }
  } else if (types.length) {
    components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`ticket:create:${panel.id}`)
        .setPlaceholder(panel.dropdownPlaceholder || "Choose a ticket type")
        .addOptions(types.map((type) => ({
          label: type.label.slice(0, 100),
          value: String(type.id),
          description: type.description.slice(0, 100) || undefined,
          emoji: parseDiscordComponentEmoji(type.emoji)
        })))
    ));
  }
  if (!types.length) {
    throw new Error("This ticket panel has no active ticket types.");
  }
  return { ...rendered, components };
}

export async function postTicketPanel(guild: Guild, panelId: number, channel: SendableChannel): Promise<void> {
  const panel = await getTicketPanel(panelId, guild.id);
  if (!panel?.active) throw new Error("Ticket panel not found or inactive.");
  const payload = await ticketPanelMessage(guild, panel, channel);
  const botMember = guild.members.me ?? await guild.members.fetchMe().catch(() => null);
  if (!botMember) throw new Error("CorePanel could not verify its server permissions.");
  const permissions = channel.permissionsFor?.(botMember);
  if (permissions) {
    const required = [
      PermissionFlagsBits.ViewChannel,
      channel.isThread?.() ? PermissionFlagsBits.SendMessagesInThreads : PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.EmbedLinks,
      ...(payload.files?.length ? [PermissionFlagsBits.AttachFiles] : [])
    ];
    const missing = required.filter((permission) => !permissions.has(permission));
    if (missing.length) {
      const names = [
        !permissions.has(PermissionFlagsBits.ViewChannel) ? "View Channel" : "",
        !permissions.has(channel.isThread?.() ? PermissionFlagsBits.SendMessagesInThreads : PermissionFlagsBits.SendMessages)
          ? (channel.isThread?.() ? "Send Messages in Threads" : "Send Messages")
          : "",
        !permissions.has(PermissionFlagsBits.EmbedLinks) ? "Embed Links" : "",
        payload.files?.length && !permissions.has(PermissionFlagsBits.AttachFiles) ? "Attach Files" : ""
      ].filter(Boolean);
      throw new Error(`CorePanel is missing these permissions in the target channel: ${names.join(", ")}.`);
    }
  }
  await channel.send(payload);
}

function ticketButtons(type: TicketType): ActionRowBuilder<ButtonBuilder>[] {
  const buttons: ButtonBuilder[] = [];
  if (type.claimButtonEnabled) {
    buttons.push(new ButtonBuilder().setCustomId("ticket:claim").setLabel("Claim Ticket").setStyle(ButtonStyle.Primary));
  }
  if (type.closeButtonEnabled && !type.requestCloseEnabled) {
    buttons.push(new ButtonBuilder().setCustomId("ticket:close").setLabel("Close Ticket").setStyle(ButtonStyle.Danger));
  }
  if (type.requestCloseEnabled) {
    buttons.push(new ButtonBuilder().setCustomId("ticket:close-request").setLabel("Request Staff Close").setStyle(ButtonStyle.Secondary));
  }
  return buttons.length ? [new ActionRowBuilder<ButtonBuilder>().addComponents(buttons)] : [];
}

function sanitizeChannelName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 90);
}

function formatDiscordDate(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime())
    ? `<t:${Math.floor(date.getTime() / 1000)}:F>`
    : "Unavailable";
}

function formatTicketChannelName(type: TicketType, username: string, userId: string): string {
  const formatted = type.namingFormat
    .replaceAll("{username}", username)
    .replaceAll("{type}", type.label)
    .replaceAll("{userId}", userId);
  return sanitizeChannelName(formatted) || `ticket-${userId}`;
}

function hasAnyRole(member: GuildMember, roleIds: string[]): boolean {
  return roleIds.some((roleId) => member.roles.cache.has(roleId));
}

async function ticketActorAccess(
  guild: Guild,
  userId: string,
  ticket: Awaited<ReturnType<typeof getTicketByChannel>>,
  type: TicketType | null,
  memberPermissions?: Readonly<import("discord.js").PermissionsBitField> | null
) {
  if (!ticket) return { isStaff: false, isCommunity: false, member: null };
  const [member, settings] = await Promise.all([
    guild.members.fetch(userId),
    getGuildSettings(guild.id)
  ]);
  const staffRoleIds = [...new Set([...settings.staffRoleIds, ...(type?.staffRoleIds ?? [])])];
  return {
    member,
    isStaff: Boolean(memberPermissions?.has(PermissionFlagsBits.ManageChannels))
      || hasAnyRole(member, staffRoleIds),
    isCommunity: ticket.userId === userId || hasAnyRole(member, type?.allowedRoleIds ?? [])
  };
}

async function canManageTicket(interaction: ButtonInteraction, allowOwner: boolean): Promise<boolean> {
  if (!interaction.guildId || !interaction.guild) return false;
  const ticket = await getTicketByChannel(interaction.guildId, interaction.channelId);
  if (!ticket) return false;
  if (allowOwner && ticket.userId === interaction.user.id) return true;
  if (interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels)) return true;
  const member = await interaction.guild.members.fetch(interaction.user.id);
  const [settings, type] = await Promise.all([
    getGuildSettings(interaction.guildId),
    ticket.ticketTypeId ? getTicketType(ticket.ticketTypeId, interaction.guildId) : Promise.resolve(null)
  ]);
  return hasAnyRole(member, [...settings.staffRoleIds, ...(type?.staffRoleIds ?? [])]);
}

export async function sendTicketLog(guild: Guild, type: TicketType | null, title: string, description: string): Promise<void> {
  const [settings, branding] = await Promise.all([
    getGuildSettings(guild.id),
    getBranding(guild.id)
  ]);
  const embed = new EmbedBuilder()
    .setColor(asColor(type?.color ?? branding.ticketPanelColor))
    .setTitle(title)
    .setDescription(description)
    .addFields(
      { name: "Action", value: title, inline: true },
      {
        name: "Status",
        value: /denied/i.test(title) ? "Denied" : /failed|error/i.test(title) ? "Failed" : "Completed",
        inline: true
      }
    )
    .setTimestamp();
  await sendGuildLog(
    guild.id,
    type?.transcriptChannelId ?? settings.transcriptChannelId,
    (id) => guild.channels.fetch(id),
    embed
  );
}

export function buildTicketTranscriptEmbed(input: {
  channelName: string;
  channelId: string;
  ticket: TicketRecord | undefined;
  type: TicketType | null;
  closedBy: string;
  reason: string;
  messageCount: number;
  closedAt: string;
}) {
  const { channelName, channelId, ticket, type, closedBy, reason, messageCount, closedAt } = input;
  return new EmbedBuilder()
    .setColor(asColor("#57F287"))
    .setTitle("Ticket Transcript Saved")
    .setDescription("The ticket was closed and its transcript was exported successfully.")
    .addFields(
      { name: "Status", value: "Saved and ready to download", inline: false },
      { name: "Ticket", value: `#${channelName}\n\`${channelId}\``, inline: true },
      { name: "Ticket ID", value: ticket ? `#${ticket.id}` : "Unavailable", inline: true },
      { name: "Category", value: type?.label ?? "General", inline: true },
      { name: "Requester", value: ticket ? `<@${ticket.userId}>\n\`${ticket.userId}\`` : "Unavailable", inline: true },
      { name: "Closed by", value: `<@${closedBy}>\n\`${closedBy}\``, inline: true },
      { name: "Messages saved", value: String(messageCount), inline: true },
      { name: "Assigned staff", value: ticket?.claimedBy ? `<@${ticket.claimedBy}>\n\`${ticket.claimedBy}\`` : "Unclaimed", inline: true },
      { name: "Priority", value: ticket?.priority ?? "normal", inline: true },
      { name: "Opened", value: ticket ? formatDiscordDate(ticket.openedAt) : "Unavailable", inline: true },
      { name: "Closed", value: formatDiscordDate(closedAt), inline: true },
      { name: "Close reason", value: reason || "No reason provided.", inline: false }
    )
    .setFooter({ text: "CorePanel ticket archive" })
    .setTimestamp(new Date(closedAt));
}

function summarizeMessageEmbeds(message: Message<true>): TicketTranscriptMessage["embedSummaries"] {
  return message.embeds.map((embed) => ({
    title: embed.title ?? "",
    description: embed.description ?? "",
    url: embed.url ?? "",
    fields: embed.fields.map((field) => ({
      name: field.name,
      value: field.value,
      inline: Boolean(field.inline)
    }))
  }));
}

function transcriptMessageLine(message: TicketTranscriptMessage): string {
  const attachmentLines = message.attachments.map((attachment) =>
    `    attachment: ${attachment.name} ${attachment.url}`
  );
  const embedLines = message.embedSummaries.map((embed, index) => {
    const parts = [
      embed.title ? `title="${embed.title}"` : "",
      embed.description ? `description="${embed.description.replace(/\s+/g, " ").slice(0, 220)}"` : "",
      embed.url ? `url=${embed.url}` : "",
      embed.fields.length ? `fields=${embed.fields.length}` : ""
    ].filter(Boolean).join(", ");
    return `    embed ${index + 1}: ${parts || "Discord embed without text fields"}`;
  });
  return [
    `[${message.createdAt}] ${message.authorTag} (${message.authorId}): ${message.content || "(no text content)"}`,
    ...attachmentLines,
    ...embedLines
  ].join("\n");
}

export async function sendTicketTranscript(
  guild: Guild,
  channel: TextChannel,
  type: TicketType | null,
  closedBy: string,
  reason: string
): Promise<{ saved: boolean; downloadUrl: string | null; messageCount: number }> {
  try {
    const settings = await getGuildSettings(guild.id);
    const logChannelId = type?.transcriptChannelId ?? settings.transcriptChannelId;
    const logChannel = logChannelId
      ? await guild.channels.fetch(logChannelId).catch(() => null)
      : null;
    const ticket = await getTicketByChannel(guild.id, channel.id);
    const closedAt = ticket?.closedAt ?? new Date().toISOString();
    let before: string | undefined;
    const fetched: Message<true>[] = [];
    for (let page = 0; page < 10; page += 1) {
      const batch = await channel.messages.fetch({ limit: 100, before }).catch((error) => {
        logError(`Could not fetch ticket transcript page for channel ${channel.id}`, error);
        return null;
      });
      if (!batch) break;
      if (!batch.size) break;
      fetched.push(...batch.values());
      before = batch.last()?.id;
      if (batch.size < 100) break;
    }
    const messages = fetched.sort((left, right) => left.createdTimestamp - right.createdTimestamp);
    const transcriptMessages: TicketTranscriptMessage[] = messages.map((message) => ({
      id: message.id,
      authorId: message.author.id,
      authorTag: message.author.tag,
      createdAt: message.createdAt.toISOString(),
      content: message.cleanContent || "",
      attachments: [...message.attachments.values()].map((file) => ({
        name: file.name ?? file.url.split("/").pop() ?? "Attachment",
        url: file.url,
        contentType: file.contentType,
        size: file.size
      })),
      embeds: message.embeds.length,
      embedSummaries: summarizeMessageEmbeds(message)
    }));
    const lines = transcriptMessages.map(transcriptMessageLine);
    const transcript = [
      `Ticket: #${channel.name} (${channel.id})`,
      `Ticket ID: ${ticket ? ticket.id : "Unavailable"}`,
      `Opened by: ${ticket ? `${ticket.userId}` : "Unavailable"}`,
      `Assigned staff: ${ticket?.claimedBy ?? "Unclaimed"}`,
      `Category: ${type?.label ?? "General"}`,
      `Priority: ${ticket?.priority ?? "normal"}`,
      `Created: ${ticket?.openedAt ?? "Unavailable"}`,
      `Closed: ${closedAt}`,
      `Closed by: ${closedBy}`,
      `Reason: ${reason || "No reason provided"}`,
      `Exported messages: ${lines.length}`,
      "",
      ...lines
    ].join("\n");
    let saved = false;
    if (ticket) {
      await createTicketTranscript({
        guildId: guild.id,
        ticketId: ticket.id,
        channelId: channel.id,
        channelName: channel.name,
        openerId: ticket.userId,
        closedBy,
        closeReason: reason || "No reason provided",
        openedAt: ticket.openedAt,
        closedAt,
        categoryLabel: type?.label ?? "General",
        claimedBy: ticket.claimedBy,
        priority: ticket.priority ?? "normal",
        messageCount: transcriptMessages.length,
        transcriptJson: transcriptMessages,
        transcriptText: transcript
      });
      saved = true;
    }
    if (!logChannelId || !logChannel?.isTextBased() || logChannel.isDMBased() || !("send" in logChannel)) {
      return { saved, downloadUrl: null, messageCount: lines.length };
    }
    const safeName = channel.name.replace(/[^a-z0-9-_]/gi, "-").slice(0, 80);
    const file = new AttachmentBuilder(Buffer.from(transcript, "utf8"), {
      name: `${safeName || "ticket"}-transcript.txt`
    });
    const embed = buildTicketTranscriptEmbed({
      channelName: channel.name,
      channelId: channel.id,
      ticket,
      type,
      closedBy,
      reason,
      messageCount: lines.length,
      closedAt
    });
    const sent = await logChannel.send({
      embeds: [embed],
      files: [file],
      allowedMentions: { users: [] }
    }).catch((error) => {
      logError(`Could not send ticket transcript to configured log channel ${logChannelId}`, error);
      return null;
    });
    if (!sent) return { saved, downloadUrl: null, messageCount: lines.length };
    const downloadUrl = sent.attachments.first()?.url ?? null;
    if (downloadUrl) {
      await sent.edit({
        embeds: [embed],
        components: [
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setStyle(ButtonStyle.Link)
              .setLabel("Download Transcript")
              .setURL(downloadUrl)
          )
        ]
      }).catch((error) => logError("Could not add transcript download button", error));
    }
    return { saved: true, downloadUrl, messageCount: lines.length };
  } catch (error) {
    logError("Could not export ticket transcript", error);
    return { saved: false, downloadUrl: null, messageCount: 0 };
  }
}

export async function prepareTicketCloseRequest(
  interaction: CloseRequestInteraction,
  reason: string,
  requestSource: CloseRequestSource
): Promise<{ payload?: InteractionReplyOptions; error?: string }> {
  if (!interaction.guildId || !interaction.guild || !(interaction.channel instanceof TextChannel)) {
    return { error: "Close requests only work inside an active ticket text channel." };
  }
  const guildId = interaction.guildId;
  const guild = interaction.guild;
  const channel = interaction.channel;
  const channelId = channel.id;

  const ticket = await getTicketByChannel(guildId, channelId);
  if (!ticket) return { error: "This channel is not registered as a ticket." };
  if (ticket.status !== "open") return { error: `This ticket is ${ticket.status} and cannot receive a close request.` };

  const type = ticket.ticketTypeId ? await getTicketType(ticket.ticketTypeId, guildId) : null;
  const access = await ticketActorAccess(
    guild,
    interaction.user.id,
    ticket,
    type,
    interaction.memberPermissions
  );
  const creationDenial = closeRequestCreationDenial(
    requestSource,
    access.isStaff,
    access.isCommunity
  );
  if (creationDenial) return { error: creationDenial };
  if (requestSource === "staff" && ticket.userId === interaction.user.id) {
    return {
      error: "You opened this ticket, so use the **Request Staff Close** button instead. Another staff member must review that request."
    };
  }

  const existing = await getPendingCloseRequestForTicket(guildId, ticket.id);
  if (existing) {
    return {
      error: `Close request #${existing.id} is already waiting for ${closeRequestAudience(existing.requestSource)} to respond.`
    };
  }

  const botMember = guild.members.me ?? await guild.members.fetchMe().catch(() => null);
  if (!botMember) return { error: "I could not verify my permissions in this server." };
  const permissions = channel.permissionsFor(botMember);
  if (!permissions?.has(PermissionFlagsBits.ViewChannel) || !permissions.has(PermissionFlagsBits.SendMessages)) {
    return { error: "I need View Channel and Send Messages in this ticket before I can create a close request." };
  }

  const settings = await getGuildSettings(guildId);
  const staffRoleIds = [...new Set([...settings.staffRoleIds, ...(type?.staffRoleIds ?? [])])];
  if (requestSource === "community") {
    const unmentionableStaffRole = staffRoleIds
      .map((id) => guild.roles.cache.get(id))
      .find((role) => role && !role.mentionable);
    if (unmentionableStaffRole && !permissions.has(PermissionFlagsBits.MentionEveryone)) {
      return {
        error: `I need Mention @everyone, @here, and All Roles to notify ${unmentionableStaffRole.name}, or that staff role must be mentionable.`
      };
    }
  }

  const request = await createCloseRequest({
    guildId,
    ticketId: ticket.id,
    requestedBy: interaction.user.id,
    requestSource,
    reason
  });
  if (!request) return { error: "A close request was created at the same time and is already pending." };

  const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`ticket-close:accept:${request.id}`).setLabel("Accept Close").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`ticket-close:deny:${request.id}`).setLabel("Deny Close").setStyle(ButtonStyle.Danger)
  );
  const staffRoleMentions = staffRoleIds.map((id) => `<@&${id}>`).join(" ");
  const audience = closeRequestAudience(requestSource);
  const audienceMention = requestSource === "staff"
    ? `<@${ticket.userId}>`
    : staffRoleMentions;
  const title = requestSource === "staff"
    ? "Staff Requested Ticket Closure"
    : "Community Requested Staff Closure";
  const embed = new EmbedBuilder()
    .setColor(asColor("#FEE75C"))
    .setTitle(title)
    .setDescription(
      requestSource === "staff"
        ? "Staff believe this ticket is ready to close. The ticket opener or an allowed community member must accept or deny the request."
        : "The ticket opener or community has asked staff to close this ticket. A staff member must accept or deny the request."
    )
    .addFields(
      { name: "Status", value: `Waiting for ${audience}`, inline: false },
      { name: "Requested by", value: `<@${interaction.user.id}>\n\`${interaction.user.id}\``, inline: true },
      { name: "Ticket requester", value: `<@${ticket.userId}>\n\`${ticket.userId}\``, inline: true },
      { name: "Ticket", value: `#${channel.name}\nID: \`${ticket.id}\``, inline: true },
      { name: "Category", value: type?.label ?? "General", inline: true },
      { name: "Request ID", value: `#${request.id}`, inline: true },
      { name: "Created", value: formatDiscordDate(request.createdAt), inline: true },
      { name: "Reason", value: reason || "No reason provided.", inline: false }
    )
    .setFooter({ text: "The requester cannot decide their own close request." })
    .setTimestamp(new Date(request.createdAt));

  await sendTicketLog(
    guild,
    type,
    "Close request created",
    `Source: **${requestSource === "staff" ? "Staff" : "Community"}**\nRequester: <@${interaction.user.id}> \`${interaction.user.id}\`\nChannel: <#${channelId}> \`${channelId}\`\nWaiting for: **${audience}**\nReason: ${reason || "No reason provided"}`
  );

  return {
    payload: {
      content: audienceMention || undefined,
      embeds: [embed],
      components: [buttons],
      allowedMentions: requestSource === "staff"
        ? { users: [ticket.userId], roles: [] }
        : { users: [], roles: staffRoleIds }
    }
  };
}

export async function handleTicketPanel(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId || !interaction.guild) {
    await replyEphemeral(interaction, "This command can only be used in a server.");
    return;
  }
  await deferCommandReply(interaction);
  if (!(await requireBotAdmin(interaction))) return;

  const requestedId = Number(interaction.options.getString("panel"));
  const panel = requestedId
    ? await getTicketPanel(requestedId, interaction.guildId)
    : (await listTicketPanels(interaction.guildId, true))[0];
  if (!panel?.active) {
    await replyToCommand(interaction, "Create and enable a ticket panel in the dashboard first.");
    return;
  }

  const configuredChannel = panel.targetChannelId
    ? await interaction.guild.channels.fetch(panel.targetChannelId).catch(() => null)
    : null;
  const target = interaction.options.getChannel("channel") ?? configuredChannel ?? interaction.channel;
  if (!target || !("send" in target) || typeof target.send !== "function") {
    await replyToCommand(interaction, "Choose a text channel for the ticket panel.");
    return;
  }

  try {
    await postTicketPanel(interaction.guild, panel.id, target as SendableChannel);
    await replyToCommand(interaction, `Posted **${panel.name}** in ${target}.`);
  } catch (error) {
    logDiscordError(`Ticket panel "${panel.name}" could not be posted`, error);
    const detail = error instanceof Error && !("code" in error)
      ? error.message
      : friendlyDiscordError(error, "Could not post the ticket panel.");
    await replyToCommand(interaction, detail);
  }
}

async function createTicket(interaction: TicketCreateInteraction, panelId: number, typeId: number): Promise<void> {
  if (!interaction.guildId || !interaction.guild) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const [type, panel] = await Promise.all([
    getTicketType(typeId, interaction.guildId),
    getTicketPanel(panelId, interaction.guildId)
  ]);
  if (!type?.active || !panel?.active) {
    await interaction.editReply("That ticket option is no longer available.");
    return;
  }

  const member = await interaction.guild.members.fetch(interaction.user.id);
  if (hasAnyRole(member, type.blockedRoleIds)) {
    await interaction.editReply("One of your roles is blocked from opening this ticket type.");
    return;
  }
  if (type.allowedRoleIds.length && !hasAnyRole(member, type.allowedRoleIds)) {
    await interaction.editReply("You do not have a role that can open this ticket type.");
    return;
  }

  const openCount = await countOpenTicketsForUser(interaction.guildId, interaction.user.id, type.id);
  if (openCount >= type.maxOpenTickets) {
    await interaction.editReply(`You already have the maximum of ${type.maxOpenTickets} open ticket(s) for this type.`);
    return;
  }

  const settings = await getGuildSettings(interaction.guildId);
  const staffRoleIds = [...new Set([...settings.staffRoleIds, ...type.staffRoleIds])];
  const botMember = interaction.guild.members.me ?? await interaction.guild.members.fetchMe();
  if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
    await interaction.editReply("CorePanel needs the Manage Channels permission before it can create ticket channels.");
    return;
  }
  const parentId = type.categoryId ?? settings.ticketCategoryId;
  if (parentId) {
    const category = await interaction.guild.channels.fetch(parentId).catch(() => null);
    if (!category || category.type !== ChannelType.GuildCategory) {
      await interaction.editReply("The configured ticket category no longer exists. Ask an admin to choose a valid category in the dashboard.");
      return;
    }
  }
  await interaction.guild.roles.fetch();
  const missingStaffRole = staffRoleIds.some((roleId) => !interaction.guild!.roles.cache.has(roleId));
  if (missingStaffRole) {
    await interaction.editReply("A configured ticket staff role no longer exists. Ask an admin to refresh the ticket type settings.");
    return;
  }
  const channelName = formatTicketChannelName(type, interaction.user.username, interaction.user.id);
  const channel = await interaction.guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: parentId ?? undefined,
    topic: `Ticket for ${interaction.user.tag} (${interaction.user.id}) - ${type.label}`,
    permissionOverwrites: [
      { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      {
        id: interaction.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles
        ]
      },
      {
        id: botMember.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageChannels
        ]
      },
      ...staffRoleIds.map((roleId) => ({
        id: roleId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory
        ]
      }))
    ]
  });

  const ticketId = await createTicketRecord({
    guildId: interaction.guildId,
    channelId: channel.id,
    userId: interaction.user.id,
    ticketTypeId: type.id,
    panelId
  });
  const ticket = await getTicketByChannel(interaction.guildId, channel.id);

  const rendered = renderEmbedMessage({
    ...emptyEmbedConfig(),
    title: `Support Ticket · ${type.label}`,
    description: type.welcomeMessage,
    color: type.color,
    imageUrl: type.imageUrl,
    thumbnailUrl: type.thumbnailUrl,
    footerText: type.footerText,
    footerIconUrl: type.footerIconUrl,
    timestamp: true,
    fields: [
      { name: "Ticket requester", value: `<@${interaction.user.id}>`, inline: true },
      { name: "Ticket ID", value: `#${ticketId}`, inline: true },
      { name: "Status", value: "Open · waiting for staff", inline: true },
      { name: "Category", value: type.label, inline: true },
      { name: "Created", value: formatDiscordDate(ticket?.openedAt ?? new Date()), inline: true }
    ]
  }, buildDiscordPlaceholders({
    guild: interaction.guild,
    channel,
    user: interaction.user,
    target: interaction.user,
    ticket,
    ticketType: type
  }));

  const pingRoles = [...new Set(type.pingRoleIds)].map((id) => `<@&${id}>`).join(" ");
  await channel.send({
    ...rendered,
    content: [interaction.user.toString(), pingRoles, rendered.content].filter(Boolean).join(" "),
    components: ticketButtons(type),
    allowedMentions: {
      users: [interaction.user.id],
      roles: type.pingRoleIds
    }
  });

  await sendTicketLog(interaction.guild, type, "Ticket opened", `Channel: ${channel} \`${channel.id}\` | Owner: <@${interaction.user.id}> \`${interaction.user.id}\` | Type: **${type.label}**`);
  await interaction.editReply(`Your ticket is ready: ${channel}`);
}

export async function handleTicketCreate(interaction: StringSelectMenuInteraction): Promise<void> {
  const panelId = Number(interaction.customId.split(":")[2]);
  await createTicket(interaction, panelId, Number(interaction.values[0]));
}

export async function handleTicketCreateButton(interaction: ButtonInteraction): Promise<void> {
  const [, , panelValue, typeValue] = interaction.customId.split(":");
  await createTicket(interaction, Number(panelValue), Number(typeValue));
}

export async function handlePanelSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  if (!interaction.guildId || !interaction.guild) return;
  const child = await getTicketPanel(Number(interaction.values[0]), interaction.guildId);
  if (!child?.active) {
    await interaction.reply({ content: "That panel is no longer available.", flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.reply({
    ...(await ticketPanelMessage(
      interaction.guild,
      child,
      interaction.channel && "send" in interaction.channel
        ? interaction.channel as SendableChannel
        : null
    )),
    flags: MessageFlags.Ephemeral
  });
}

async function finishClose(
  guild: Guild,
  channel: TextChannel,
  userId: string,
  reason: string
): Promise<boolean> {
  const ticket = await getTicketByChannel(guild.id, channel.id);
  if (!ticket || ticket.status !== "open") return false;
  const type = ticket.ticketTypeId ? await getTicketType(ticket.ticketTypeId, guild.id) : null;
  if (!(await closeTicket(guild.id, channel.id, userId, reason))) return false;
  await sendTicketTranscript(guild, channel, type, userId, reason);
  await sendTicketLog(
    guild,
    type,
    "Ticket closed",
    `Channel: #${channel.name} \`${channel.id}\` | Closed by: <@${userId}> \`${userId}\` | Owner: <@${ticket.userId}> \`${ticket.userId}\`${reason ? ` | Reason: ${reason}` : ""}`
  );
  setTimeout(() => channel.delete("Ticket closed").catch(() => undefined), 5_000);
  return true;
}

export async function handleTicketButton(interaction: ButtonInteraction): Promise<void> {
  if (!interaction.guildId || !interaction.guild || !(interaction.channel instanceof TextChannel)) return;
  const ticket = await getTicketByChannel(interaction.guildId, interaction.channelId);
  if (!ticket || ticket.status !== "open") {
    await interaction.reply({ content: "This is not an active ticket.", flags: MessageFlags.Ephemeral });
    return;
  }

  const type = ticket.ticketTypeId ? await getTicketType(ticket.ticketTypeId, interaction.guildId) : null;
  if (interaction.customId === "ticket:close-request") {
    const access = await ticketActorAccess(
      interaction.guild,
      interaction.user.id,
      ticket,
      type,
      interaction.memberPermissions
    );
    const denial = closeRequestCreationDenial("community", access.isStaff, access.isCommunity);
    if (denial) {
      await interaction.reply({ content: denial, flags: MessageFlags.Ephemeral });
      return;
    }
    const pending = await getPendingCloseRequestForTicket(interaction.guildId, ticket.id);
    if (pending) {
      await interaction.reply({
        content: `Close request #${pending.id} is already waiting for ${closeRequestAudience(pending.requestSource)} to respond.`,
        flags: MessageFlags.Ephemeral
      });
      return;
    }
    const modal = new ModalBuilder()
      .setCustomId("ticket:close-request-reason")
      .setTitle("Request Staff Closure");
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("reason")
        .setLabel("Why should staff close this ticket?")
        .setPlaceholder("Briefly explain why this ticket is ready to close.")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setMaxLength(500)
    ));
    await interaction.showModal(modal);
    return;
  }

  const allowOwner = interaction.customId === "ticket:close";
  if (!(await canManageTicket(interaction, allowOwner))) {
    await interaction.reply({
      content: "Only the ticket opener or configured ticket staff can use that action.",
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  if (interaction.customId === "ticket:claim") {
    const claimed = await claimTicket(interaction.guildId, interaction.channelId, interaction.user.id);
    await interaction.reply({
      content: claimed ? `Ticket claimed by ${interaction.user}.` : "This ticket has already been claimed.",
      flags: !claimed ? MessageFlags.Ephemeral : undefined
    });
    if (claimed) await sendTicketLog(interaction.guild, type, "Ticket claimed", `Channel: ${interaction.channel} \`${interaction.channel.id}\` | Claimed by: <@${interaction.user.id}> \`${interaction.user.id}\``);
    return;
  }

  if (interaction.customId === "ticket:close" && type?.closeReasonRequired) {
    const modal = new ModalBuilder().setCustomId("ticket:close-reason").setTitle("Close ticket");
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("reason")
        .setLabel("Why is this ticket being closed?")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(500)
    ));
    await interaction.showModal(modal);
    return;
  }

  if (interaction.customId === "ticket:close") {
    const closed = await finishClose(interaction.guild, interaction.channel, interaction.user.id, "");
    await interaction.reply(closed
      ? "Ticket closed. This channel will be deleted in 5 seconds."
      : { content: "This ticket is already closed.", flags: MessageFlags.Ephemeral });
    return;
  }

}

export async function handleTicketCloseModal(interaction: ModalSubmitInteraction): Promise<void> {
  if (!interaction.guild || !(interaction.channel instanceof TextChannel)) return;
  const reason = interaction.fields.getTextInputValue("reason").trim();
  const closed = await finishClose(interaction.guild, interaction.channel, interaction.user.id, reason);
  await interaction.reply(closed
    ? "Ticket closed. This channel will be deleted in 5 seconds."
    : { content: "This ticket is already closed.", flags: MessageFlags.Ephemeral });
}

export async function handleTicketCloseRequestModal(interaction: ModalSubmitInteraction): Promise<void> {
  const reason = interaction.fields.getTextInputValue("reason").trim();
  const prepared = await prepareTicketCloseRequest(interaction, reason, "community");
  await interaction.reply(prepared.payload ?? {
    content: prepared.error ?? "Could not create the close request.",
    flags: MessageFlags.Ephemeral
  });
}

function resolvedCloseRequestEmbed(input: {
  request: TicketCloseRequest;
  channel: TextChannel;
  type: TicketType | null;
  ticketOwnerId: string;
  resolvedBy: string;
  accepted: boolean;
}) {
  const { request, channel, type, ticketOwnerId, resolvedBy, accepted } = input;
  return new EmbedBuilder()
    .setColor(asColor(accepted ? "#57F287" : "#ED4245"))
    .setTitle(accepted ? "Close Request Accepted" : "Close Request Denied")
    .setDescription(
      accepted
        ? "The required reviewer accepted this request. The transcript is being saved before the ticket channel is removed."
        : "The required reviewer denied this request. The ticket will remain open."
    )
    .addFields(
      { name: "Status", value: accepted ? "Accepted · closing ticket" : "Denied · ticket remains open", inline: false },
      { name: "Request source", value: request.requestSource === "staff" ? "Staff" : "Ticket opener / community", inline: true },
      { name: "Requested by", value: `<@${request.requestedBy}>`, inline: true },
      { name: "Reviewed by", value: `<@${resolvedBy}>`, inline: true },
      { name: "Ticket requester", value: `<@${ticketOwnerId}>`, inline: true },
      { name: "Ticket", value: `#${channel.name}\nID: \`${request.ticketId}\``, inline: true },
      { name: "Category", value: type?.label ?? "General", inline: true },
      { name: "Reason", value: request.reason || "No reason provided.", inline: false }
    )
    .setFooter({ text: `Close request #${request.id}` })
    .setTimestamp();
}

export async function handleTicketCloseDecision(interaction: ButtonInteraction): Promise<void> {
  if (!interaction.guild || !(interaction.channel instanceof TextChannel)) return;
  const [, action, requestIdText] = interaction.customId.split(":");
  const requestId = Number(requestIdText);
  const request = await getTicketCloseRequest(requestId, interaction.guild.id);
  if (!request || request.status !== "pending") {
    await interaction.reply({ content: "That close request has already been handled or no longer exists.", flags: MessageFlags.Ephemeral });
    return;
  }

  const ticket = await getTicketByChannel(interaction.guild.id, interaction.channel.id);
  if (!ticket || ticket.status !== "open") {
    await interaction.reply({ content: "This ticket is no longer active.", flags: MessageFlags.Ephemeral });
    return;
  }
  if (request.ticketId !== ticket.id) {
    await interaction.reply({ content: "That close request belongs to a different ticket.", flags: MessageFlags.Ephemeral });
    return;
  }

  const type = ticket.ticketTypeId ? await getTicketType(ticket.ticketTypeId, interaction.guild.id) : null;
  const access = await ticketActorAccess(
    interaction.guild,
    interaction.user.id,
    ticket,
    type,
    interaction.memberPermissions
  );
  const denial = closeRequestDecisionDenial(
    request.requestSource,
    access.isStaff,
    access.isCommunity,
    request.requestedBy === interaction.user.id
  );
  if (denial) {
    await interaction.reply({ content: denial, flags: MessageFlags.Ephemeral });
    return;
  }

  const accepted = action === "accept" || action === "approve";
  if (!accepted && action !== "deny") {
    await interaction.reply({ content: "That close-request action is invalid.", flags: MessageFlags.Ephemeral });
    return;
  }
  const resolved = await resolveCloseRequest(
    request.id,
    interaction.guild.id,
    interaction.user.id,
    accepted ? "approved" : "denied"
  );
  if (!resolved) {
    await interaction.reply({ content: "Someone else handled that close request first.", flags: MessageFlags.Ephemeral });
    return;
  }

  const resultEmbed = resolvedCloseRequestEmbed({
    request,
    channel: interaction.channel,
    type,
    ticketOwnerId: ticket.userId,
    resolvedBy: interaction.user.id,
    accepted
  });
  await interaction.update({
    content: null,
    embeds: [resultEmbed],
    components: []
  });

  if (!accepted) {
    await sendTicketLog(
      interaction.guild,
      type,
      "Close request denied",
      `Request: \`#${request.id}\`\nSource: **${request.requestSource === "staff" ? "Staff" : "Community"}**\nChannel: <#${interaction.channel.id}> \`${interaction.channel.id}\`\nDenied by: <@${interaction.user.id}> \`${interaction.user.id}\`\nRequester: <@${request.requestedBy}> \`${request.requestedBy}\`${request.reason ? `\nReason: ${request.reason}` : ""}`
    );
    return;
  }

  const closed = await closeTicket(
    interaction.guild.id,
    interaction.channel.id,
    interaction.user.id,
    request.reason
  );
  if (!closed) return;

  const transcript = await sendTicketTranscript(
    interaction.guild,
    interaction.channel,
    type,
    interaction.user.id,
    request.reason
  );
  const delaySeconds = Math.max(5, type?.closeRequestDelaySeconds ?? 5);
  await interaction.followUp({
    embeds: [
      new EmbedBuilder()
        .setColor(asColor("#57F287"))
        .setTitle("Ticket Closing")
        .setDescription(`This ticket will be removed in **${delaySeconds} seconds**.`)
        .addFields(
          { name: "Transcript", value: transcript.saved ? `Saved ${transcript.messageCount} message(s) to the transcript channel.` : "No transcript channel is configured or the export failed.", inline: false },
          { name: "Closed by", value: `<@${interaction.user.id}>`, inline: true },
          { name: "Ticket ID", value: `#${ticket.id}`, inline: true }
        )
        .setTimestamp()
    ],
    allowedMentions: { users: [] }
  });
  await sendTicketLog(
    interaction.guild,
    type,
    "Ticket closed",
    `**#${interaction.channel.name}** closed by <@${interaction.user.id}> after close request #${request.id}. Owner: <@${ticket.userId}>.${request.reason ? `\nReason: ${request.reason}` : ""}`
  );
  setTimeout(() => interaction.channel?.delete("Ticket close request accepted").catch(() => undefined), delaySeconds * 1000);
}

export async function processInactiveTickets(clientGuilds: ReadonlyMap<string, Guild>): Promise<void> {
  for (const ticket of await listInactiveTickets()) {
    const guild = clientGuilds.get(ticket.guildId);
    const channel = guild ? await guild.channels.fetch(ticket.channelId).catch(() => null) : null;
    if (guild && channel instanceof TextChannel) {
      await finishClose(guild, channel, guild.members.me?.id ?? "system", `Automatically closed after ${ticket.autoCloseHours} hours of inactivity.`);
    }
  }
}

export function availableTicketPanels(guildId: string): Promise<TicketPanel[]> {
  return listTicketPanels(guildId, true);
}

export function availableTicketTypes(guildId: string): Promise<TicketType[]> {
  return listTicketTypes(guildId, true);
}
