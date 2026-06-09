import {
  ChannelType,
  ChatInputCommandInteraction,
  GuildMember,
  PermissionFlagsBits,
  TextChannel
} from "discord.js";
import {
  getAnnouncement,
  getCustomCommand,
  getGuildSettings,
  recordModerationAction,
  closeTicket,
  createTicketRecord,
  getTicketByChannel,
  getTicketType
} from "../database/index.js";
import type { CustomCommand } from "../shared/types.js";
import { customCommandNeedsTrustedAccess } from "../shared/security.js";
import { replacePlaceholders, type PlaceholderValues } from "../shared/placeholders.js";
import { buildAnnouncementMessage, getMissingAnnouncementPermission } from "./announcements.js";
import { renderEmbedMessage } from "./messages.js";
import { postTicketPanel, prepareTicketCloseRequest } from "./tickets.js";
import { sendGuildLog } from "./utils.js";
import { buildDiscordPlaceholders } from "./placeholders.js";

const cooldowns = new Map<string, number>();

function memberHasAnyRole(member: GuildMember, roleIds: string[]): boolean {
  return roleIds.some((roleId) => member.roles.cache.has(roleId));
}

function intersect<T>(a: T[], b: T[]): T[] {
  const setB = new Set(b);
  return a.filter((x) => setB.has(x));
}

function channelLabels(interaction: ChatInputCommandInteraction, ids: string[]): string {
  return ids.map((id) => {
    const channel = interaction.guild?.channels.cache.get(id);
    return channel ? `#${channel.name} (${id})` : id;
  }).join(", ");
}

function roleLabels(interaction: ChatInputCommandInteraction, ids: string[]): string {
  return ids.map((id) => {
    const role = interaction.guild?.roles.cache.get(id);
    return role ? `${role.name} (${id})` : id;
  }).join(", ");
}

async function checkAccess(
  interaction: ChatInputCommandInteraction,
  command: CustomCommand,
  member: GuildMember
): Promise<string | null> {
  const settings = await getGuildSettings(interaction.guildId!);
  if (
    command.accessMode === "everyone"
    && customCommandNeedsTrustedAccess(command.actionType, command.actionConfig)
  ) {
    return "This high-impact command is disabled until an administrator restricts it to bot admins, staff, or selected roles.";
  }
  if (command.blockedChannelIds.includes(interaction.channelId)) {
    return `This command is blocked in ${channelLabels(interaction, [interaction.channelId])}.`;
  }
  if (command.allowedChannelIds.length > 0 && !command.allowedChannelIds.includes(interaction.channelId)) {
    return `This command can only be used in: ${channelLabels(interaction, command.allowedChannelIds)}.`;
  }
  const matchedBlockedRoles = command.blockedRoleIds.filter((roleId) => member.roles.cache.has(roleId));
  if (matchedBlockedRoles.length > 0) {
    return `Your role ${roleLabels(interaction, matchedBlockedRoles)} is blocked from using this command.`;
  }
  if (command.allowedRoleIds.length > 0 && !memberHasAnyRole(member, command.allowedRoleIds)) {
    return `You need one of these roles: ${roleLabels(interaction, command.allowedRoleIds)}.`;
  }

  if (command.accessMode === "admins") {
    const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
      || memberHasAnyRole(member, settings.adminRoleIds);
    if (!isAdmin) return "This command is restricted to bot administrators.";
  }
  if (command.accessMode === "staff") {
    const isStaff = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
      || memberHasAnyRole(member, settings.adminRoleIds)
      || memberHasAnyRole(member, settings.staffRoleIds);
    if (!isStaff) {
      return settings.staffRoleIds.length
        ? `This command requires a configured staff role: ${roleLabels(interaction, settings.staffRoleIds)}.`
        : "This command requires a configured staff role, but no staff roles are configured.";
    }
  }
  if (command.accessMode === "roles" && !memberHasAnyRole(member, command.allowedRoleIds)) {
    return command.allowedRoleIds.length
      ? `You need one of these roles: ${roleLabels(interaction, command.allowedRoleIds)}.`
      : "This command is set to selected roles, but no allowed roles are configured.";
  }
  return null;
}

