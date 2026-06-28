import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  EmbedBuilder,
  Guild,
  MessageFlags,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction
} from "discord.js";
import {
  getGuildSettings,
  getRolePanel,
  listRolePanels,
  recordModerationAction,
  updateRolePanel
} from "../database/index.js";
import type { RolePanel } from "../shared/types.js";
import { asColor, buildActionLogEmbed, requireBotAdmin, sendGuildLog } from "./utils.js";
import { deferCommandReply, replyEphemeral, replyToCommand } from "./interactions.js";
import { parseDiscordComponentEmoji } from "../shared/discord-components.js";

type RolePanelInteraction = ButtonInteraction | StringSelectMenuInteraction;

function rolePanelButtonStyle(style: string | null | undefined): ButtonStyle {
  if (style === "primary") return ButtonStyle.Primary;
  if (style === "success") return ButtonStyle.Success;
  if (style === "danger") return ButtonStyle.Danger;
  return ButtonStyle.Secondary;
}

function categoryName(value: string | null | undefined): string {
  return value?.trim() || "General";
}

function categoryRule(panel: RolePanel, category: string) {
  return panel.categoryRules.find((rule) => rule.name === category);
}

function categoryLimit(panel: RolePanel, category: string): number {
  return categoryRule(panel, category)?.maxSelected || panel.maxSelectedPerCategory;
}

function categoryIsExclusive(panel: RolePanel, category: string): boolean {
  return categoryRule(panel, category)?.removeRoleOnSelect || panel.removeRoleOnSelect;
}

async function logRolePanelAction(
  interaction: RolePanelInteraction,
  panel: RolePanel,
  input: {
    title: string;
    action: string;
    status: "Completed" | "Failed";
    reason: string;
    roleId?: string;
    metadata?: Record<string, unknown>;
  }
) {
  if (!interaction.guildId || !interaction.guild) return;
  const settings = await getGuildSettings(interaction.guildId);
  const embed = buildActionLogEmbed({
    title: input.title,
    action: input.action,
    status: input.status,
    reason: input.reason,
    affectedUserId: interaction.user.id,
    executorId: interaction.user.id,
    roleId: input.roleId
  });
  await sendGuildLog(
    interaction.guildId,
    panel.logChannelId ?? settings.modLogChannelId,
    (id) => interaction.guild!.channels.fetch(id),
    embed
  );
  await recordModerationAction({
    guildId: interaction.guildId,
    action: input.action,
    targetUserId: interaction.user.id,
    moderatorId: interaction.user.id,
    reason: input.reason,
    metadata: { panelId: panel.id, roleId: input.roleId, ...input.metadata }
  });
}

export async function buildRolePanelMessage(guild: Guild, panel: RolePanel) {
  const roleMap = new Map((await Promise.all(panel.roleIds.map((id) => guild.roles.fetch(id).catch(() => null))))
    .filter((role) => Boolean(role))
    .map((role) => [role!.id, role!]));
  const options = panel.options.filter((option) => roleMap.has(option.roleId)).slice(0, 25);
  if (!options.length) throw new Error("This panel has no roles that still exist.");

  const embed = new EmbedBuilder()
    .setColor(asColor(panel.color))
    .setTitle(panel.title)
    .setDescription(panel.description || "Choose a role below.")
    .setTimestamp();
  if (panel.thumbnailUrl) embed.setThumbnail(panel.thumbnailUrl);
  if (panel.imageUrl) embed.setImage(panel.imageUrl);
  const categoryFields = panel.categoryRules
    .filter((rule) => rule.title || rule.description)
    .slice(0, 8)
    .map((rule) => ({
      name: rule.title || rule.name,
      value: rule.description || "Choose one of the roles in this category.",
      inline: false
    }));
  if (categoryFields.length) embed.addFields(categoryFields);

  const rows: Array<ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>> = [];
  if (panel.layout === "dropdown") {
    const categoryLimits = options
      .map((option) => categoryLimit(panel, categoryName(option.category)))
      .filter((value) => value > 0);
    const maxValues = Math.max(1, Math.min(25, options.length, categoryLimits.length ? Math.max(...categoryLimits) : options.length));
    rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`role-panel:select:${panel.id}`)
        .setPlaceholder("Choose your roles")
        .setMinValues(0)
        .setMaxValues(maxValues)
        .addOptions(options.map((option) => {
          const role = roleMap.get(option.roleId)!;
          const choice = {
            label: (option.label || role.name).slice(0, 100),
            value: option.roleId,
            description: (option.description || option.category || "Toggle this role").slice(0, 100)
          };
          if (option.emoji) {
            try {
              Object.assign(choice, { emoji: parseDiscordComponentEmoji(option.emoji) });
            } catch {
              // Invalid saved emoji should not break the whole panel.
            }
          }
          return choice;
        }))
    ));
  } else {
    for (let index = 0; index < options.length; index += 5) {
      rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
        ...options.slice(index, index + 5).map((option) => {
          const role = roleMap.get(option.roleId)!;
          const button = new ButtonBuilder()
            .setCustomId(`role-panel:toggle:${panel.id}:${role.id}`)
            .setLabel((option.label || role.name).slice(0, 80))
            .setStyle(rolePanelButtonStyle(option.buttonStyle || panel.buttonStyle));
          if (option.emoji) {
            try {
              button.setEmoji(parseDiscordComponentEmoji(option.emoji)!);
            } catch {
              // Invalid saved emoji should not break the whole panel.
            }
          }
          return button;
        })
      ));
    }
  }

  return {
    embeds: [embed],
    components: rows
  };
}

