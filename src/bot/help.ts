import { ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { getGuildSettings } from "../database/index.js";
import type { GuildSettings } from "../shared/types.js";
import { asColor } from "./utils.js";
import { deferCommandReply, replyEphemeral, replyToCommand } from "./interactions.js";

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
          "`/server info` — View this server's setup and enabled features.",
          "`/user-info member` — View account age, roles, join date, and warning count.",
          "`/bot-status` — View bot uptime, latency, memory, and server count.",
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
        name: "Administration · Bot Admins",
        value: [
          "`/announce` — Preview and post a saved announcement.",
          "`/socials-post` — Publish the saved social promotion.",
          "`/reaction-roles` — Post a saved self-service button/dropdown role panel.",
          "`/giveaway start/end/reroll/cancel` — Manage restart-safe giveaways.",
          "`/verification setup` — **Manage Server.** Apply the configured verification gate.",
          "`/verification status` — **Manage Server.** Review gate setup status.",
          "`/automod-status` — Review active Auto Mod and channel link rules.",
          "`/lockdown`, `/unlockdown` — Change channel send permissions during an incident."
        ].join("\n")
      },
      {
        name: "Moderation · Discord Permission Required",
        value: [
          "`/warn`, `/warnings`, `/timeout` — **Moderate Members**.",
          "`/case view/search/create/edit/note` — **Moderate Members**. Manage moderation cases.",
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
    await replyEphemeral(interaction, "Use `/help` inside a server to see the command guide.");
    return;
  }

  await deferCommandReply(interaction);
  const settings = await getGuildSettings(interaction.guildId);
  await replyToCommand(interaction, {
    embeds: [buildHelpEmbed(settings)],
    allowedMentions: { roles: [], users: [] }
  });
}
