import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  Guild,
  PermissionFlagsBits,
  User
} from "discord.js";
import {
  getDmSettings,
  getGuildSettings,
  recordModerationAction
} from "../database/index.js";
import type { DmSettings, Giveaway, ModerationCase } from "../shared/types.js";
import { deferCommandReply, replyEphemeral, replyToCommand } from "./interactions.js";
import { asColor, requireBotAdmin, sendGuildLog } from "./utils.js";
import { logError } from "../shared/logging.js";

const dmCooldowns = new Map<string, number>();

function actionTitle(action: string): string {
  return action.split(/[_-]/).filter(Boolean).map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`).join(" ");
}

function replaceCommonVariables(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce((text, [key, value]) => text.replaceAll(`{${key}}`, value), template);
}

function moderationDmEnabled(settings: DmSettings, action: string): boolean {
  if (!settings.moderationDmEnabled) return false;
  if (action === "warn") return settings.dmOnWarn;
  if (action === "timeout" || action === "untimeout") return settings.dmOnTimeout;
  if (action === "kick") return settings.dmOnKick;
  if (action === "ban") return settings.dmOnBan;
  if (action === "unban") return settings.dmOnUnban;
  if (action === "manual" || action === "manual_case") return settings.dmOnManualCase;
  return false;
}

async function logDmAction(
  guild: Guild,
  input: {
    title: string;
    description: string;
    targetUserId: string;
    executorId: string;
    status: "sent" | "failed" | "skipped";
    reason?: string;
    contentPreview?: string;
  }
): Promise<void> {
  const guildSettings = await getGuildSettings(guild.id);
  await sendGuildLog(
    guild.id,
    guildSettings.modLogChannelId,
    (id) => guild.channels.fetch(id),
    new EmbedBuilder()
      .setColor(input.status === "sent" ? asColor("#57D7A1") : input.status === "skipped" ? asColor("#C58B4B") : asColor("#ED4245"))
      .setTitle(input.title)
      .setDescription(input.description)
      .addFields(
        { name: "Target", value: `<@${input.targetUserId}> \`${input.targetUserId}\``, inline: true },
        { name: "Executor", value: `<@${input.executorId}> \`${input.executorId}\``, inline: true },
        { name: "Status", value: input.status, inline: true },
        ...(input.reason ? [{ name: "Reason", value: input.reason.slice(0, 1024) }] : []),
        ...(input.contentPreview ? [{ name: "Content preview", value: input.contentPreview.slice(0, 1024) }] : [])
      )
      .setTimestamp()
  );
}

async function sendPlainDm(user: User, content: string): Promise<boolean> {
  return user.send({ content, allowedMentions: { parse: [] } })
    .then(() => true)
    .catch((error) => {
      logError(`Could not DM user ${user.id}`, error);
      return false;
    });
}

export async function handleDmCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild || !interaction.guildId) {
    await replyEphemeral(interaction, "This command can only be used in a server.");
    return;
  }

  await deferCommandReply(interaction);
  if (!(await requireBotAdmin(interaction))) return;
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) && !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    await replyToCommand(interaction, "You need Manage Server or Administrator to send bot DMs.");
    return;
  }

  const settings = await getDmSettings(interaction.guildId);
  if (!settings.dmCommandEnabled) {
    await replyToCommand(interaction, "The `/dm` command is disabled in dashboard DM settings.");
    return;
  }

  const cooldownKey = `${interaction.guildId}:${interaction.user.id}`;
  const now = Date.now();
  const nextAllowed = dmCooldowns.get(cooldownKey) ?? 0;
  if (nextAllowed > now) {
    await replyToCommand(interaction, `Slow down a little. You can send another staff DM <t:${Math.ceil(nextAllowed / 1000)}:R>.`);
    return;
  }
  dmCooldowns.set(cooldownKey, now + settings.dmCommandRateLimitSeconds * 1000);

  const user = interaction.options.getUser("user", true);
  const message = interaction.options.getString("message", true).trim();
  const reason = interaction.options.getString("reason")?.trim() ?? "";
  const anonymous = interaction.options.getBoolean("anonymous") ?? false;
  const asEmbed = interaction.options.getBoolean("embed") ?? false;
  const replyRequired = interaction.options.getBoolean("reply_required") ?? false;

  const staffLine = anonymous ? "Server Staff" : `${interaction.user.tag || interaction.user.username}`;
  const footer = replyRequired
    ? "A staff member requested a reply. Replying to this bot may not reach staff unless your server has reply handling configured."
    : "Please do not reply to this bot unless staff told you replies are supported.";
  const content = [
    `**${interaction.guild.name}**`,
    `Message from ${staffLine}:`,
    "",
    message,
    reason ? `\n**Reason:** ${reason}` : "",
    "",
    footer
  ].filter(Boolean).join("\n");

  const sent = asEmbed
    ? await user.send({
      embeds: [
        new EmbedBuilder()
          .setColor(asColor("#C58B4B"))
          .setTitle(`Message from ${interaction.guild.name}`)
          .setDescription(message)
          .addFields(
            { name: "From", value: staffLine, inline: true },
            ...(reason ? [{ name: "Reason", value: reason.slice(0, 1024), inline: false }] : []),
            { name: "Reply needed", value: replyRequired ? "Yes" : "No", inline: true }
          )
          .setFooter({ text: footer })
          .setTimestamp()
      ],
      allowedMentions: { parse: [] }
    }).then(() => true).catch((error) => {
      logError(`Could not send /dm to ${user.id}`, error);
      return false;
    })
    : await sendPlainDm(user, content);

  await recordModerationAction({
    guildId: interaction.guildId,
    action: "staff_dm",
    targetUserId: user.id,
    moderatorId: interaction.user.id,
    reason: reason || "No reason provided",
    metadata: {
      sent,
      anonymous,
      embed: asEmbed,
      replyRequired,
      contentLogged: settings.dmCommandLogContent,
      contentPreview: settings.dmCommandLogContent ? message.slice(0, 500) : undefined
    }
  });

  await logDmAction(interaction.guild, {
    title: sent ? "Staff DM Sent" : "Staff DM Failed",
    description: sent
      ? "A staff member sent a one-user DM through Bot Dashboard."
      : "Bot Dashboard could not send the staff DM. The user may have DMs closed.",
    targetUserId: user.id,
    executorId: interaction.user.id,
    status: sent ? "sent" : "failed",
    reason: reason || undefined,
    contentPreview: settings.dmCommandLogContent ? message : undefined
  }).catch(() => undefined);

  await replyToCommand(interaction, sent
    ? `DM sent to ${user}.`
    : `I could not DM ${user}. They may have DMs closed or may not accept DMs from this server.`);
}

