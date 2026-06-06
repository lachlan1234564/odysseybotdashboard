import {
  ActionRowBuilder,
  AutocompleteInteraction,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  Client,
  Events,
  GatewayIntentBits,
  ModalSubmitInteraction,
  PermissionFlagsBits,
  StringSelectMenuInteraction,
  TextChannel
} from "discord.js";
import {
  listAnnouncements,
  listCustomCommands,
  updateTicketActivity,
  getWelcomeSettings,
  getTicketByChannel,
  getTicketType,
  resolveCloseRequest,
  getTicketCloseRequest,
  closeTicket,
  getGuildSettings,
  getPendingCloseRequestForTicket,
  createCloseRequest
} from "../database/index.js";
import { loadDiscordConfig } from "../shared/config.js";
import { handleAnnounce, handleAnnouncementButton } from "./announcements.js";
import { handleCustomCommand } from "./custom-commands.js";
import { handleModeration } from "./moderation.js";
import {
  availableTicketPanels,
  handlePanelSelect,
  handleTicketButton,
  handleTicketCloseModal,
  handleTicketCreate,
  handleTicketCreateButton,
  handleTicketPanel,
  processInactiveTickets,
  sendTicketLog
} from "./tickets.js";
import { handleGuildMemberAdd } from "./anti-raid.js";
import { auditHandler } from "./anti-nuke.js";
import { renderEmbedMessage } from "./messages.js";
import { emptyEmbedConfig } from "../shared/types.js";
import { replacePlaceholders } from "../shared/placeholders.js";
import { asColor } from "./utils.js";

const config = loadDiscordConfig();
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildModeration
  ]
});

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Rapid Bot logged in as ${readyClient.user.tag}.`);
  setInterval(() => {
    processInactiveTickets(readyClient.guilds.cache).catch((error) => {
      console.error("Inactive ticket sweep failed:", error);
    });
  }, 15 * 60_000).unref();
});

client.on(Events.MessageCreate, async (message) => {
  if (message.guildId && !message.author.bot) {
    await updateTicketActivity(message.guildId, message.channelId).catch((error) => {
      console.error("Ticket activity update failed:", error);
    });
  }
});

client.on(Events.GuildMemberAdd, async (member) => {
  await handleGuildMemberAdd(member).catch((error) => {
    console.error("Anti-raid member add handler failed:", error);
  });
  await handleWelcome(member).catch((error) => {
    console.error("Welcome handler failed:", error);
  });
});

async function handleWelcome(member: import("discord.js").GuildMember): Promise<void> {
  if (member.user.bot) return;
  const settings = await getWelcomeSettings(member.guild.id);
  if (!settings.enabled) return;

  const variables = {
    user: `<@${member.id}>`,
    username: member.user.username,
    server: member.guild.name,
    channel: "#general",
    text: "",
    reason: "",
    target: `<@${member.id}>`,
    memberCount: String(member.guild.memberCount ?? 0),
    createdAt: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:D>`
  };

  if (settings.channelId) {
    const channel = await member.guild.channels.fetch(settings.channelId).catch(() => null);
    if (channel && channel.isTextBased() && !channel.isDMBased() && "send" in channel) {
      const content = replacePlaceholders(settings.content, variables);
      const hasEmbed = settings.embedTitle || settings.embedDescription || settings.embedImageUrl || settings.embedThumbnailUrl || settings.embedFooterText;
      if (hasEmbed) {
        const embed = renderEmbedMessage({
          ...emptyEmbedConfig(),
          content: "",
          title: settings.embedTitle,
          description: settings.embedDescription,
          color: settings.embedColor,
          imageUrl: settings.embedImageUrl,
          thumbnailUrl: settings.embedThumbnailUrl,
          footerText: settings.embedFooterText
        }, variables);
        await channel.send({ content: content || undefined, ...embed }).catch(() => undefined);
      } else if (content) {
        await channel.send(content).catch(() => undefined);
      }
    }
  }

  if (settings.dmEnabled && (settings.dmContent || settings.dmEmbedEnabled)) {
    try {
      const dmContent = replacePlaceholders(settings.dmContent, variables);
      if (settings.dmEmbedEnabled) {
        const embed = renderEmbedMessage({
          ...emptyEmbedConfig(),
          content: "",
          title: settings.embedTitle,
          description: settings.embedDescription,
          color: settings.embedColor,
          imageUrl: settings.embedImageUrl,
          thumbnailUrl: settings.embedThumbnailUrl,
          footerText: settings.embedFooterText
        }, variables);
        await member.send({ content: dmContent || undefined, ...embed });
      } else if (dmContent) {
        await member.send(dmContent);
      }
    } catch {
      // DMs disabled or blocked
    }
  }

  if (settings.autoRoleIds.length > 0) {
    for (const roleId of settings.autoRoleIds) {
      const role = await member.guild.roles.fetch(roleId).catch(() => null);
      if (role) await member.roles.add(role, "Welcome auto-role").catch(() => undefined);
    }
  }
}

