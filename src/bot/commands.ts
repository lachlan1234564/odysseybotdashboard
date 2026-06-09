import {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder
} from "discord.js";

export const commandBuilders = [
  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Quickly check that Odyssey Bot is online and responding."),
  new SlashCommandBuilder()
    .setName("help")
    .setDescription("List every Odyssey Bot command, its purpose, and who can use it."),
  new SlashCommandBuilder()
    .setName("bot-help")
    .setDescription("Show all available commands grouped by category."),
  new SlashCommandBuilder()
    .setName("server-info")
    .setDescription("View server stats and bot setup status."),
  new SlashCommandBuilder()
    .setName("user-info")
    .setDescription("View a user's account age, join date, roles, and warning count.")
    .addUserOption((option) =>
      option.setName("member").setDescription("Member to inspect").setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("automod-status")
    .setDescription("View current Auto Mod rules and channel-specific link settings."),
  new SlashCommandBuilder()
    .setName("socials-post")
    .setDescription("Publish the configured social promotion embed to a channel.")
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("Channel to post in (defaults to the saved target or current channel)")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    ),
  new SlashCommandBuilder()
    .setName("custom")
    .setDescription("Run a dashboard-created custom command.")
    .addStringOption((option) =>
      option
        .setName("name")
        .setDescription("Custom command name")
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption((option) =>
      option.setName("text").setDescription("Optional text for the {text} placeholder").setMaxLength(1000)
    )
    .addStringOption((option) =>
      option.setName("reason").setDescription("Optional reason for the {reason} placeholder").setMaxLength(1000)
    )
    .addUserOption((option) =>
      option.setName("target").setDescription("Optional member for the {target} placeholder")
    ),
  new SlashCommandBuilder()
    .setName("close-request")
    .setDescription("Staff: ask the ticket opener or community to approve closing this ticket.")
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Why staff believe this ticket is ready to close")
        .setMaxLength(500)
    ),
  new SlashCommandBuilder()
    .setName("ticket-panel")
    .setDescription("Post a saved ticket panel so members can open support tickets.")
    .addStringOption((option) =>
      option
        .setName("panel")
        .setDescription("Which saved ticket panel to post")
        .setAutocomplete(true)
    )
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("Channel to send the panel to (defaults to this channel)")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    ),
  new SlashCommandBuilder()
    .setName("announce")
    .setDescription("Preview a saved announcement template, then confirm to publish it.")
    .addStringOption((option) =>
      option
        .setName("template")
        .setDescription("Which saved announcement template to use")
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("Send to a different channel instead of the saved target")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    ),
  new SlashCommandBuilder()
    .setName("reaction-roles")
    .setDescription("Post a saved self-service role panel with clickable role buttons.")
    .addStringOption((option) =>
      option
        .setName("panel")
        .setDescription("Which saved role panel to post")
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("Channel to post in (uses the panel's saved channel by default)")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    ),
  new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Warn a server member.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) => option.setName("member").setDescription("Member to warn").setRequired(true))
    .addStringOption((option) => option.setName("reason").setDescription("Reason").setRequired(true).setMaxLength(1000)),
  new SlashCommandBuilder()
    .setName("warnings")
    .setDescription("View warnings for a server member.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) => option.setName("member").setDescription("Member to inspect").setRequired(true)),
  new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Temporarily time out a server member.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) => option.setName("member").setDescription("Member to time out").setRequired(true))
    .addIntegerOption((option) =>
      option.setName("minutes").setDescription("Timeout length in minutes").setRequired(true).setMinValue(1).setMaxValue(40320)
    )
    .addStringOption((option) => option.setName("reason").setDescription("Reason").setMaxLength(1000)),
  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Kick a server member.")
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption((option) => option.setName("member").setDescription("Member to kick").setRequired(true))
    .addStringOption((option) => option.setName("reason").setDescription("Reason").setMaxLength(1000)),
  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban a server member.")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption((option) => option.setName("member").setDescription("Member to ban").setRequired(true))
    .addIntegerOption((option) =>
      option.setName("delete_days").setDescription("Days of messages to delete").setMinValue(0).setMaxValue(7)
    )
    .addStringOption((option) => option.setName("reason").setDescription("Reason").setMaxLength(1000)),
  new SlashCommandBuilder()
    .setName("clear")
    .setDescription("Bulk-delete recent messages.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption((option) =>
      option.setName("amount").setDescription("Messages to delete").setRequired(true).setMinValue(1).setMaxValue(100)
    )
] as const;

export const commandData = commandBuilders.map((command) => command.toJSON());