export async function sendModerationDm(input: {
  guild: Guild;
  user: User;
  action: string;
  reason: string;
  caseNumber?: number | null;
  durationSeconds?: number | null;
  moderatorTag?: string;
  moderationCase?: ModerationCase;
}): Promise<boolean> {
  const settings = await getDmSettings(input.guild.id);
  if (!moderationDmEnabled(settings, input.action)) return false;

  const duration = input.durationSeconds
    ? `Duration: ${Math.round(input.durationSeconds / 60)} minute(s).`
    : "";
  const content = replaceCommonVariables(settings.moderationDmTemplate, {
    server: input.guild.name,
    serverName: input.guild.name,
    action: actionTitle(input.action) || input.action,
    reason: input.reason || "No reason provided",
    case: input.caseNumber ? `#${input.caseNumber}` : "N/A",
    duration,
    moderator: input.moderatorTag || "Server Staff",
    appeal: settings.moderationAppealMessage
  });
  const appeal = settings.moderationAppealMessage.trim()
    ? `\n\n${settings.moderationAppealMessage.trim()}`
    : "";
  const sent = await sendPlainDm(input.user, `${content}${appeal}`);
  await logDmAction(input.guild, {
    title: sent ? "Moderation DM Sent" : "Moderation DM Failed",
    description: sent
      ? "A moderation notice was sent by DM."
      : "The moderation notice could not be sent. The user may have DMs closed.",
    targetUserId: input.user.id,
    executorId: input.guild.members.me?.id ?? "system",
    status: sent ? "sent" : "failed",
    reason: input.reason
  }).catch(() => undefined);
  return sent;
}

export async function sendGiveawayWinnerDm(input: {
  guild: Guild;
  giveaway: Giveaway;
  user: User;
}): Promise<boolean> {
  const settings = await getDmSettings(input.guild.id);
  if (!settings.giveawayWinnerDmEnabled) return false;
  const template = input.giveaway.winnerDmMessage.trim() || settings.giveawayDefaultWinnerDmMessage;
  const content = replaceCommonVariables(template, {
    user: `<@${input.user.id}>`,
    user_id: input.user.id,
    server: input.guild.name,
    serverName: input.guild.name,
    prize: input.giveaway.prize,
    giveaway_id: String(input.giveaway.id)
  });
  const sent = await sendPlainDm(input.user, content);
  await logDmAction(input.guild, {
    title: sent ? "Giveaway Winner DM Sent" : "Giveaway Winner DM Failed",
    description: sent
      ? "A giveaway winner received a DM."
      : "A giveaway winner could not be DMed. The user may have DMs closed.",
    targetUserId: input.user.id,
    executorId: input.guild.members.me?.id ?? "system",
    status: sent ? "sent" : "failed",
    reason: `Giveaway #${input.giveaway.id}: ${input.giveaway.prize}`
  }).catch(() => undefined);
  return sent;
}
