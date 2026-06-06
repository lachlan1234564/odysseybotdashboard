import {
  EmbedBuilder,
  GatewayIntentBits,
  Guild,
  GuildMember,
  PermissionFlagsBits,
  TextChannel
} from "discord.js";
import { getAntiRaidSettings, recordModerationAction } from "../database/index.js";
import { asColor, sendGuildLog } from "./utils.js";

interface JoinEvent {
  userId: string;
  timestamp: number;
  hasAvatar: boolean;
  accountAgeDays: number;
}

const joinHistory = new Map<string, JoinEvent[]>();
const lockdowns = new Map<string, { endsAt: number }>();

function getGuildJoins(guildId: string): JoinEvent[] {
  if (!joinHistory.has(guildId)) joinHistory.set(guildId, []);
  return joinHistory.get(guildId)!;
}

function pruneJoins(guildId: string, windowMs: number): void {
  const now = Date.now();
  const events = getGuildJoins(guildId);
  const cutoff = now - windowMs;
  while (events.length && events[0]!.timestamp < cutoff) events.shift();
}

export function isRaidLockdownActive(guildId: string): boolean {
  const lock = lockdowns.get(guildId);
  if (!lock) return false;
  if (lock.endsAt <= Date.now()) {
    lockdowns.delete(guildId);
    return false;
  }
  return true;
}

async function sendAlert(guild: Guild, channelId: string | null, embed: EmbedBuilder): Promise<void> {
  if (!channelId) return;
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (channel && channel.isTextBased() && !channel.isDMBased() && "send" in channel) {
    await (channel as TextChannel).send({ embeds: [embed] }).catch(() => undefined);
  }
}

async function sendLog(guild: Guild, channelId: string | null, title: string, description: string, color = "#ED4245"): Promise<void> {
  if (!channelId) return;
  const embed = new EmbedBuilder().setColor(asColor(color)).setTitle(title).setDescription(description).setTimestamp();
  await sendGuildLog(guild.id, channelId, (id) => guild.channels.fetch(id), embed);
}

export async function handleGuildMemberAdd(member: GuildMember): Promise<void> {
  if (member.user.bot) return;
  const guild = member.guild;
  const settings = await getAntiRaidSettings(guild.id);
  if (!settings.enabled) return;

  if (settings.bypassUserIds.includes(member.id)) return;
  if (member.roles.cache.some((r) => settings.bypassRoleIds.includes(r.id))) return;

  const accountAgeDays = (Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24);
  if (settings.minAccountAgeDays > 0 && accountAgeDays < settings.minAccountAgeDays) {
    await handleSuspiciousJoin(member, settings, `Account is ${Math.floor(accountAgeDays)} days old (minimum ${settings.minAccountAgeDays})`);
    return;
  }

  const hasAvatar = Boolean(member.user.avatar);
  if (settings.blockNoAvatar && !hasAvatar) {
    await handleSuspiciousJoin(member, settings, "No avatar detected");
    return;
  }

  const events = getGuildJoins(guild.id);
  events.push({ userId: member.id, timestamp: Date.now(), hasAvatar, accountAgeDays });
  pruneJoins(guild.id, settings.timeWindowSeconds * 1000);

  if (events.length >= settings.joinThreshold) {
    await triggerRaidResponse(guild, settings, events);
  }
}

async function handleSuspiciousJoin(member: GuildMember, settings: ReturnType<typeof getAntiRaidSettings> extends Promise<infer T> ? T : never, reason: string): Promise<void> {
  const guild = member.guild;
  const action = settings.action;

  if (action === "kick_suspicious") {
    if (member.kickable) {
      await member.kick(`Anti-raid: ${reason}`).catch(() => undefined);
    }
  } else if (action === "timeout_new") {
    if (member.moderatable) {
      await member.timeout(60 * 60_000, `Anti-raid: ${reason}`).catch(() => undefined);
    }
  }

  await sendLog(
    guild,
    settings.logChannelId,
    "Anti-raid: Suspicious join",
    `<@${member.id}> \`${member.id}\` joined. ${reason}. Action: ${action}.`
  );

  if (action === "alert" || action === "disable_invites" || action === "lockdown") {
    await sendAlert(
      guild,
      settings.alertChannelId ?? settings.logChannelId,
      new EmbedBuilder()
        .setColor(asColor("#ED4245"))
        .setTitle("Anti-raid: Suspicious join detected")
        .setDescription(`<@${member.id}> — ${reason}`)
        .setTimestamp()
    );
  }
}

async function triggerRaidResponse(guild: Guild, settings: ReturnType<typeof getAntiRaidSettings> extends Promise<infer T> ? T : never, events: JoinEvent[]): Promise<void> {
  if (isRaidLockdownActive(guild.id)) return;

  const action = settings.action;
  const embed = new EmbedBuilder()
    .setColor(asColor("#ED4245"))
    .setTitle("Anti-raid triggered")
    .setDescription(`${events.length} joins in ${settings.timeWindowSeconds}s. Action: ${action}.`)
    .setTimestamp();

  await sendAlert(guild, settings.alertChannelId ?? settings.logChannelId, embed);

  if (action === "lockdown") {
    lockdowns.set(guild.id, { endsAt: Date.now() + settings.lockdownDurationSeconds * 1000 });
    for (const channel of guild.channels.cache.values()) {
      if (channel.isTextBased() && !channel.isDMBased() && "permissionOverwrites" in channel) {
        const me = guild.members.me;
        if (!me) continue;
        const botPerms = channel.permissionsFor(me);
        if (botPerms?.has(PermissionFlagsBits.ManageChannels)) {
          await channel.permissionOverwrites.edit(guild.roles.everyone.id, { SendMessages: false }).catch(() => undefined);
        }
      }
    }
    setTimeout(async () => {
      lockdowns.delete(guild.id);
      for (const channel of guild.channels.cache.values()) {
        if (channel.isTextBased() && !channel.isDMBased() && "permissionOverwrites" in channel) {
          const me = guild.members.me;
          if (!me) continue;
          const botPerms = channel.permissionsFor(me);
          if (botPerms?.has(PermissionFlagsBits.ManageChannels)) {
            await channel.permissionOverwrites.edit(guild.roles.everyone.id, { SendMessages: true }).catch(() => undefined);
          }
        }
      }
      await sendAlert(guild, settings.alertChannelId ?? settings.logChannelId, new EmbedBuilder()
        .setColor(asColor("#5865F2")).setTitle("Anti-raid lockdown ended").setDescription("Channels have been restored.").setTimestamp());
    }, settings.lockdownDurationSeconds * 1000);
  }

  if (action === "disable_invites") {
    if (guild.members.me?.permissions.has(PermissionFlagsBits.ManageGuild)) {
      await guild.disableInvites(true).catch(() => undefined);
      setTimeout(() => guild.disableInvites(false).catch(() => undefined), settings.lockdownDurationSeconds * 1000);
    }
  }

  await recordModerationAction({
    guildId: guild.id,
    action: "anti_raid_triggered",
    moderatorId: guild.members.me?.id ?? "system",
    reason: `${events.length} joins in ${settings.timeWindowSeconds}s`,
    metadata: { action: settings.action, joinCount: events.length }
  });

  await sendLog(
    guild,
    settings.logChannelId,
    "Anti-raid: Triggered",
    `${events.length} joins detected. Action taken: ${action}. Triggering members: ${events.slice(0, 5).map((e) => `<@${e.userId}> \`${e.userId}\``).join(", ")}`,
    "#ED4245"
  );
}
