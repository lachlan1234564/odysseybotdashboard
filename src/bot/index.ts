import {
  AuditLogEvent,
  AutocompleteInteraction,
  ButtonInteraction,
  ChatInputCommandInteraction,
  Client,
  Events,
  GatewayIntentBits,
  MessageFlags,
  ModalSubmitInteraction,
  Partials,
  PermissionFlagsBits,
  StringSelectMenuInteraction
} from "discord.js";
import {
  getRuntimeAppConfig,
  listAnnouncements,
  listCustomCommands,
  updateTicketActivity,
  createVerificationRecord,
  getWelcomeSettings,
  getVerificationSettings
} from "../database/index.js";
import { handleAnnounce, handleAnnouncementButton } from "./announcements.js";
import { handleCustomCommand } from "./custom-commands.js";
import { handleCaseCommand, handleModeration } from "./moderation.js";
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
  handleRolePanelButton,
  handleRolePanelSelect
} from "./role-panels.js";
import { handleStickyActivity } from "./sticky-messages.js";
import { processScheduledAnnouncements } from "./scheduled-announcements.js";
import { renderEmbedMessage } from "./messages.js";
import { emptyEmbedConfig } from "../shared/types.js";
import { replacePlaceholders } from "../shared/placeholders.js";
import { buildDiscordPlaceholders } from "./placeholders.js";
import { handleHelpCommand } from "./help.js";
import {
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
import { logError, safeErrorSummary } from "../shared/logging.js";
import { renderBoostTemplate } from "../shared/boost.js";
import { replyEphemeral, replyToCommand, deferCommandReply } from "./interactions.js";
import type { SlashCommandName } from "./commands.js";
import {
  logBanAdd,
  logBanRemove,
  logChannelCreate,
  logChannelDelete,
  logChannelUpdate,
  logEmojiChange,
  logGuildUpdate,
  logInviteChange,
  logMemberJoin,
  logMemberLeave,
  logMemberUpdate,
  logMessageBulkDelete,
  logMessageDelete,
  logMessageUpdate,
  logRoleCreate,
  logRoleDelete,
  logRoleUpdate,
  logStickerChange,
  logThreadCreate,
  logThreadDelete,
  logThreadUpdate,
  logVoiceUpdate,
  logWebhookUpdate
} from "./server-logging.js";
import { handleVerificationCommand, processVerificationAutoKicks } from "./verification.js";
import { sendVerificationEventLog } from "../shared/verification-gate.js";
import {
  handleGiveawayButton,
  handleGiveawayCommand,
  processDueGiveaways
} from "./giveaways.js";
import {
  handlePollCommand,
  handlePollVote,
  processDuePolls
} from "./polls.js";
import { handleDmCommand } from "./dms.js";

const runtimeConfig = await getRuntimeAppConfig();
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildExpressions,
    GatewayIntentBits.GuildWebhooks,
    GatewayIntentBits.MessageContent
  ],
  partials: [
    Partials.Channel,
    Partials.GuildMember,
    Partials.Message,
    Partials.User
  ]
});