client.on(Events.ChannelDelete, async (channel) => {
  if (channel.isDMBased() || !channel.guild) return;
  await auditHandler(channel.guild, 12); // AuditLogEvent.ChannelDelete
});

client.on(Events.ChannelCreate, async (channel) => {
  if (channel.isDMBased() || !channel.guild) return;
  await auditHandler(channel.guild, 10); // AuditLogEvent.ChannelCreate
});

client.on(Events.GuildBanAdd, async (ban) => {
  await auditHandler(ban.guild, 22); // AuditLogEvent.MemberBanAdd
});

client.on(Events.GuildMemberRemove, async (member) => {
  if (member.user.bot || !member.guild) return;
  try {
    const fetched = await member.guild.fetchAuditLogs({ limit: 1, type: 20 }); // MemberKick
    const entry = fetched.entries.first();
    if (entry && entry.executorId && entry.targetId === member.id && Date.now() - entry.createdTimestamp < 5000) {
      await import("./anti-nuke.js").then((m) => m.checkEvent(member.guild, entry.executorId!, "kick", entry.targetId ?? undefined));
    }
  } catch {
    // ignore
  }
});

client.on(Events.GuildRoleDelete, async (role) => {
  await auditHandler(role.guild, 32); // AuditLogEvent.RoleDelete
});

client.on(Events.GuildRoleCreate, async (role) => {
  await auditHandler(role.guild, 30); // AuditLogEvent.RoleCreate
});

client.on(Events.WebhooksUpdate, async (channel) => {
  if (!channel.guild) return;
  await auditHandler(channel.guild, 50); // AuditLogEvent.WebhookCreate
  await auditHandler(channel.guild, 52); // AuditLogEvent.WebhookDelete
});

client.on(Events.GuildMemberUpdate, async (_oldMember, newMember) => {
  if (!newMember.guild) return;
  const hadAdmin = _oldMember.roles.cache.some((r) => r.permissions.has(PermissionFlagsBits.Administrator));
  const hasAdmin = newMember.roles.cache.some((r) => r.permissions.has(PermissionFlagsBits.Administrator));
  if (hadAdmin !== hasAdmin) {
    await import("./anti-nuke.js").then((m) => m.checkEvent(newMember.guild, newMember.guild.members.me?.id ?? "system", "adminRoleChange", newMember.id));
  }
});

async function handleAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
  if (!interaction.guildId) return interaction.respond([]);
  const query = interaction.options.getFocused().toLowerCase();

  if (interaction.commandName === "custom") {
    const choices = (await listCustomCommands(interaction.guildId))
      .filter((command) => command.enabled && command.name.includes(query))
      .slice(0, 25)
      .map((command) => ({ name: command.name, value: command.name }));
    await interaction.respond(choices);
  }

  if (interaction.commandName === "ticket-panel") {
    const choices = (await availableTicketPanels(interaction.guildId))
      .filter((panel) => panel.name.toLowerCase().includes(query))
      .slice(0, 25)
      .map((panel) => ({ name: panel.name, value: String(panel.id) }));
    await interaction.respond(choices);
  }

  if (interaction.commandName === "announce") {
    const choices = (await listAnnouncements(interaction.guildId))
      .filter((template) => template.name.toLowerCase().includes(query))
      .slice(0, 25)
      .map((template) => ({ name: template.name, value: String(template.id) }));
    await interaction.respond(choices);
  }
}