async function applyRoleFromPanel(
  interaction: RolePanelInteraction,
  panel: RolePanel,
  roleId: string
): Promise<{ ok: boolean; message: string }> {
  if (!interaction.guild || !interaction.guildId) {
    return { ok: false, message: "Role panels can only be used inside a server." };
  }
  const option = panel.options.find((item) => item.roleId === roleId);
  if (!option) return { ok: false, message: "That role option is no longer on this panel." };

  const [member, role] = await Promise.all([
    interaction.guild.members.fetch(interaction.user.id),
    interaction.guild.roles.fetch(roleId).catch(() => null)
  ]);
  if (!role) {
    await logRolePanelAction(interaction, panel, {
      title: "Role Claim Failed",
      action: "role_panel_failed",
      status: "Failed",
      reason: "The saved role no longer exists.",
      roleId
    });
    return { ok: false, message: "That role no longer exists. Ask staff to update this panel." };
  }
  if (!role.editable || !interaction.guild.members.me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
    await logRolePanelAction(interaction, panel, {
      title: "Role Claim Failed",
      action: "role_panel_failed",
      status: "Failed",
      reason: `I cannot manage ${role.name}. Move my bot role above it and grant Manage Roles.`,
      roleId: role.id
    });
    return { ok: false, message: "I cannot manage that role. Move my bot role above it and grant Manage Roles." };
  }
  const requiredRoleId = option.requiredRoleId ?? panel.requiredRoleId;
  if (requiredRoleId && !member.roles.cache.has(requiredRoleId)) {
    await logRolePanelAction(interaction, panel, {
      title: "Role Claim Failed",
      action: "role_panel_missing_required_role",
      status: "Failed",
      reason: `Missing required role ${requiredRoleId} before claiming ${role.name}.`,
      roleId: role.id,
      metadata: { requiredRoleId }
    });
    return { ok: false, message: `You need <@&${requiredRoleId}> before claiming **${role.name}**.` };
  }

  const removing = member.roles.cache.has(role.id);
  if (removing && panel.toggleMode === "add_only") {
    return { ok: true, message: `You already have **${role.name}**.` };
  }
  const removedCategoryRoles: string[] = [];
  if (!removing && categoryIsExclusive(panel, categoryName(option.category))) {
    const category = categoryName(option.category);
    const categoryRoleIds = panel.options
      .filter((item) => item.roleId !== role.id && categoryName(item.category) === category)
      .map((item) => item.roleId)
      .filter((id) => member.roles.cache.has(id));
    for (const otherRoleId of categoryRoleIds) {
      const otherRole = await interaction.guild.roles.fetch(otherRoleId).catch(() => null);
      if (otherRole?.editable) {
        await member.roles.remove(otherRole, `Self-service role panel category switch: ${panel.name}`).catch(() => null);
        removedCategoryRoles.push(otherRole.id);
      }
    }
  } else if (!removing && categoryLimit(panel, categoryName(option.category)) > 0) {
    const category = categoryName(option.category);
    const maxSelected = categoryLimit(panel, category);
    const selectedInCategory = panel.options
      .filter((item) => categoryName(item.category) === category && member.roles.cache.has(item.roleId))
      .length;
    if (selectedInCategory >= maxSelected) {
      await logRolePanelAction(interaction, panel, {
        title: "Role Claim Failed",
        action: "role_panel_category_limit",
        status: "Failed",
        reason: `Category limit reached for ${category}.`,
        roleId: role.id,
        metadata: { category, maxSelected }
      });
      return { ok: false, message: `You can only have ${maxSelected} role(s) from **${category}** on this panel.` };
    }
  }

  const result = await (removing
    ? member.roles.remove(role, `Self-service role panel: ${panel.name}`)
    : member.roles.add(role, `Self-service role panel: ${panel.name}`)
  ).catch(async (error: Error) => {
    await logRolePanelAction(interaction, panel, {
      title: "Role Claim Failed",
      action: "role_panel_failed",
      status: "Failed",
      reason: `Could not ${removing ? "remove" : "add"} ${role.name}: ${error.message}`,
      roleId: role.id
    });
    return null;
  });
  if (!result) {
    return { ok: false, message: `I could not ${removing ? "remove" : "add"} **${role.name}**. Check my role position and Manage Roles permission.` };
  }

  await logRolePanelAction(interaction, panel, {
    title: removing ? "Role Panel Role Removed" : "Role Panel Role Claimed",
    action: removing ? "role_panel_remove" : "role_panel_add",
    status: "Completed",
    reason: `Self-service panel: ${panel.name}`,
    roleId: role.id,
    metadata: { removedCategoryRoles }
  });
  return {
    ok: true,
    message: `${removing ? "Removed" : "Added"} **${role.name}**.${removedCategoryRoles.length ? " I also removed the previous role in that category." : ""}`
  };
}

