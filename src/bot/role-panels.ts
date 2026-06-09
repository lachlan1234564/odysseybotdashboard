import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  EmbedBuilder,
  Guild,
  PermissionFlagsBits
} from "discord.js";
import {
  getGuildSettings,
  getRolePanel,
  listRolePanels,
  recordModerationAction
} from "../database/index.js";
import type { RolePanel } from "../shared/types.js";
import { asColor, buildActionLogEmbed, requireBotAdmin, sendGuildLog } from "./utils.js";

export async function buildRolePanelMessage(guild: Guild, panel: RolePanel) {
  const roles = (await Promise.all(panel.roleIds.map((id) => guild.roles.fetch(id).catch(() => null))))
    .filter((role) => Boolean(role))
    .slice(0, 25);
  if (!roles.length) throw new Error("This panel has no roles that still exist.");

  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let index = 0; index < roles.length; index += 5) {
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
      ...roles.slice(index, index + 5).map((role) =>
        new ButtonBuilder()
          .setCustomId(`role-panel:toggle:${panel.id}:${role!.id}`)
          .setLabel(role!.name.slice(0, 80))
          .setStyle(ButtonStyle.Secondary)
      )
    ));
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

export async function handleRolePanelButton(interaction: ButtonInteraction): Promise<void> {
  if (!interaction.guild || !interaction.guildId) return;
  const [, , panelIdText, roleId] = interaction.customId.split(":");
  const panel = await getRolePanel(Number(panelIdText), interaction.guildId);
  if (!panel?.active || !panel.roleIds.includes(roleId!)) {
    await interaction.reply({ content: "This role panel is no longer active.", ephemeral: true });
    return;
  }

  const [member, role] = await Promise.all([
    interaction.guild.members.fetch(interaction.user.id),
    interaction.guild.roles.fetch(roleId!).catch(() => null)
  ]);
  if (!role) {
    await interaction.reply({ content: "That role no longer exists.", ephemeral: true });
    return;
  }
  if (!role.editable || !interaction.guild.members.me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
    await interaction.reply({
      content: "I cannot manage that role. Move my bot role above it and grant Manage Roles.",
      ephemeral: true
    });
    return;
  }

  const removing = member.roles.cache.has(role.id);
  const result = await (removing
    ? member.roles.remove(role, `Self-service role panel: ${panel.name}`)
    : member.roles.add(role, `Self-service role panel: ${panel.name}`)
  ).catch(async (error: Error) => {
    await interaction.reply({
      content: `I could not ${removing ? "remove" : "add"} that role: ${error.message}`,
      ephemeral: true
    });
    return null;
  });
  if (!result) return;
  await interaction.reply({
    content: `${removing ? "Removed" : "Added"} **${role.name}**.`,
    ephemeral: true
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
    settings.modLogChannelId,
    (id) => interaction.guild!.channels.fetch(id),
    embed
  );
  await recordModerationAction({
    guildId: interaction.guildId,
    action: removing ? "role_panel_remove" : "role_panel_add",
    targetUserId: result.id,
    moderatorId: result.id,
    reason: panel.name,
    metadata: { roleId: role.id, panelId: panel.id }
  });
}

export async function handleReactionRolesCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild || !interaction.guildId) {
    await interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
    return;
  }
  if (!(await requireBotAdmin(interaction))) return;

  const panelId = Number(interaction.options.getString("panel", true));
  const panel = await getRolePanel(panelId, interaction.guildId);
  if (!panel?.active) {
    await interaction.reply({
      content: "That role panel is missing or inactive. Create and enable one under Dashboard → Automation → Role Panels.",
      ephemeral: true
    });
    return;
  }

  const configuredChannel = panel.channelId
    ? await interaction.guild.channels.fetch(panel.channelId).catch(() => null)
    : null;
  const target = interaction.options.getChannel("channel") ?? configuredChannel ?? interaction.channel;
  if (!target || !("send" in target) || typeof target.send !== "function") {
    await interaction.reply({
      content: "Choose a text channel, or save a default channel on the role panel.",
      ephemeral: true
    });
    return;
  }

  await target.send(await buildRolePanelMessage(interaction.guild, panel));
  await interaction.reply({
    content: `Posted the **${panel.name}** self-service role panel in ${target}.`,
    ephemeral: true
  });
}

export function availableRolePanels(guildId: string): Promise<RolePanel[]> {
  return listRolePanels(guildId);
}