client.once(Events.ClientReady, (readyClient) => {
  console.log(`CorePanel connected to Discord in ${readyClient.guilds.cache.size} server(s).`);
  processScheduledAnnouncements(readyClient).catch((error) => {
    logError("Scheduled announcement sweep failed", error);
  });
  processDueGiveaways(readyClient).catch((error) => {
    logError("Giveaway sweep failed", error);
  });
  processDuePolls(readyClient).catch((error) => {
    logError("Poll sweep failed", error);
  });
  processVerificationAutoKicks(readyClient).catch((error) => {
    logError("Verification auto-kick sweep failed", error);
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
  setInterval(() => {
    processDueGiveaways(readyClient).catch((error) => {
      logError("Giveaway sweep failed", error);
    });
  }, 30_000).unref();
  setInterval(() => {
    processDuePolls(readyClient).catch((error) => {
      logError("Poll sweep failed", error);
    });
  }, 30_000).unref();
  setInterval(() => {
    processVerificationAutoKicks(readyClient).catch((error) => {
      logError("Verification auto-kick sweep failed", error);
    });
  }, 10 * 60_000).unref();
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
  await logMemberJoin(member).catch((error) => {
    logError("Member join logging failed", error);
  });
  await handleGuildMemberAdd(member).catch((error) => {
    logError("Anti-raid member add handler failed", error);
  });
  await handleWelcome(member).catch((error) => {
    logError("Welcome handler failed", error);
  });
});

async function handleWelcome(member: import("discord.js").GuildMember): Promise<void> {
  if (member.user.bot) return;
  const [settings, verification] = await Promise.all([
    getWelcomeSettings(member.guild.id),
    getVerificationSettings(member.guild.id)
  ]);

  const variables = buildDiscordPlaceholders({
    guild: member.guild,
    user: member.user,
    target: member.user,
    createdAt: Date.now()
  });

  if (settings.enabled && settings.channelId) {
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

  if (settings.enabled && settings.dmEnabled && (settings.dmContent || settings.dmEmbedEnabled)) {
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

  if (settings.autoRolesEnabled && settings.autoRoleIds.length > 0) {
    const roleIds = verification.enabled && verification.verifiedRoleId
      ? settings.autoRoleIds.filter((roleId) => roleId !== verification.verifiedRoleId)
      : settings.autoRoleIds;
    for (const roleId of roleIds) {
      const role = await member.guild.roles.fetch(roleId).catch(() => null);
      if (role) await member.roles.add(role, "Welcome auto-role").catch(() => undefined);
    }
  }
  if (verification.enabled) {
    await createVerificationRecord({
      guildId: member.guild.id,
      userId: member.id,
      status: "pending",
      reasonCodes: ["member_joined"],
      riskScore: 0,
      accountCreatedAt: member.user.createdAt.toISOString(),
      serverJoinedAt: member.joinedAt?.toISOString() ?? null,
      vpnDetected: null,
      expiresAt: new Date(Date.now() + verification.recordRetentionHours * 3_600_000).toISOString()
    }).catch((error) => {
      logError("Verification pending record creation failed", error);
    });
    await sendVerificationEventLog(
      member.client.rest as unknown as import("discord.js").REST,
      verification,
      "Member pending verification",
      `<@${member.id}> joined and has not been given the verified/community role.`
    );
  }
}

async function handleGoodbye(
  member: Pick<import("discord.js").GuildMember, "guild" | "user">
): Promise<void> {
  if (member.user.bot) return;
  const settings = await getWelcomeSettings(member.guild.id);
  const hasGoodbyeEmbed = settings.goodbyeEmbedEnabled && Boolean(
    settings.embedTitle || settings.embedDescription || settings.embedImageUrl
    || settings.embedThumbnailUrl || settings.embedFooterText
  );
  if (!settings.goodbyeEnabled || !settings.goodbyeChannelId || (!settings.goodbyeContent && !hasGoodbyeEmbed)) return;

  const channel = await member.guild.channels.fetch(settings.goodbyeChannelId).catch(() => null);
  if (!channel || !channel.isTextBased() || channel.isDMBased() || !("send" in channel)) return;

  const variables = buildDiscordPlaceholders({
    guild: member.guild,
    channel,
    user: member.user,
    target: member.user,
    createdAt: Date.now()
  });
  const content = replacePlaceholders(settings.goodbyeContent, variables);

  if (hasGoodbyeEmbed) {
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
    await channel.send({ content: content || undefined, ...embed });
    return;
  }

  await channel.send(content);
}

function boostTierLabel(tier: number): string {
  if (tier === 3) return "Tier 3";
  if (tier === 2) return "Tier 2";
  if (tier === 1) return "Tier 1";
  return "No boost tier";
}

async function handleBoostMessage(
  oldMember: import("discord.js").GuildMember,
  newMember: import("discord.js").GuildMember
): Promise<void> {
  if (newMember.user.bot) return;
  const previousBoost = oldMember.premiumSinceTimestamp;
  const currentBoost = newMember.premiumSinceTimestamp;
  if (!currentBoost || previousBoost === currentBoost) return;

  const settings = await getWelcomeSettings(newMember.guild.id);
  if (!settings.boostEnabled || !settings.boostChannelId || !settings.boostMessage.trim()) return;
  const channel = await newMember.guild.channels.fetch(settings.boostChannelId).catch(() => null);
  if (!channel || !channel.isTextBased() || channel.isDMBased() || !("send" in channel)) {
    console.warn(`[Boost] guild=${newMember.guild.id} channel=${settings.boostChannelId} result=channel-missing-or-not-sendable`);
    return;
  }
  const botMember = newMember.guild.members.me;
  const permissions = botMember && "permissionsFor" in channel
    ? channel.permissionsFor(botMember)
    : null;
  if (
    !permissions?.has(PermissionFlagsBits.ViewChannel)
    || !permissions.has(PermissionFlagsBits.SendMessages)
  ) {
    console.warn(`[Boost] guild=${newMember.guild.id} channel=${channel.id} result=missing-view-or-send-permission`);
    return;
  }

  const content = renderBoostTemplate(settings.boostMessage, {
    user: `<@${newMember.id}>`,
    server: newMember.guild.name,
    boostCount: newMember.guild.premiumSubscriptionCount ?? 0,
    tier: boostTierLabel(Number(newMember.guild.premiumTier))
  });
  await channel.send({ content, allowedMentions: { users: [newMember.id] } })
    .then(() => {
      console.info(`[Boost] guild=${newMember.guild.id} channel=${channel.id} member=${newMember.id} result=sent`);
    })
    .catch((error: Error) => {
      logError(`Boost message failed for guild ${newMember.guild.id} channel ${channel.id}`, error);
    });
}

client.on(Events.ChannelDelete, async (channel) => {
  if (channel.isDMBased() || !channel.guild) return;
  await logChannelDelete(channel).catch((error) => {
    logError("Channel delete logging failed", error);
  });
  await auditHandler(channel.guild, 12); // AuditLogEvent.ChannelDelete
});

client.on(Events.ChannelCreate, async (channel) => {
  if (channel.isDMBased() || !channel.guild) return;
  await logChannelCreate(channel).catch((error) => {
    logError("Channel create logging failed", error);
  });
  await auditHandler(channel.guild, 10); // AuditLogEvent.ChannelCreate
});

client.on(Events.GuildBanAdd, async (ban) => {
  await logBanAdd(
    ban.guild,
    ban.user.id,
    ban.user.username,
    ban.user.displayAvatarURL()
  ).catch((error) => {
    logError("Ban logging failed", error);
  });
  await auditHandler(ban.guild, 22); // AuditLogEvent.MemberBanAdd
});

client.on(Events.GuildMemberRemove, async (member) => {
  if (!member.guild) return;
  await logMemberLeave(member).catch((error) => {
    logError("Member leave logging failed", error);
  });
  if (member.user.bot) return;
  try {
    const fetched = await member.guild.fetchAuditLogs({ limit: 1, type: 20 }); // MemberKick
    const entry = fetched.entries.first();
    if (entry && entry.executorId && entry.targetId === member.id && Date.now() - entry.createdTimestamp < 5000) {
      await import("./anti-nuke.js").then((m) => m.checkEvent(member.guild, entry.executorId!, "kick", entry.targetId ?? undefined));
    }
  } catch {
    // ignore
  }
  await handleGoodbye(member).catch((error) => {
    logError("Goodbye handler failed", error);
  });
});

client.on(Events.GuildRoleDelete, async (role) => {
  await logRoleDelete(role).catch((error) => {
    logError("Role delete logging failed", error);
  });
  await auditHandler(role.guild, 32); // AuditLogEvent.RoleDelete
  await handleRoleDelete(role).catch((error) => {
    logError("Role Protection delete handler failed", error);
  });
});

client.on(Events.GuildRoleCreate, async (role) => {
  await logRoleCreate(role).catch((error) => {
    logError("Role create logging failed", error);
  });
  await auditHandler(role.guild, 30); // AuditLogEvent.RoleCreate
  await handleRoleCreate(role).catch((error) => {
    logError("Role Protection create handler failed", error);
  });
});

client.on(Events.GuildRoleUpdate, async (oldRole, newRole) => {
  await logRoleUpdate(oldRole, newRole).catch((error) => {
    logError("Role update logging failed", error);
  });
  await handleRoleUpdate(oldRole, newRole).catch((error) => {
    logError("Role Protection update handler failed", error);
  });
});

client.on(Events.WebhooksUpdate, async (channel) => {
  if (!channel.guild) return;
  await logWebhookUpdate(channel.guild, channel.id).catch((error) => {
    logError("Webhook logging failed", error);
  });
  await auditHandler(channel.guild, 50); // AuditLogEvent.WebhookCreate
  await auditHandler(channel.guild, 52); // AuditLogEvent.WebhookDelete
});

client.on(Events.GuildMemberUpdate, async (_oldMember, newMember) => {
  if (!newMember.guild) return;
  if (_oldMember.partial) return;
  await logMemberUpdate(_oldMember, newMember).catch((error) => {
    logError("Member update logging failed", error);
  });
  await handleBoostMessage(_oldMember, newMember).catch((error) => {
    logError("Boost message handler failed", error);
  });
  const hadAdmin = _oldMember.roles.cache.some((r) => r.permissions.has(PermissionFlagsBits.Administrator));
  const hasAdmin = newMember.roles.cache.some((r) => r.permissions.has(PermissionFlagsBits.Administrator));
  if (hadAdmin !== hasAdmin) {
    await auditHandler(newMember.guild, AuditLogEvent.MemberRoleUpdate, "admin");
  }
  await handleMemberRoleUpdate(_oldMember, newMember).catch((error) => {
    logError("Role Protection assignment handler failed", error);
  });
});

client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
  if (!newMessage.guildId) return;
  await logMessageUpdate(oldMessage, newMessage).catch((error) => {
    logError("Message edit logging failed", error);
  });
});

client.on(Events.MessageDelete, async (message) => {
  if (!message.guildId) return;
  await logMessageDelete(message).catch((error) => {
    logError("Message delete logging failed", error);
  });
});

client.on(Events.MessageBulkDelete, async (messages, channel) => {
  if (!channel.guild) return;
  await logMessageBulkDelete(channel.guild, channel.id, messages.values()).catch((error) => {
    logError("Bulk message delete logging failed", error);
  });
});

client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  await logVoiceUpdate(oldState, newState).catch((error) => {
    logError("Voice state logging failed", error);
  });
});

