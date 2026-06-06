import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChannelType,
  ChatInputCommandInteraction,
  EmbedBuilder,
  Guild,
  GuildMember,
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
  createTicketRecord,
  getBranding,
  getGuildSettings,
  getTicketByChannel,
  getTicketPanel,
  getTicketType,
  listInactiveTickets,
  listTicketPanels,
  listTicketTypes
} from "../database/index.js";
import type { TicketPanel, TicketType } from "../shared/types.js";
import { emptyEmbedConfig } from "../shared/types.js";
import { renderEmbedMessage } from "./messages.js";
import { asColor, requireBotAdmin, sendGuildLog } from "./utils.js";

type SendableChannel = { send: (message: any) => Promise<unknown> };
type TicketCreateInteraction = StringSelectMenuInteraction | ButtonInteraction;

function placeholderValues(guild: Guild) {
  return {
    user: "@user",
    username: "username",
    server: guild.name,
    channel: "#channel",
    text: "",
    reason: "",
    target: "@target"
  };
}

async function ticketPanelMessage(guild: Guild, panel: TicketPanel) {
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
  const rendered = renderEmbedMessage(embedConfig, placeholderValues(guild));
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
          .setEmoji(type.emoji || "🎫")
          .setStyle(ButtonStyle.Secondary)
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
          emoji: type.emoji || undefined
        })))
    ));
  }
  return { ...rendered, components };
}

export async function postTicketPanel(guild: Guild, panelId: number, channel: SendableChannel): Promise<void> {
  const panel = await getTicketPanel(panelId, guild.id);
  if (!panel?.active) throw new Error("Ticket panel not found or inactive.");
  await channel.send(await ticketPanelMessage(guild, panel));
}

function ticketButtons(type: TicketType): ActionRowBuilder<ButtonBuilder>[] {
  const buttons: ButtonBuilder[] = [];
  if (type.claimButtonEnabled) {
    buttons.push(new ButtonBuilder().setCustomId("ticket:claim").setLabel("Claim ticket").setStyle(ButtonStyle.Primary));
  }
  if (type.closeButtonEnabled && !type.requestCloseEnabled) {
    buttons.push(new ButtonBuilder().setCustomId("ticket:close").setLabel("Close ticket").setStyle(ButtonStyle.Danger));
  }
  if (type.requestCloseEnabled) {
    buttons.push(new ButtonBuilder().setCustomId("ticket:close-request").setLabel("Request close").setStyle(ButtonStyle.Secondary));
  }
  return buttons.length ? [new ActionRowBuilder<ButtonBuilder>().addComponents(buttons)] : [];
}

function sanitizeChannelName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 90);
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
    .setTimestamp();
  await sendGuildLog(
    guild.id,
    type?.transcriptChannelId ?? settings.transcriptChannelId,
    (id) => guild.channels.fetch(id),
    embed
  );
}

export async function handleTicketPanel(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId || !interaction.guild) {
    await interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
    return;
  }
  if (!(await requireBotAdmin(interaction))) return;

  const requestedId = Number(interaction.options.getString("panel"));
  const panel = requestedId
    ? await getTicketPanel(requestedId, interaction.guildId)
    : (await listTicketPanels(interaction.guildId, true))[0];
  if (!panel?.active) {
    await interaction.reply({ content: "Create and enable a ticket panel in the dashboard first.", ephemeral: true });
    return;
  }

  const configuredChannel = panel.targetChannelId
    ? await interaction.guild.channels.fetch(panel.targetChannelId).catch(() => null)
    : null;
  const target = interaction.options.getChannel("channel") ?? configuredChannel ?? interaction.channel;
  if (!target || !("send" in target) || typeof target.send !== "function") {
    await interaction.reply({ content: "Choose a text channel for the ticket panel.", ephemeral: true });
    return;
  }

  await postTicketPanel(interaction.guild, panel.id, target as SendableChannel);
  await interaction.reply({ content: `Posted **${panel.name}** in ${target}.`, ephemeral: true });
}

async function createTicket(interaction: TicketCreateInteraction, panelId: number, typeId: number): Promise<void> {
  if (!interaction.guildId || !interaction.guild) return;
  await interaction.deferReply({ ephemeral: true });
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
  const channelName = formatTicketChannelName(type, interaction.user.username, interaction.user.id);
  const channel = await interaction.guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: type.categoryId ?? settings.ticketCategoryId ?? undefined,
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

  await createTicketRecord({
    guildId: interaction.guildId,
    channelId: channel.id,
    userId: interaction.user.id,
    ticketTypeId: type.id,
    panelId
  });

  const rendered = renderEmbedMessage({
    ...emptyEmbedConfig(),
    title: type.label,
    description: type.welcomeMessage,
    color: type.color,
    imageUrl: type.imageUrl,
    thumbnailUrl: type.thumbnailUrl,
    footerText: type.footerText,
    footerIconUrl: type.footerIconUrl,
    timestamp: true,
    fields: [{ name: "Opened by", value: `<@${interaction.user.id}>`, inline: false }]
  }, {
    user: interaction.user.toString(),
    username: interaction.user.username,
    server: interaction.guild.name,
    channel: channel.toString(),
    text: "",
    reason: "",
    target: interaction.user.toString()
  });

  const pingRoles = [...new Set(type.pingRoleIds)].map((id) => `<@&${id}>`).join(" ");
  await channel.send({
    ...rendered,
    content: [interaction.user.toString(), pingRoles, rendered.content].filter(Boolean).join(" "),
    components: ticketButtons(type)
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
    await interaction.reply({ content: "That panel is no longer available.", ephemeral: true });
    return;
  }
  await interaction.reply({ ...(await ticketPanelMessage(interaction.guild, child)), ephemeral: true });
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
    await interaction.reply({ content: "This is not an active ticket.", ephemeral: true });
    return;
  }

  const allowOwner = interaction.customId === "ticket:close" || interaction.customId === "ticket:close-request";
  if (!(await canManageTicket(interaction, allowOwner))) {
    await interaction.reply({ content: "You are not allowed to manage this ticket.", ephemeral: true });
    return;
  }

  const type = ticket.ticketTypeId ? await getTicketType(ticket.ticketTypeId, interaction.guildId) : null;
  if (interaction.customId === "ticket:claim") {
    const claimed = await claimTicket(interaction.guildId, interaction.channelId, interaction.user.id);
    await interaction.reply({
      content: claimed ? `Ticket claimed by ${interaction.user}.` : "This ticket has already been claimed.",
      ephemeral: !claimed
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
      : { content: "This ticket is already closed.", ephemeral: true });
    return;
  }

  if (interaction.customId === "ticket:close-request") {
    const modal = new ModalBuilder().setCustomId("ticket:close-request-reason").setTitle("Request to close ticket");
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("reason")
        .setLabel("Why do you want to close this ticket?")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setMaxLength(500)
    ));
    await interaction.showModal(modal);
    return;
  }
}

export async function handleTicketCloseModal(interaction: ModalSubmitInteraction): Promise<void> {
  if (!interaction.guild || !(interaction.channel instanceof TextChannel)) return;
  const reason = interaction.fields.getTextInputValue("reason").trim();
  const closed = await finishClose(interaction.guild, interaction.channel, interaction.user.id, reason);
  await interaction.reply(closed
    ? "Ticket closed. This channel will be deleted in 5 seconds."
    : { content: "This ticket is already closed.", ephemeral: true });
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
