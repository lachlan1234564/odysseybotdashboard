import {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder
} from "discord.js";

export const commandBuilders = [
  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check whether Rapid Bot is online."),
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
    .setDescription("Request to close the current ticket. Only works inside ticket channels.")
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Why do you want to close this ticket?")
        .setMaxLength(500)
    ),
  new SlashCommandBuilder()
    .setName("ticket-panel")
    .setDescription("Post the configured ticket panel.")
    .addStringOption((option) =>
      option
        .setName("panel")
        .setDescription("Saved ticket panel")
        .setAutocomplete(true)
    )
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("Channel to post in (defaults to this channel)")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    ),
  new SlashCommandBuilder()
    .setName("announce")
    .setDescription("Preview a saved announcement template.")
    .addStringOption((option) =>
      option
        .setName("template")
        .setDescription("Saved template name")
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("Override the template target channel")
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
