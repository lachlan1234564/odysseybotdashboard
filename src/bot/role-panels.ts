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
  recordModerationAction
} from "../database/index.js";
import type { RolePanel } from "../shared/types.js";
import { asColor, buildActionLogEmbed, requireBotAdmin, sendGuildLog } from "./utils.js";
import { deferCommandReply, replyEphemeral, replyToCommand } from "./interactions.js";
import { parseDiscordComponentEmoji } from "../shared/discord-components.js";

export async function buildRolePanelMessage(guild: Guild, panel: RolePanel) {
  const roleMap = new Map((await Promise.all(panel.roleIds.map((id) => guild.roles.fetch(id).catch(() => null))))
    .filter((role) => Boolean(role))
    .map((role) => [role!.id, role!]));
  const options = panel.options.filter((option) => roleMap.has(option.roleId)).slice(0, 25);
  if (!options.length) throw new Error("This panel has no roles that still exist.");

  const rows: Array<ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>> = [];
  if (panel.layout === "dropdown") {
    const categories = new Set(options.map((option) => option.category || "General"));
    const maxValues = categories.size === 1 && panel.maxSelectedPerCategory > 0
      ? Math.min(panel.maxSelectedPerCategory, options.length)
      : Math.min(options.length, 25);
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
            .setStyle(ButtonStyle.Secondary);
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
    embeds: [
      new EmbedBuilder()
        .setColor(asColor(panel.color))
        .setTitle(panel.title)
        .setDescription(panel.description || "Choose a role below.")
        .setTimestamp()
    ],
    components: rows
  };
}

async function toggleRoleFromPanel(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
  panel: RolePanel,
  roleId: string
): Promise<void> {
  if (!interaction.guild || !interaction.guildId) return;
  const option = panel.options.find((item) => item.roleId === roleId);
  if (!option) throw new Error("That role option is no longer on this panel.");

  const [member, role] = await Promise.all([
    interaction.guild.members.fetch(interaction.user.id),
    interaction.guild.roles.fetch(roleId).catch(() => null)
  ]);
  if (!role) {
    await interaction.reply({ content: "That role no longer exists.", flags: MessageFlags.Ephemeral });
    return;
  }
  if (!role.editable || !interaction.guild.members.me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
    await interaction.reply({
      content: "I cannot manage that role. Move my bot role above it and grant Manage Roles.",
      flags: MessageFlags.Ephemeral
    });
    return;
  }
  const requiredRoleId = option.requiredRoleId ?? panel.requiredRoleId;
  if (requiredRoleId && !member.roles.cache.has(requiredRoleId)) {
    await interaction.reply({
      content: `You need <@&${requiredRoleId}> before claiming **${role.name}**.`,
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  const removing = member.roles.cache.has(role.id);
  const removedCategoryRoles: string[] = [];
  if (!removing && panel.removeRoleOnSelect) {
    const category = option.category || "General";
    const categoryRoleIds = panel.options
      .filter((item) => item.roleId !== role.id && (item.category || "General") === category)
      .map((item) => item.roleId)
      .filter((id) => member.roles.cache.has(id));
    for (const otherRoleId of categoryRoleIds) {
      const otherRole = await interaction.guild.roles.fetch(otherRoleId).catch(() => null);
      if (otherRole?.editable) {
        await member.roles.remove(otherRole, `Self-service role panel category switch: ${panel.name}`).catch(() => null);
        removedCategoryRoles.push(otherRole.id);
      }
    }
  } else if (!removing && panel.maxSelectedPerCategory > 0) {
    const category = option.category || "General";
    const selectedInCategory = panel.options
      .filter((item) => (item.category || "General") === category && member.roles.cache.has(item.roleId))
      .length;
    if (selectedInCategory >= panel.maxSelectedPerCategory) {
      await interaction.reply({
        content: `You can only have ${panel.maxSelectedPerCategory} role(s) from **${category}** on this panel.`,
        flags: MessageFlags.Ephemeral
      });
      return;
    }
  }

  const result = await (removing
    ? member.roles.remove(role, `Self-service role panel: ${panel.name}`)
    : member.roles.add(role, `Self-service role panel: ${panel.name}`)
  ).catch(async (error: Error) => {
    await interaction.reply({
      content: `I could not ${removing ? "remove" : "add"} that role: ${error.message}`,
      flags: MessageFlags.Ephemeral
    });
    return null;
  });
  if (!result) return;
  await interaction.reply({
    content: `${removing ? "Removed" : "Added"} **${role.name}**.${removedCategoryRoles.length ? " I also removed the previous role in that category." : ""}`,
    flags: MessageFlags.Ephemeral
  });

  const settings = await getGuildSettings(interaction.guildId);
  const embed = buildActionLogEmbed({
    title: "Role panel update",
    action: removing ? "role_removed" : "role_added",
    status: "Completed",
    reason: `Self-service panel: ${panel.name}`,
    affectedUserId: result.id,
    executorId: result.id,
    roleId: role.id
  });
  await sendGuildLog(
    interaction.guildId,
    panel.logChannelId ?? settings.modLogChannelId,
    (id) => interaction.guild!.channels.fetch(id),
    embed
  );
  await recordModerationAction({
    guildId: interaction.guildId,
    action: removing ? "role_panel_remove" : "role_panel_add",
    targetUserId: result.id,
    moderatorId: result.id,
    reason: panel.name,
    metadata: { roleId: role.id, panelId: panel.id, removedCategoryRoles }
  });
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
  const chosenRoleId = interaction.values[0];
  if (!chosenRoleId || !panel.roleIds.includes(chosenRoleId)) {
    await interaction.reply({ content: "Choose a role from this panel.", flags: MessageFlags.Ephemeral });
    return;
  }
  await toggleRoleFromPanel(interaction, panel, chosenRoleId);
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

  await target.send(await buildRolePanelMessage(interaction.guild, panel));
  await replyToCommand(interaction, {
    content: `Posted the **${panel.name}** self-service role panel in ${target}.`
  });
}

export function availableRolePanels(guildId: string): Promise<RolePanel[]> {
  return listRolePanels(guildId);
}