function checkCooldown(command: CustomCommand, guildId: string, userId: string): number {
  if (command.cooldownType === "none" || command.cooldownSeconds <= 0) return 0;
  const scope = command.cooldownType === "server" ? "server" : userId;
  const key = `${guildId}:${command.id}:${scope}`;
  const expiresAt = cooldowns.get(key) ?? 0;
  const remaining = Math.ceil((expiresAt - Date.now()) / 1000);
  if (remaining > 0) return remaining;
  cooldowns.set(key, Date.now() + command.cooldownSeconds * 1000);
  return 0;
}

async function variablesFor(interaction: ChatInputCommandInteraction): Promise<PlaceholderValues> {
  const target = interaction.options.getUser("target");
  const ticket = interaction.guildId
    ? await getTicketByChannel(interaction.guildId, interaction.channelId)
    : null;
  const ticketType = ticket?.ticketTypeId && interaction.guildId
    ? await getTicketType(ticket.ticketTypeId, interaction.guildId)
    : null;
  return buildDiscordPlaceholders({
    guild: interaction.guild!,
    channel: interaction.channel,
    user: interaction.user,
    target,
    text: interaction.options.getString("text") ?? "",
    reason: interaction.options.getString("reason") ?? "",
    ticket,
    ticketType,
    createdAt: ticket?.openedAt ?? interaction.createdTimestamp
  });
}

function embedHasContent(command: CustomCommand): boolean {
  const embed = command.actionConfig.embed;
  return Boolean(
    embed.title || embed.description || embed.authorName || embed.imageUrl
    || embed.thumbnailUrl || embed.footerText || embed.fields.length
  );
}

function embedHasContentConfig(embed: CustomCommand["actionConfig"]["embed"]): boolean {
  return Boolean(
    embed.title || embed.description || embed.authorName || embed.imageUrl
    || embed.thumbnailUrl || embed.footerText || embed.fields.length
  );
}

function formatReason(config: CustomCommand["actionConfig"], variables: PlaceholderValues): string {
  return replacePlaceholders(config.reason || variables.reason || "Custom command action", variables);
}

export async function handleCustomCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId || !interaction.guild) {
    await interaction.reply({ content: "Custom commands only work in a server.", ephemeral: true });
    return;
  }

  const name = interaction.options.getString("name", true);
  const command = await getCustomCommand(interaction.guildId, name);
  if (!command || !command.enabled) {
    await interaction.reply({ content: `No enabled custom command named \`${name}\` exists.`, ephemeral: true });
    return;
  }

  const member = await interaction.guild.members.fetch(interaction.user.id);
  const denial = await checkAccess(interaction, command, member);
  if (denial) {
    await interaction.reply({ content: denial, ephemeral: true });
    return;
  }

  const remaining = checkCooldown(command, interaction.guildId, interaction.user.id);
  if (remaining > 0) {
    await interaction.reply({ content: `That command is on cooldown for ${remaining} more second(s).`, ephemeral: true });
    return;
  }

  const variables = await variablesFor(interaction);

  if (command.actionType === "action_sequence") {
    await handleActionSequence(interaction, command, variables);
    return;
  }

  await runSingleAction(interaction, command.actionType, command.actionConfig, variables, {
    ephemeral: command.replyVisibility === "private"
  });
}

async function handleActionSequence(
  interaction: ChatInputCommandInteraction,
  command: CustomCommand,
  variables: PlaceholderValues
): Promise<void> {
  if (!command.actionConfig.actionSequence?.length) {
    await interaction.reply({ content: "This sequence has no actions configured.", ephemeral: true });
    return;
  }
  const ephemeral = command.replyVisibility === "private";
  await interaction.deferReply({ ephemeral });
  const results: string[] = [];
  for (const item of command.actionConfig.actionSequence) {
    const result = await runSingleAction(interaction, item.actionType, {
      ...emptyActionLike(item),
      ...item
    } as CustomCommand["actionConfig"], variables, { skipReply: true, ephemeral });
    if (result) results.push(result);
  }
  await interaction.editReply({ content: results.length ? results.join("\n").slice(0, 2000) : "Sequence completed." });
}