client.on(Events.ChannelUpdate, async (oldChannel, newChannel) => {
  if (oldChannel.isDMBased() || newChannel.isDMBased()) return;
  await logChannelUpdate(oldChannel, newChannel).catch((error) => {
    logError("Channel update logging failed", error);
  });
});

client.on(Events.GuildBanRemove, async (ban) => {
  await logBanRemove(
    ban.guild,
    ban.user.id,
    ban.user.username,
    ban.user.displayAvatarURL()
  ).catch((error) => {
    logError("Unban logging failed", error);
  });
});

client.on(Events.GuildUpdate, async (oldGuild, newGuild) => {
  await logGuildUpdate(oldGuild, newGuild).catch((error) => {
    logError("Server update logging failed", error);
  });
});

client.on(Events.GuildEmojiCreate, async (emoji) => {
  await logEmojiChange("created", emoji).catch((error) => logError("Emoji create logging failed", error));
});
client.on(Events.GuildEmojiDelete, async (emoji) => {
  await logEmojiChange("deleted", emoji).catch((error) => logError("Emoji delete logging failed", error));
});
client.on(Events.GuildEmojiUpdate, async (oldEmoji, newEmoji) => {
  await logEmojiChange("updated", newEmoji, oldEmoji).catch((error) => logError("Emoji update logging failed", error));
});
client.on(Events.GuildStickerCreate, async (sticker) => {
  await logStickerChange("created", sticker).catch((error) => logError("Sticker create logging failed", error));
});
client.on(Events.GuildStickerDelete, async (sticker) => {
  await logStickerChange("deleted", sticker).catch((error) => logError("Sticker delete logging failed", error));
});
client.on(Events.GuildStickerUpdate, async (oldSticker, newSticker) => {
  await logStickerChange("updated", newSticker, oldSticker).catch((error) => logError("Sticker update logging failed", error));
});
client.on(Events.InviteCreate, async (invite) => {
  await logInviteChange("created", invite).catch((error) => logError("Invite create logging failed", error));
});
client.on(Events.InviteDelete, async (invite) => {
  await logInviteChange("deleted", invite).catch((error) => logError("Invite delete logging failed", error));
});
client.on(Events.ThreadCreate, async (thread) => {
  await logThreadCreate(thread).catch((error) => logError("Thread create logging failed", error));
});
client.on(Events.ThreadDelete, async (thread) => {
  await logThreadDelete(thread).catch((error) => logError("Thread delete logging failed", error));
});
client.on(Events.ThreadUpdate, async (oldThread, newThread) => {
  await logThreadUpdate(oldThread, newThread).catch((error) => logError("Thread update logging failed", error));
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

async function handleCloseRequest(interaction: ChatInputCommandInteraction): Promise<void> {
  await deferCommandReply(interaction);
  const reason = interaction.options.getString("reason") ?? "";
  const prepared = await prepareTicketCloseRequest(interaction, reason, "staff");
  if (!prepared.payload) {
    await replyToCommand(interaction, {
      content: prepared.error ?? "Could not create the close request."
    });
    return;
  }
  await interaction.followUp(prepared.payload);
  await interaction.editReply("Close request posted for the ticket opener or community to review.");
}

type SlashCommandHandler = (interaction: ChatInputCommandInteraction) => Promise<void>;

const commandHandlers: Record<SlashCommandName, SlashCommandHandler> = {
  ping: async (interaction) => replyEphemeral(interaction, `Pong! ${client.ws.ping}ms`),
  help: handleHelpCommand,
  server: handleServerInfo,
  "user-info": handleUserInfo,
  "automod-status": handleAutomodStatus,
  "socials-post": handleSocialsPost,
  custom: handleCustomCommand,
  "close-request": handleCloseRequest,
  "ticket-panel": handleTicketPanel,
  announce: handleAnnounce,
  "reaction-roles": handleReactionRolesCommand,
  giveaway: handleGiveawayCommand,
  poll: handlePollCommand,
  verification: handleVerificationCommand,
  dm: handleDmCommand,
  warn: handleModeration,
  warnings: handleModeration,
  timeout: handleModeration,
  untimeout: handleModeration,
  kick: handleModeration,
  ban: handleModeration,
  unban: handleModeration,
  clear: handleModeration,
  case: handleCaseCommand,
  lockdown: handleLockdown,
  unlockdown: handleUnlockdown,
  "bot-status": handleBotStatus
};

function commandLogName(interaction: ChatInputCommandInteraction): string {
  let subcommand = "";
  try {
    subcommand = interaction.options.getSubcommand(false) ?? "";
  } catch {
    subcommand = "";
  }
  return subcommand ? `${interaction.commandName} ${subcommand}` : interaction.commandName;
}

async function handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const startedAt = performance.now();
  const commandName = commandLogName(interaction);
  const context = [
    "[SlashCommand]",
    `command=${commandName}`,
    `guild=${interaction.guildId ?? "dm"}`,
    `user=${interaction.user.id}`
  ];
  try {
    const handler = commandHandlers[interaction.commandName as SlashCommandName];
    if (!handler) throw new Error(`No handler is registered for /${interaction.commandName}.`);
    await handler(interaction);
    console.info([
      ...context,
      `durationMs=${(performance.now() - startedAt).toFixed(1)}`,
      "success=true"
    ].join(" "));
  } catch (error) {
    console.error([
      ...context,
      `durationMs=${(performance.now() - startedAt).toFixed(1)}`,
      "success=false",
      `error=${safeErrorSummary(error)}`
    ].join(" "));
    throw error;
  }
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
    } else if (interaction.isButton() && interaction.customId.startsWith("role-panel:toggle:")) {
      await handleRolePanelButton(interaction);
    } else if (interaction.isStringSelectMenu() && interaction.customId.startsWith("role-panel:select:")) {
      await handleRolePanelSelect(interaction);
    } else if (interaction.isButton() && interaction.customId.startsWith("giveaway:enter:")) {
      await handleGiveawayButton(interaction);
    } else if (interaction.isButton() && interaction.customId.startsWith("poll:vote:")) {
      await handlePollVote(interaction);
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
    if (!interaction.isChatInputCommand()) logError("Interaction failed", error);
    if (interaction.isRepliable()) {
      if (interaction.isChatInputCommand()) {
        await replyEphemeral(
          interaction,
          "Something went wrong while handling that command. Check the bot log for the command error."
        ).catch(() => undefined);
      } else {
        const message = {
          content: "Something went wrong while handling that action.",
          flags: MessageFlags.Ephemeral as const
        };
        if (interaction.deferred) {
          await interaction.editReply({ content: message.content }).catch(() => undefined);
        } else if (interaction.replied) {
          await interaction.followUp(message).catch(() => undefined);
        } else {
          await interaction.reply(message).catch(() => undefined);
        }
      }
    }
  }
});

if (!runtimeConfig.discordToken) {
  console.warn("[CorePanel] Discord bot startup skipped: setup is incomplete. Open the dashboard setup page and save a bot token.");
} else if (runtimeConfig.secretError) {
  console.warn(`[CorePanel] Discord bot startup skipped: ${runtimeConfig.secretError}`);
} else {
  client.login(runtimeConfig.discordToken).catch((error) => {
    logError("Discord bot login failed", error);
  });
}
