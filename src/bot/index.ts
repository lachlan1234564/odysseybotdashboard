import {
  AuditLogEvent,
  AutocompleteInteraction,
  ButtonInteraction,
  ChatInputCommandInteraction,
  Client,
  Events,
  GatewayIntentBits,
  ModalSubmitInteraction,
  PermissionFlagsBits,
  StringSelectMenuInteraction
} from "discord.js";
import {
  listAnnouncements,
  listCustomCommands,
  updateTicketActivity,
  getWelcomeSettings
} from "../database/index.js";
import { loadDiscordConfig } from "../shared/config.js";
import { handleAnnounce, handleAnnouncementButton } from "./announcements.js";
import { handleCustomCommand } from "./custom-commands.js";
import { handleModeration } from "./moderation.js";
import {
  availableTicketPanels,
  handlePanelSelect,
  handleTicketButton,
  handleTicketCloseDecision,
  handleTicketCloseModal,
  handleTicketCloseRequestModal,
  handleTicketCreate,
  handleTicketCreateButton,
  handleTicketPanel,
  handleTicketPrioritySelect,
  processInactiveTickets,
  prepareTicketCloseRequest
} from "./tickets.js";
import { handleGuildMemberAdd } from "./anti-raid.js";
import { auditHandler } from "./anti-nuke.js";
import {
  handleMemberRoleUpdate,
  handleRoleCreate,
  handleRoleDelete,
  handleRoleUpdate
} from "./anti-role.js";
import { handleAutoModMessage } from "./auto-mod.js";
import {
  availableRolePanels,
  handleReactionRolesCommand,
  handleRolePanelButton
} from "./role-panels.js";
import { handleStickyActivity } from "./sticky-messages.js";
import { processScheduledAnnouncements } from "./scheduled-announcements.js";
import { renderEmbedMessage } from "./messages.js";
import { emptyEmbedConfig } from "../shared/types.js";
import { replacePlaceholders } from "../shared/placeholders.js";
import { buildDiscordPlaceholders } from "./placeholders.js";
import { handleHelpCommand } from "./help.js";
import {
  handleBotHelp,
  handleServerInfo,
  handleUserInfo,
  handleAutomodStatus,
  handleSocialsPost
} from "./info-commands.js";
import {
  handleLockdown,
  handleUnlockdown,
  handleBotStatus
} from "./admin-commands.js";
import { logError } from "../shared/logging.js";