function emptyActionLike(item: { embed?: unknown }): CustomCommand["actionConfig"] {
  return {
    content: "",
    targetChannelId: null,
    roleId: null,
    roleIds: [],
    ticketPanelId: null,
    announcementTemplateId: null,
    embed: item.embed ? (item.embed as CustomCommand["actionConfig"]["embed"]) : {
      content: "", title: "", titleUrl: "", description: "", color: "#5865F2",
      authorName: "", authorIconUrl: "", authorUrl: "", imageUrl: "", thumbnailUrl: "",
      footerText: "", footerIconUrl: "", timestamp: false, fields: []
    },
    targetUserId: null,
    durationMinutes: null,
    deleteMessageDays: null,
    amount: null,
    reason: "",
    logChannelId: null,
    newName: "",
    newCategoryId: null,
    pingType: "none",
    actionSequence: []
  };
}

async function runSingleAction(
  interaction: ChatInputCommandInteraction,
  actionType: CustomCommand["actionType"],
  config: CustomCommand["actionConfig"],
  variables: PlaceholderValues,
  opts: { skipReply?: boolean; ephemeral?: boolean } = {}
): Promise<string | undefined> {
  const ephemeral = opts.ephemeral ?? false;

  if (actionType === "reply_message") {
    if (opts.skipReply) {
      await interaction.followUp({ content: replacePlaceholders(config.content, variables) || "No message configured.", ephemeral });
      return "Sent reply.";
    }
    await interaction.reply({
      content: replacePlaceholders(config.content, variables) || "This command has no message configured.",
      ephemeral
    });
    return undefined;
  }

  if (actionType === "reply_embed") {
    const msg = renderEmbedMessage(config.embed, variables);
    if (opts.skipReply) {
      await interaction.followUp({ ...msg, ephemeral });
      return "Sent embed.";
    }
    await interaction.reply({ ...msg, ephemeral });
    return undefined;
  }

  if (actionType === "send_ephemeral") {
    if (opts.skipReply) {
      await interaction.followUp({ content: replacePlaceholders(config.content, variables), ephemeral: true });
      return "Sent ephemeral.";
    }
    await interaction.reply({ content: replacePlaceholders(config.content, variables), ephemeral: true });
    return undefined;
  }

  if (actionType === "send_dm") {
    const targetUser = config.targetUserId ? await interaction.client.users.fetch(config.targetUserId).catch(() => null) : interaction.user;
    if (!targetUser) return "Target user not found.";
    const content = replacePlaceholders(config.content, variables);
    const msg = embedHasContentConfig(config.embed) ? renderEmbedMessage(config.embed, variables) : { content };
    await targetUser.send(msg).catch(() => undefined);
    if (!opts.skipReply) await interaction.reply({ content: `DM sent to ${targetUser}.`, ephemeral });
    return `DM sent to ${targetUser}.`;
  }

  if (actionType === "send_channel") {
    const channelId = config.targetChannelId;
    const channel = channelId ? await interaction.guild!.channels.fetch(channelId).catch(() => null) : null;
    if (!channel || !channel.isTextBased() || channel.isDMBased() || !("send" in channel)) {
      if (!opts.skipReply) await interaction.reply({ content: "The configured destination channel is unavailable.", ephemeral: true });
      return "Destination channel unavailable.";
    }
    const message = embedHasContentConfig(config.embed)
      ? renderEmbedMessage(config.embed, variables)
      : { content: replacePlaceholders(config.content, variables) };
    const ping = config.pingType === "everyone" ? "@everyone" : config.pingType === "here" ? "@here" : "";
    const missingPermission = getMissingAnnouncementPermission(
      interaction.guild!,
      channel,
      message,
      config.pingType
    );
    if (missingPermission) {
      if (!opts.skipReply) {
        await interaction.reply({
          content: `I need the **${missingPermission}** permission in the destination channel.`,
          ephemeral: true
        });
      }
      return `Destination permission missing: ${missingPermission}.`;
    }
    const sent = await channel.send({
      ...message,
      content: [ping, message.content].filter(Boolean).join("\n") || undefined,
      allowedMentions: ping ? { parse: ["everyone"] } : { parse: [] }
    }).then(() => true).catch(() => false);
    if (!sent) {
      if (!opts.skipReply) await interaction.reply({ content: "I could not send to that channel.", ephemeral: true });
      return "Destination send failed.";
    }
    if (!opts.skipReply) await interaction.reply({ content: `Sent to ${channel}.`, ephemeral });
    return `Sent to ${channel}.`;
  }

  if (actionType === "add_role" || actionType === "remove_role" || actionType === "toggle_role") {
    const roleId = config.roleId;
    const role = roleId ? await interaction.guild!.roles.fetch(roleId).catch(() => null) : null;
    if (!role) {
      if (!opts.skipReply) await interaction.reply({ content: "The configured role is unavailable.", ephemeral: true });
      return "Role unavailable.";
    }
    const targetMember = config.targetUserId
      ? await interaction.guild!.members.fetch(config.targetUserId).catch(() => null)
      : await interaction.guild!.members.fetch(interaction.user.id);
    if (!targetMember) {
      if (!opts.skipReply) await interaction.reply({ content: "Target member not found.", ephemeral: true });
      return "Member not found.";
    }
    try {
      if (actionType === "add_role") await targetMember.roles.add(role, formatReason(config, variables));
      else if (actionType === "remove_role") await targetMember.roles.remove(role, formatReason(config, variables));
      else {
        if (targetMember.roles.cache.has(role.id)) await targetMember.roles.remove(role, formatReason(config, variables));
        else await targetMember.roles.add(role, formatReason(config, variables));
      }
    } catch {
      if (!opts.skipReply) await interaction.reply({ content: "Could not modify role. Check hierarchy and permissions.", ephemeral: true });
      return "Role modification failed.";
    }
    if (!opts.skipReply) await interaction.reply({ content: `${actionType === "add_role" ? "Added" : actionType === "remove_role" ? "Removed" : "Toggled"} ${role} for ${targetMember}.`, ephemeral });
    return `${actionType} completed.`;
  }

  if (actionType === "add_roles" || actionType === "remove_roles") {
    const targetMember = config.targetUserId
      ? await interaction.guild!.members.fetch(config.targetUserId).catch(() => null)
      : await interaction.guild!.members.fetch(interaction.user.id);
    if (!targetMember) {
      if (!opts.skipReply) await interaction.reply({ content: "Target member not found.", ephemeral: true });
      return "Member not found.";
    }
    const roles = (await Promise.all(config.roleIds.map((id) => interaction.guild!.roles.fetch(id)))).filter(Boolean);
    if (!roles.length) {
      if (!opts.skipReply) await interaction.reply({ content: "None of the configured roles were found.", ephemeral: true });
      return "Roles not found.";
    }
    try {
      if (actionType === "add_roles") await targetMember.roles.add(roles as any, formatReason(config, variables));
      else await targetMember.roles.remove(roles as any, formatReason(config, variables));
    } catch {
      if (!opts.skipReply) await interaction.reply({ content: "Could not modify roles. Check hierarchy and permissions.", ephemeral: true });
      return "Role modification failed.";
    }
    if (!opts.skipReply) await interaction.reply({ content: `${actionType === "add_roles" ? "Added" : "Removed"} ${roles.length} role(s) for ${targetMember}.`, ephemeral });
    return `${actionType} completed.`;
  }

  if (actionType === "post_ticket_panel") {
    const panelId = config.ticketPanelId;
    if (!panelId || !interaction.channel || !("send" in interaction.channel)) {
      if (!opts.skipReply) await interaction.reply({ content: "The saved ticket panel or current channel is unavailable.", ephemeral: true });
      return "Panel unavailable.";
    }
    await postTicketPanel(interaction.guild!, panelId, interaction.channel as any);
    if (!opts.skipReply) await interaction.reply({ content: "Ticket panel posted.", ephemeral });
    return "Panel posted.";
  }

  if (actionType === "send_announcement") {
    const templateId = config.announcementTemplateId;
    const template = templateId ? await getAnnouncement(templateId, interaction.guildId!) : null;
    const channelId = config.targetChannelId ?? template?.targetChannelId;
    const channel = channelId ? await interaction.guild!.channels.fetch(channelId).catch(() => null) : null;
    const built = templateId && channel?.isTextBased() && !channel.isDMBased()
      ? await buildAnnouncementMessage(interaction.guild!, templateId, channel)
      : null;
    if (!template || !built || !channel || !channel.isTextBased() || channel.isDMBased() || !("send" in channel)) {
      if (!opts.skipReply) await interaction.reply({ content: "The saved announcement or destination channel is unavailable.", ephemeral: true });
      return "Announcement unavailable.";
    }
    const { message, pingType: templatePingType } = built;
    const pingType = config.pingType === "none" ? templatePingType : config.pingType;
    const sendPayload: Record<string, unknown> = { ...message };
    const ping = pingType === "everyone" ? "@everyone" : pingType === "here" ? "@here" : "";
    const missingPermission = getMissingAnnouncementPermission(interaction.guild!, channel, message, pingType);
    if (missingPermission) {
      if (!opts.skipReply) {
        await interaction.reply({
          content: `I need the **${missingPermission}** permission in the announcement channel.`,
          ephemeral: true
        });
      }
      return `Announcement permission missing: ${missingPermission}.`;
    }
    sendPayload.content = [ping, message.content].filter(Boolean).join("\n") || undefined;
    sendPayload.allowedMentions = ping ? { parse: ["everyone"] } : { parse: [] };
    const sent = await channel.send(sendPayload).then(() => true).catch(() => false);
    if (!sent) {
      if (!opts.skipReply) await interaction.reply({ content: "I could not send that announcement.", ephemeral: true });
      return "Announcement send failed.";
    }
    if (!opts.skipReply) await interaction.reply({ content: `Announcement sent to ${channel}.`, ephemeral });
    return "Announcement sent.";
  }

  if (actionType === "create_ticket") {
    const settings = await getGuildSettings(interaction.guildId!);
    const type = config.ticketPanelId ? await getTicketType(config.ticketPanelId, interaction.guildId!) : null;
    const targetMember = await interaction.guild!.members.fetch(interaction.user.id);
    const channelName = config.newName || `ticket-${interaction.user.username}`;
    const cleanName = channelName.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").slice(0, 90) || "ticket";
    try {
      const channel = await interaction.guild!.channels.create({
        name: cleanName,
        type: ChannelType.GuildText,
        parent: config.newCategoryId ?? type?.categoryId ?? settings.ticketCategoryId ?? undefined,
        permissionOverwrites: [
          { id: interaction.guild!.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
          { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] },
          { id: interaction.guild!.members.me!.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] },
          ...(type ? type.staffRoleIds : settings.staffRoleIds).map((roleId) => ({
            id: roleId,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] as any
          }))
        ]
      });
      await createTicketRecord({
        guildId: interaction.guildId!,
        channelId: channel.id,
        userId: interaction.user.id,
        ticketTypeId: type?.id ?? 0,
        panelId: null
      });
      const rendered = renderEmbedMessage({
        content: "", title: type?.label || "Ticket", titleUrl: "", description: type?.welcomeMessage || "A staff member will be with you shortly.",
        color: type?.color || "#5865F2", authorName: "", authorIconUrl: "", authorUrl: "",
        imageUrl: type?.imageUrl || "", thumbnailUrl: type?.thumbnailUrl || "",
        footerText: type?.footerText || "", footerIconUrl: type?.footerIconUrl || "", timestamp: true, fields: [{ name: "Opened by", value: `<@${interaction.user.id}>`, inline: false }]
      }, variables);
      await channel.send({ ...rendered, content: interaction.user.toString() });
      if (!opts.skipReply) await interaction.reply({ content: `Ticket created: ${channel}`, ephemeral });
      return "Ticket created.";
    } catch {
      if (!opts.skipReply) await interaction.reply({ content: "Could not create ticket channel.", ephemeral: true });
      return "Ticket creation failed.";
    }
  }

  if (actionType === "request_close_ticket") {
    const prepared = await prepareTicketCloseRequest(
      interaction,
      formatReason(config, variables),
      "community"
    );
    if (prepared.error || !prepared.payload) {
      if (!opts.skipReply) await interaction.reply({ content: prepared.error ?? "Could not create the close request.", ephemeral: true });
      return prepared.error ?? "Close request failed.";
    }
    if (opts.skipReply) await interaction.followUp({ ...prepared.payload, ephemeral: false });
    else await interaction.reply(prepared.payload);
    return "Close request submitted.";
  }

  if (actionType === "lock_channel" || actionType === "unlock_channel") {
    if (!(interaction.channel instanceof TextChannel)) {
      if (!opts.skipReply) await interaction.reply({ content: "This action only works in text channels.", ephemeral: true });
      return "Not a text channel.";
    }
    try {
      if (actionType === "lock_channel") {
        await interaction.channel.permissionOverwrites.edit(interaction.guild!.roles.everyone.id, {
          SendMessages: false
        });
      } else {
        await interaction.channel.permissionOverwrites.edit(interaction.guild!.roles.everyone.id, {
          SendMessages: true
        });
      }
    } catch {
      if (!opts.skipReply) await interaction.reply({ content: "Could not change channel permissions.", ephemeral: true });
      return "Permission change failed.";
    }
    if (!opts.skipReply) await interaction.reply({ content: actionType === "lock_channel" ? "Channel locked." : "Channel unlocked.", ephemeral });
    return `${actionType} completed.`;
  }

  if (actionType === "rename_channel") {
    if (!(interaction.channel instanceof TextChannel)) {
      if (!opts.skipReply) await interaction.reply({ content: "This action only works in text channels.", ephemeral: true });
      return "Not a text channel.";
    }
    const newName = replacePlaceholders(config.newName, variables).toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").slice(0, 90);
    if (!newName) {
      if (!opts.skipReply) await interaction.reply({ content: "Provide a valid new channel name.", ephemeral: true });
      return "Invalid name.";
    }
    try {
      await interaction.channel.setName(newName, formatReason(config, variables));
    } catch {
      if (!opts.skipReply) await interaction.reply({ content: "Could not rename channel.", ephemeral: true });
      return "Rename failed.";
    }
    if (!opts.skipReply) await interaction.reply({ content: `Channel renamed to #${newName}.`, ephemeral });
    return "Renamed.";
  }

  if (actionType === "move_channel") {
    if (!(interaction.channel instanceof TextChannel)) {
      if (!opts.skipReply) await interaction.reply({ content: "This action only works in text channels.", ephemeral: true });
      return "Not a text channel.";
    }
    const category = config.newCategoryId ? await interaction.guild!.channels.fetch(config.newCategoryId).catch(() => null) : null;
    if (!category || category.type !== ChannelType.GuildCategory) {
      if (!opts.skipReply) await interaction.reply({ content: "The target category was not found.", ephemeral: true });
      return "Category not found.";
    }
    try {
      await interaction.channel.setParent(category.id, { lockPermissions: false });
    } catch {
      if (!opts.skipReply) await interaction.reply({ content: "Could not move channel.", ephemeral: true });
      return "Move failed.";
    }
    if (!opts.skipReply) await interaction.reply({ content: `Moved to ${category.name}.`, ephemeral });
    return "Moved.";
  }

  if (actionType === "add_user_to_channel" || actionType === "remove_user_from_channel") {
    if (!(interaction.channel instanceof TextChannel)) {
      if (!opts.skipReply) await interaction.reply({ content: "This action only works in text channels.", ephemeral: true });
      return "Not a text channel.";
    }
    const targetUser = config.targetUserId ? await interaction.client.users.fetch(config.targetUserId).catch(() => null) : null;
    if (!targetUser) {
      if (!opts.skipReply) await interaction.reply({ content: "Target user not found.", ephemeral: true });
      return "User not found.";
    }
    try {
      if (actionType === "add_user_to_channel") {
        await interaction.channel.permissionOverwrites.edit(targetUser.id, {
          ViewChannel: true, SendMessages: true, ReadMessageHistory: true
        });
      } else {
        await interaction.channel.permissionOverwrites.delete(targetUser.id);
      }
    } catch {
      if (!opts.skipReply) await interaction.reply({ content: "Could not change user permissions.", ephemeral: true });
      return "Permission change failed.";
    }
    if (!opts.skipReply) await interaction.reply({ content: `${targetUser} ${actionType === "add_user_to_channel" ? "added to" : "removed from"} channel.`, ephemeral });
    return `${actionType} completed.`;
  }

  if (actionType === "timeout_user") {
    const targetMember = config.targetUserId ? await interaction.guild!.members.fetch(config.targetUserId).catch(() => null) : null;
    if (!targetMember) {
      if (!opts.skipReply) await interaction.reply({ content: "Target member not found.", ephemeral: true });
      return "Member not found.";
    }
    if (!targetMember.moderatable) {
      if (!opts.skipReply) await interaction.reply({ content: "I cannot timeout that member. Check hierarchy.", ephemeral: true });
      return "Not moderatable.";
    }
    const minutes = config.durationMinutes ?? 60;
    try {
      await targetMember.timeout(minutes * 60_000, formatReason(config, variables));
    } catch {
      if (!opts.skipReply) await interaction.reply({ content: "Timeout failed.", ephemeral: true });
      return "Timeout failed.";
    }
    if (!opts.skipReply) await interaction.reply({ content: `${targetMember} timed out for ${minutes} minute(s).`, ephemeral });
    return "Timed out.";
  }

  if (actionType === "remove_timeout") {
    const targetMember = config.targetUserId ? await interaction.guild!.members.fetch(config.targetUserId).catch(() => null) : null;
    if (!targetMember) {
      if (!opts.skipReply) await interaction.reply({ content: "Target member not found.", ephemeral: true });
      return "Member not found.";
    }
    try {
      await targetMember.timeout(null, formatReason(config, variables));
    } catch {
      if (!opts.skipReply) await interaction.reply({ content: "Remove timeout failed.", ephemeral: true });
      return "Failed.";
    }
    if (!opts.skipReply) await interaction.reply({ content: `Timeout removed from ${targetMember}.`, ephemeral });
    return "Timeout removed.";
  }

  if (actionType === "kick_user") {
    const targetMember = config.targetUserId ? await interaction.guild!.members.fetch(config.targetUserId).catch(() => null) : null;
    if (!targetMember) {
      if (!opts.skipReply) await interaction.reply({ content: "Target member not found.", ephemeral: true });
      return "Member not found.";
    }
    if (!targetMember.kickable) {
      if (!opts.skipReply) await interaction.reply({ content: "I cannot kick that member. Check hierarchy.", ephemeral: true });
      return "Not kickable.";
    }
    try {
      await targetMember.kick(formatReason(config, variables));
    } catch {
      if (!opts.skipReply) await interaction.reply({ content: "Kick failed.", ephemeral: true });
      return "Kick failed.";
    }
    if (!opts.skipReply) await interaction.reply({ content: `${targetMember} was kicked.`, ephemeral });
    return "Kicked.";
  }

  if (actionType === "ban_user") {
    const targetUser = config.targetUserId ? await interaction.client.users.fetch(config.targetUserId).catch(() => null) : null;
    if (!targetUser) {
      if (!opts.skipReply) await interaction.reply({ content: "Target user not found.", ephemeral: true });
      return "User not found.";
    }
    try {
      await interaction.guild!.members.ban(targetUser.id, {
        deleteMessageSeconds: (config.deleteMessageDays ?? 0) * 86_400,
        reason: formatReason(config, variables)
      });
    } catch {
      if (!opts.skipReply) await interaction.reply({ content: "Ban failed.", ephemeral: true });
      return "Ban failed.";
    }
    if (!opts.skipReply) await interaction.reply({ content: `${targetUser.tag} was banned.`, ephemeral });
    return "Banned.";
  }

  if (actionType === "unban_user") {
    const targetUser = config.targetUserId ? await interaction.client.users.fetch(config.targetUserId).catch(() => null) : null;
    if (!targetUser) {
      if (!opts.skipReply) await interaction.reply({ content: "Target user not found.", ephemeral: true });
      return "User not found.";
    }
    try {
      await interaction.guild!.members.unban(targetUser.id, formatReason(config, variables));
    } catch {
      if (!opts.skipReply) await interaction.reply({ content: "Unban failed. The user may not be banned.", ephemeral: true });
      return "Unban failed.";
    }
    if (!opts.skipReply) await interaction.reply({ content: `${targetUser.tag} was unbanned.`, ephemeral });
    return "Unbanned.";
  }

  if (actionType === "purge_messages") {
    if (!(interaction.channel instanceof TextChannel)) {
      if (!opts.skipReply) await interaction.reply({ content: "This action only works in text channels.", ephemeral: true });
      return "Not a text channel.";
    }
    const amount = config.amount ?? 10;
    try {
      const deleted = await interaction.channel.bulkDelete(amount, true);
      if (!opts.skipReply) await interaction.reply({ content: `Deleted ${deleted.size} messages.`, ephemeral });
      return `Deleted ${deleted.size} messages.`;
    } catch {
      if (!opts.skipReply) await interaction.reply({ content: "Purge failed. Messages may be older than 14 days.", ephemeral: true });
      return "Purge failed.";
    }
  }

  if (actionType === "require_role") {
    const roleId = config.roleId;
    const member = await interaction.guild!.members.fetch(interaction.user.id);
    if (!roleId || !member.roles.cache.has(roleId)) {
      if (!opts.skipReply) await interaction.reply({ content: "You do not have the required role to run this command.", ephemeral: true });
      return "Missing required role.";
    }
    if (!opts.skipReply) await interaction.reply({ content: "Role requirement satisfied.", ephemeral });
    return "Role check passed.";
  }

  if (actionType === "require_permission") {
    const requiredPerms = config.content.trim() as keyof typeof PermissionFlagsBits;
    if (!requiredPerms || !interaction.memberPermissions?.has(PermissionFlagsBits[requiredPerms] as any)) {
      if (!opts.skipReply) await interaction.reply({ content: "You do not have the required permission to run this command.", ephemeral: true });
      return "Missing required permission.";
    }
    if (!opts.skipReply) await interaction.reply({ content: "Permission requirement satisfied.", ephemeral });
    return "Permission check passed.";
  }

  if (actionType === "log_to_mod") {
    const settings = await getGuildSettings(interaction.guildId!);
    const channelId = config.logChannelId || settings.modLogChannelId;
    if (channelId) {
      const embed = renderEmbedMessage({
        ...config.embed,
        title: config.embed.title || "Custom command log",
        description: config.embed.description || replacePlaceholders(config.content, variables),
        color: config.embed.color || "#5865F2",
        timestamp: true,
        fields: [
          ...(config.embed.fields || []),
          { name: "User", value: `<@${interaction.user.id}>`, inline: true },
          { name: "Channel", value: `<#${interaction.channelId}>`, inline: true }
        ]
      }, variables);
      if (embed.embeds && embed.embeds.length > 0) {
        const embedObj = embed.embeds[0];
        if (embedObj) {
          await sendGuildLog(
            interaction.guildId!,
            channelId,
            (id) => interaction.guild!.channels.fetch(id),
            embedObj
          );
        }
      }
    }
    if (!opts.skipReply) await interaction.reply({ content: "Action logged.", ephemeral });
    return "Logged.";
  }

  return undefined;
}