async function toggleRoleFromPanel(
  interaction: RolePanelInteraction,
  panel: RolePanel,
  roleId: string
): Promise<void> {
  const result = await applyRoleFromPanel(interaction, panel, roleId);
  await interaction.reply({ content: result.message, flags: MessageFlags.Ephemeral });
}

export async function handleRolePanelButton(interaction: ButtonInteraction): Promise<void> {
  if (!interaction.guild || !interaction.guildId) return;
  const [, , panelIdText, roleId] = interaction.customId.split(":");
  const panel = await getRolePanel(Number(panelIdText), interaction.guildId);
  if (!panel?.active || !roleId || !panel.roleIds.includes(roleId)) {
    await interaction.reply({ content: "This role panel is no longer active.", flags: MessageFlags.Ephemeral });
    return;
  }
  await toggleRoleFromPanel(interaction, panel, roleId);
}

export async function handleRolePanelSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  if (!interaction.guild || !interaction.guildId) return;
  const [, , panelIdText] = interaction.customId.split(":");
  const panel = await getRolePanel(Number(panelIdText), interaction.guildId);
  if (!panel?.active) {
    await interaction.reply({ content: "This role panel is no longer active.", flags: MessageFlags.Ephemeral });
    return;
  }
  const chosenRoleIds = interaction.values.filter((roleId) => panel.roleIds.includes(roleId));
  if (!chosenRoleIds.length) {
    await interaction.reply({ content: "Choose a role from this panel.", flags: MessageFlags.Ephemeral });
    return;
  }
  if (chosenRoleIds.length === 1) {
    await toggleRoleFromPanel(interaction, panel, chosenRoleIds[0]!);
    return;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const results = [];
  for (const roleId of chosenRoleIds) {
    results.push(await applyRoleFromPanel(interaction, panel, roleId));
  }
  await interaction.editReply({
    content: results.map((result) => result.message).join("\n").slice(0, 1900)
  });
}

export async function handleReactionRolesCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild || !interaction.guildId) {
    await replyEphemeral(interaction, "This command can only be used in a server.");
    return;
  }
  await deferCommandReply(interaction);
  if (!(await requireBotAdmin(interaction))) return;

  const panelId = Number(interaction.options.getString("panel", true));
  const panel = await getRolePanel(panelId, interaction.guildId);
  if (!panel?.active) {
    await replyToCommand(interaction, {
      content: "That role panel is missing or inactive. Create and enable one under Dashboard → Automation → Role Panels."
    });
    return;
  }

  const configuredChannel = panel.channelId
    ? await interaction.guild.channels.fetch(panel.channelId).catch(() => null)
    : null;
  const target = interaction.options.getChannel("channel") ?? configuredChannel ?? interaction.channel;
  if (!target || !("send" in target) || typeof target.send !== "function") {
    await replyToCommand(interaction, {
      content: "Choose a text channel, or save a default channel on the role panel."
    });
    return;
  }

  const sent = await target.send(await buildRolePanelMessage(interaction.guild, panel));
  const { id: _id, guildId: _guildId, createdAt: _createdAt, updatedAt: _updatedAt, ...updateInput } = panel;
  await updateRolePanel(panel.id, interaction.guildId, {
    ...updateInput,
    channelId: "id" in target ? target.id : panel.channelId,
    messageId: sent.id
  });
  await replyToCommand(interaction, {
    content: `Posted the **${panel.name}** self-service role panel in ${target}.`
  });
}

export function availableRolePanels(guildId: string): Promise<RolePanel[]> {
  return listRolePanels(guildId);
}