async function handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  if (interaction.commandName === "ping") {
    await interaction.reply({ content: `Pong! ${client.ws.ping}ms`, ephemeral: true });
    return;
  }

  if (interaction.commandName === "custom") {
    await handleCustomCommand(interaction);
    return;
  }

  if (interaction.commandName === "ticket-panel") {
    await handleTicketPanel(interaction);
    return;
  }

  if (interaction.commandName === "announce") {
    await handleAnnounce(interaction);
    return;
  }

  if (interaction.commandName === "close-request") {
    await handleCloseRequest(interaction);
    return;
  }

  if (["warn", "warnings", "timeout", "kick", "ban", "clear"].includes(interaction.commandName)) {
    await handleModeration(interaction);
  }
}

async function handleCloseRequest(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId || !interaction.guild) {
    await interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
    return;
  }
  if (!(interaction.channel instanceof TextChannel)) {
    await interaction.reply({ content: "This command only works inside ticket channels.", ephemeral: true });
    return;
  }

  const ticket = await getTicketByChannel(interaction.guildId, interaction.channelId);
  if (!ticket || ticket.status !== "open") {
    await interaction.reply({ content: "This is not an active ticket channel.", ephemeral: true });
    return;
  }

  const existing = await getPendingCloseRequestForTicket(interaction.guildId, ticket.id);
  if (existing) {
    await interaction.reply({ content: "A close request is already pending for this ticket.", ephemeral: true });
    return;
  }

  const reason = interaction.options.getString("reason") ?? "";
  const request = await createCloseRequest({
    guildId: interaction.guildId,
    ticketId: ticket.id,
    requestedBy: interaction.user.id,
    reason,
    status: "pending"
  });

  const settings = await getGuildSettings(interaction.guildId);
  const type = ticket.ticketTypeId ? await getTicketType(ticket.ticketTypeId, interaction.guildId) : null;
  const staffRoleIds = [...new Set([...settings.staffRoleIds, ...(type?.staffRoleIds ?? [])])];
  const staffRoleMentions = staffRoleIds.map((id) => `<@&${id}>`).join(" ");

  const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`ticket-close:approve:${request.id}`).setLabel("Approve close").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`ticket-close:deny:${request.id}`).setLabel("Deny close").setStyle(ButtonStyle.Danger)
  );

  await interaction.reply({
    content: `${interaction.user} requested to close this ticket.${reason ? "\nReason: " + reason : ""}${staffRoleMentions ? "\n" + staffRoleMentions : ""}`,
    components: [buttons]
  });

  await sendTicketLog(
    interaction.guild,
    type,
    "Close request created",
    `<@${interaction.user.id}> \`${interaction.user.id}\` requested to close <#${interaction.channelId}> \`${interaction.channelId}\`.${reason ? `\nReason: ${reason}` : ""}`
  );
}

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isAutocomplete()) {
      await handleAutocomplete(interaction);
    } else if (interaction.isChatInputCommand()) {
      await handleCommand(interaction);
    } else if (interaction.isStringSelectMenu() && interaction.customId.startsWith("ticket:create:")) {
      await handleTicketCreate(interaction);
    } else if (interaction.isStringSelectMenu() && interaction.customId.startsWith("ticket:panel-select:")) {
      await handlePanelSelect(interaction);
    } else if (interaction.isButton() && interaction.customId.startsWith("ticket:create-button:")) {
      await handleTicketCreateButton(interaction);
    } else if (interaction.isButton() && interaction.customId.startsWith("ticket:")) {
      await handleTicketButton(interaction);
    } else if (interaction.isButton() && interaction.customId.startsWith("ticket-close:")) {
      await handleTicketCloseButton(interaction as ButtonInteraction);
    } else if (interaction.isButton() && interaction.customId.startsWith("announce:")) {
      await handleAnnouncementButton(interaction);
    } else if (interaction.isModalSubmit() && interaction.customId === "ticket:close-reason") {
      await handleTicketCloseModal(interaction);
    } else if (interaction.isModalSubmit() && interaction.customId === "ticket:close-request-reason") {
      await handleTicketCloseRequestModal(interaction as ModalSubmitInteraction);
    }
  } catch (error) {
    console.error("Interaction failed:", error);
    if (interaction.isRepliable()) {
      const message = { content: "Something went wrong while handling that action.", ephemeral: true };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(message).catch(() => undefined);
      } else {
        await interaction.reply(message).catch(() => undefined);
      }
    }
  }
});

