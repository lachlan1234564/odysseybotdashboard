import { ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { getGuildSettings } from "../database/index.js";
import type { GuildSettings } from "../shared/types.js";
import { asColor } from "./utils.js";

export function buildHelpEmbed(settings: GuildSettings) {
  const staffRoles = settings.staffRoleIds.length
    ? settings.staffRoleIds.map((id) => `<@&${id}>`).join(", ")
    : "Discord moderators with **Manage Channels**";
  const adminRoles = settings.adminRoleIds.length
    ? settings.adminRoleIds.map((id) => `<@&${id}>`).join(", ")
    : "Discord members with **Manage Server**";

  return new EmbedBuilder()
    .setColor(asColor("#5865F2"))
    .setTitle("Odyssey Bot Command Guide")
    .setDescription("Commands are grouped below. Permission labels describe who can run each command.")
    .addFields(
      {
        name: "General · Everyone",
        value: [
          "`/ping` — Check whether the bot is online.",
          "`/help` — Open this private command guide.",
          "`/custom` — Run an enabled dashboard-created command. Its own access rules still apply."
        ].join("\n")
      },
      {
        name: "Tickets",
        value: [
          "`/close-request` — **Ticket staff only.** Ask the opener/community to approve closure.",
          "`/ticket-panel` — **Bot admins.** Post a saved ticket panel.",
          "Ticket **Close Request** button — **Ticket opener / allowed community roles.** Ask staff to close."
        ].join("\n")
      },
      {
        name: "Announcements & Roles · Bot Admins",
        value: [
          "`/announce` — Preview and post a saved announcement.",
          "`/reaction-roles` — Post a saved self-service button role panel."
        ].join("\n")
      },
      {
        name: "Moderation · Discord Permission Required",
        value: [
          "`/warn`, `/warnings`, `/timeout` — **Moderate Members**.",
          "`/kick` — **Kick Members**.",
          "`/ban` — **Ban Members**.",
          "`/clear` — **Manage Messages**."
        ].join("\n")
      },
      {
        name: "Configured Access",
        value: `**Ticket staff:** ${staffRoles}\n**Bot admins:** ${adminRoles}`
      },
      {
        name: "Need setup help?",
        value: "Open the dashboard and select **Docs / Help**. Role panels live under **Automation → Role Panels**."
      }
    )
    .setFooter({ text: "This help message is visible only to you." })
    .setTimestamp();
}

export async function handleHelpCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({ content: "Use `/help` inside a server to see the command guide.", ephemeral: true });
    return;
  }

  const settings = await getGuildSettings(interaction.guildId);
  await interaction.reply({
    embeds: [buildHelpEmbed(settings)],
    ephemeral: true,
    allowedMentions: { roles: [], users: [] }
  });
}