const config = loadDiscordConfig();
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.MessageContent
  ]
});

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Odyssey Bot connected to Discord in ${readyClient.guilds.cache.size} server(s).`);
  processScheduledAnnouncements(readyClient).catch((error) => {
    logError("Scheduled announcement sweep failed", error);
  });
  setInterval(() => {
    processInactiveTickets(readyClient.guilds.cache).catch((error) => {
      logError("Inactive ticket sweep failed", error);
    });
  }, 15 * 60_000).unref();
  setInterval(() => {
    processScheduledAnnouncements(readyClient).catch((error) => {
      logError("Scheduled announcement sweep failed", error);
    });
  }, 30_000).unref();
});

client.on(Events.MessageCreate, async (message) => {
  if (message.guildId && !message.author.bot) {
    await handleAutoModMessage(message).catch((error) => {
      logError("Auto Mod message handler failed", error);
    });
    await updateTicketActivity(message.guildId, message.channelId).catch((error) => {
      logError("Ticket activity update failed", error);
    });
    await handleStickyActivity(message).catch((error) => {
      logError("Sticky message handler failed", error);
    });
  }
});

client.on(Events.GuildMemberAdd, async (member) => {
  await handleGuildMemberAdd(member).catch((error) => {
    logError("Anti-raid member add handler failed", error);
  });
  await handleWelcome(member).catch((error) => {
    logError("Welcome handler failed", error);
  });
});

async function handleWelcome(member: import("discord.js").GuildMember): Promise<void> {
  if (member.user.bot) return;
  const settings = await getWelcomeSettings(member.guild.id);
  if (!settings.enabled) return;

  const variables = buildDiscordPlaceholders({
    guild: member.guild,
    user: member.user,
    target: member.user,
    createdAt: Date.now()
  });

  if (settings.channelId) {
    const channel = await member.guild.channels.fetch(settings.channelId).catch(() => null);
    if (channel && channel.isTextBased() && !channel.isDMBased() && "send" in channel) {
      const channelVariables = buildDiscordPlaceholders({
        guild: member.guild,
        channel,
        user: member.user,
        target: member.user,
        createdAt: Date.now()
      });
      const content = replacePlaceholders(settings.content, channelVariables);
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
        }, channelVariables);
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
  await handleRoleDelete(role).catch((error) => {
    logError("Role Protection delete handler failed", error);
  });
});

client.on(Events.GuildRoleCreate, async (role) => {
  await auditHandler(role.guild, 30); // AuditLogEvent.RoleCreate
  await handleRoleCreate(role).catch((error) => {
    logError("Role Protection create handler failed", error);
  });
});

client.on(Events.GuildRoleUpdate, async (oldRole, newRole) => {
  await handleRoleUpdate(oldRole, newRole).catch((error) => {
    logError("Role Protection update handler failed", error);
  });
});

client.on(Events.WebhooksUpdate, async (channel) => {
  if (!channel.guild) return;
  await auditHandler(channel.guild, 50); // AuditLogEvent.WebhookCreate
  await auditHandler(channel.guild, 52); // AuditLogEvent.WebhookDelete
});

client.on(Events.GuildMemberUpdate, async (_oldMember, newMember) => {
  if (!newMember.guild) return;
  if (_oldMember.partial) return;
  const hadAdmin = _oldMember.roles.cache.some((r) => r.permissions.has(PermissionFlagsBits.Administrator));
  const hasAdmin = newMember.roles.cache.some((r) => r.permissions.has(PermissionFlagsBits.Administrator));
  if (hadAdmin !== hasAdmin) {
    await auditHandler(newMember.guild, AuditLogEvent.MemberRoleUpdate, "admin");
  }
  await handleMemberRoleUpdate(_oldMember, newMember).catch((error) => {
    logError("Role Protection assignment handler failed", error);
  });
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

  if (interaction.commandName === "reaction-roles") {
    const choices = (await availableRolePanels(interaction.guildId))
      .filter((panel) => panel.active && panel.name.toLowerCase().includes(query))
      .slice(0, 25)
      .map((panel) => ({ name: panel.name, value: String(panel.id) }));
    await interaction.respond(choices);
  }
}

async function handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  if (interaction.commandName === "ping") {
    await interaction.reply({ content: `Pong! ${client.ws.ping}ms`, ephemeral: true });
    return;
  }

  if (interaction.commandName === "help") {
    await handleHelpCommand(interaction);
    return;
  }

  if (interaction.commandName === "bot-help") {
    await handleBotHelp(interaction);
    return;
  }

  if (interaction.commandName === "server-info") {
    await handleServerInfo(interaction);
    return;
  }

  if (interaction.commandName === "user-info") {
    await handleUserInfo(interaction);
    return;
  }

  if (interaction.commandName === "automod-status") {
    await handleAutomodStatus(interaction);
    return;
  }

  if (interaction.commandName === "socials-post") {
    await handleSocialsPost(interaction);
    return;
  }

  if (interaction.commandName === "lockdown") {
    await handleLockdown(interaction);
    return;
  }

  if (interaction.commandName === "unlockdown") {
    await handleUnlockdown(interaction);
    return;
  }

  if (interaction.commandName === "bot-status") {
    await handleBotStatus(interaction);
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

  if (interaction.commandName === "reaction-roles") {
    await handleReactionRolesCommand(interaction);
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
  const reason = interaction.options.getString("reason") ?? "";
  const prepared = await prepareTicketCloseRequest(interaction, reason, "staff");
  await interaction.reply(prepared.payload ?? {
    content: prepared.error ?? "Could not create the close request.",
    ephemeral: true
  });
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
    } else if (interaction.isStringSelectMenu() && interaction.customId === "ticket:set-priority") {
      await handleTicketPrioritySelect(interaction);
    } else if (interaction.isButton() && interaction.customId.startsWith("ticket:create-button:")) {
      await handleTicketCreateButton(interaction);
    } else if (interaction.isButton() && interaction.customId.startsWith("role-panel:toggle:")) {
      await handleRolePanelButton(interaction);
    } else if (interaction.isButton() && interaction.customId.startsWith("ticket-close:")) {
      await handleTicketCloseDecision(interaction as ButtonInteraction);
    } else if (interaction.isButton() && interaction.customId.startsWith("ticket:")) {
      await handleTicketButton(interaction);
    } else if (interaction.isButton() && interaction.customId.startsWith("announce:")) {
      await handleAnnouncementButton(interaction);
    } else if (interaction.isModalSubmit() && interaction.customId === "ticket:close-reason") {
      await handleTicketCloseModal(interaction);
    } else if (interaction.isModalSubmit() && interaction.customId === "ticket:close-request-reason") {
      await handleTicketCloseRequestModal(interaction as ModalSubmitInteraction);
    }
  } catch (error) {
    logError("Interaction failed", error);
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

client.login(config.DISCORD_TOKEN);