async function handleTicketCloseButton(interaction: ButtonInteraction): Promise<void> {
  if (!interaction.guild || !(interaction.channel instanceof TextChannel)) return;
  const [, action, requestIdStr] = interaction.customId.split(":");
  const requestId = Number(requestIdStr);
  const request = await getTicketCloseRequest(requestId, interaction.guild.id);
  if (!request || request.status !== "pending") {
    await interaction.reply({ content: "That close request is no longer pending.", ephemeral: true });
    return;
  }

  const ticket = await getTicketByChannel(interaction.guild.id, interaction.channel.id);
  if (!ticket || ticket.status !== "open") {
    await interaction.reply({ content: "This is not an active ticket.", ephemeral: true });
    return;
  }

  const settings = await getGuildSettings(interaction.guild.id);
  const type = ticket.ticketTypeId ? await getTicketType(ticket.ticketTypeId, interaction.guild.id) : null;
  const member = await interaction.guild.members.fetch(interaction.user.id);
  const isStaff = interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels)
    || member.roles.cache.some((r) => [...settings.staffRoleIds, ...(type?.staffRoleIds ?? [])].includes(r.id));

  if (!isStaff) {
    await interaction.reply({ content: "Only staff can approve or deny close requests.", ephemeral: true });
    return;
  }

  if (action === "approve") {
    const closed = await closeTicket(interaction.guild.id, interaction.channel.id, interaction.user.id, request.reason);
    if (closed) {
      await resolveCloseRequest(requestId, interaction.guild.id, interaction.user.id, "approved");
      const delaySeconds = type?.closeRequestDelaySeconds ?? 5;
      await interaction.reply(`Close request approved by ${interaction.user}. This channel will be deleted in ${delaySeconds} second(s).`);
      await sendTicketLog(
        interaction.guild,
        type,
        "Ticket closed",
        `**#${interaction.channel.name}** closed by <@${interaction.user.id}> (approved close request). Owner: <@${ticket.userId}>.${request.reason ? `\nReason: ${request.reason}` : ""}`
      );
      setTimeout(() => interaction.channel!.delete("Ticket closed").catch(() => undefined), delaySeconds * 1000);
    } else {
      await interaction.reply({ content: "This ticket is already closed.", ephemeral: true });
    }
  } else {
    await resolveCloseRequest(requestId, interaction.guild.id, interaction.user.id, "denied");
    await interaction.reply(`Close request denied by ${interaction.user}.`);
  }
}

async function handleTicketCloseRequestModal(interaction: ModalSubmitInteraction): Promise<void> {
  if (!interaction.guild || !(interaction.channel instanceof TextChannel)) return;
  const reason = interaction.fields.getTextInputValue("reason").trim();
  const ticket = await getTicketByChannel(interaction.guild.id, interaction.channel.id);
  if (!ticket || ticket.status !== "open") {
    await interaction.reply({ content: "This is not an active ticket.", ephemeral: true });
    return;
  }

  const request = await import("../database/index.js").then((db) => db.createCloseRequest({
    guildId: interaction.guild!.id,
    ticketId: ticket.id,
    requestedBy: interaction.user.id,
    reason,
    status: "pending"
  }));

  const settings = await getGuildSettings(interaction.guild.id);
  const type = ticket.ticketTypeId ? await getTicketType(ticket.ticketTypeId, interaction.guild.id) : null;
  const staffRoleMentions = [...new Set([...settings.staffRoleIds, ...(type?.staffRoleIds ?? [])])].map((id) => `<@&${id}>`).join(" ");

  const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`ticket-close:approve:${request.id}`).setLabel("Approve close").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`ticket-close:deny:${request.id}`).setLabel("Deny close").setStyle(ButtonStyle.Danger)
  );

  await interaction.reply({
    content: `${interaction.user} requested to close this ticket.${reason ? `\nReason: ${reason}` : ""}${staffRoleMentions ? `\n${staffRoleMentions}` : ""}`,
    components: [buttons]
  });
}

client.login(config.DISCORD_TOKEN);
