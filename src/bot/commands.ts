import {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder
} from "discord.js";

export const slashCommandNames = [
  "ping",
  "help",
  "server",
  "user-info",
  "automod-status",
  "socials-post",
  "custom",
  "close-request",
  "ticket-panel",
  "announce",
  "reaction-roles",
  "giveaway",
  "poll",
  "verification",
  "dm",
  "warn",
  "warnings",
  "timeout",
  "untimeout",
  "kick",
  "ban",
  "unban",
  "clear",
  "case",
  "lockdown",
  "unlockdown",
  "bot-status"
] as const;

export type SlashCommandName = typeof slashCommandNames[number];

export const commandBuilders = [
  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Quickly check that CorePanel is online and responding."),
  new SlashCommandBuilder()
    .setName("help")
    .setDescription("List every CorePanel command, its purpose, and who can use it."),
  new SlashCommandBuilder()
    .setName("server")
    .setDescription("Server information and administration.")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("info")
        .setDescription("View server stats and bot setup status.")
    ),
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
    .setName("giveaway")
    .setDescription("Create, end, reroll, or cancel giveaways.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("start")
        .setDescription("Start a giveaway in a selected channel.")
        .addStringOption((option) => option.setName("prize").setDescription("Prize").setRequired(true).setMaxLength(200))
        .addIntegerOption((option) => option.setName("minutes").setDescription("How long the giveaway should run").setRequired(true).setMinValue(1).setMaxValue(10080))
        .addIntegerOption((option) => option.setName("winners").setDescription("Number of winners").setMinValue(1).setMaxValue(20))
        .addStringOption((option) => option.setName("description").setDescription("Extra giveaway details").setMaxLength(1000))
        .addRoleOption((option) => option.setName("required_role").setDescription("Optional required role to enter"))
        .addIntegerOption((option) => option.setName("booster_bonus_entries").setDescription("Extra entries for server boosters").setMinValue(0).setMaxValue(20))
        .addRoleOption((option) => option.setName("bonus_role").setDescription("Optional role that receives bonus entries"))
        .addIntegerOption((option) => option.setName("bonus_role_entries").setDescription("Extra entries for the bonus role").setMinValue(0).setMaxValue(20))
        .addUserOption((option) => option.setName("host").setDescription("Optional giveaway host shown on the embed"))
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Channel to post in")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("end")
        .setDescription("End an active giveaway early.")
        .addIntegerOption((option) => option.setName("id").setDescription("Giveaway ID").setRequired(true).setMinValue(1))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("reroll")
        .setDescription("Pick new winner(s) for a giveaway.")
        .addIntegerOption((option) => option.setName("id").setDescription("Giveaway ID").setRequired(true).setMinValue(1))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("cancel")
        .setDescription("Cancel a giveaway without picking winners.")
        .addIntegerOption((option) => option.setName("id").setDescription("Giveaway ID").setRequired(true).setMinValue(1))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("list")
        .setDescription("List recent giveaways for this server.")
    ),
  new SlashCommandBuilder()
    .setName("poll")
    .setDescription("Create, end, cancel, list, or view results for polls.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("create")
        .setDescription("Publish a restart-safe poll in a selected channel.")
        .addStringOption((option) => option.setName("question").setDescription("Poll question").setRequired(true).setMaxLength(256))
        .addStringOption((option) => option.setName("option1").setDescription("First option").setRequired(true).setMaxLength(100))
        .addStringOption((option) => option.setName("option2").setDescription("Second option").setRequired(true).setMaxLength(100))
        .addStringOption((option) => option.setName("option_3").setDescription("Third option").setMaxLength(100))
        .addStringOption((option) => option.setName("option_4").setDescription("Fourth option").setMaxLength(100))
        .addStringOption((option) => option.setName("option_5").setDescription("Fifth option").setMaxLength(100))
        .addStringOption((option) => option.setName("option_6").setDescription("Sixth option").setMaxLength(100))
        .addStringOption((option) => option.setName("option_7").setDescription("Seventh option").setMaxLength(100))
        .addStringOption((option) => option.setName("option_8").setDescription("Eighth option").setMaxLength(100))
        .addStringOption((option) => option.setName("option_9").setDescription("Ninth option").setMaxLength(100))
        .addStringOption((option) => option.setName("option_10").setDescription("Tenth option").setMaxLength(100))
        .addIntegerOption((option) => option.setName("minutes").setDescription("Optional poll length in minutes").setMinValue(1).setMaxValue(10080))
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Channel to post in")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        )
        .addRoleOption((option) => option.setName("required_role").setDescription("Optional required role to vote"))
        .addBooleanOption((option) => option.setName("anonymous").setDescription("Hide voter names from dashboard/API results"))
        .addBooleanOption((option) => option.setName("multiple_choice").setDescription("Allow voters to select more than one option"))
        .addBooleanOption((option) => option.setName("show_results").setDescription("Update live result counts on the poll message"))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("end")
        .setDescription("End an active poll early.")
        .addIntegerOption((option) => option.setName("id").setDescription("Poll ID").setRequired(true).setMinValue(1))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("cancel")
        .setDescription("Cancel a draft, scheduled, or active poll.")
        .addIntegerOption((option) => option.setName("id").setDescription("Poll ID").setRequired(true).setMinValue(1))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("results")
        .setDescription("View poll results.")
        .addIntegerOption((option) => option.setName("id").setDescription("Poll ID").setRequired(true).setMinValue(1))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("list")
        .setDescription("List recent polls for this server.")
    ),
  new SlashCommandBuilder()
    .setName("verification")
    .setDescription("Configure or inspect the server verification gate.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("setup")
        .setDescription("Create or update the verification channel, embed, and permissions.")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("status")
        .setDescription("Show the saved verification gate status for this server.")
    ),
  new SlashCommandBuilder()
    .setName("dm")
    .setDescription("Send one safe staff DM to a server member.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption((option) =>
      option.setName("user").setDescription("User to DM").setRequired(true)
    )
    .addStringOption((option) =>
      option.setName("message").setDescription("Message to send").setRequired(true).setMaxLength(1800)
    )
    .addStringOption((option) =>
      option.setName("reason").setDescription("Internal reason for the DM").setMaxLength(500)
    )
    .addBooleanOption((option) =>
      option.setName("anonymous").setDescription("Show the sender as Server Staff instead of your username")
    )
    .addBooleanOption((option) =>
      option.setName("embed").setDescription("Send the DM as a clean embed")
    )
    .addBooleanOption((option) =>
      option.setName("reply_required").setDescription("Tell the user staff requested a reply")
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
    .setName("untimeout")
    .setDescription("Remove timeout from a server member.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) => option.setName("member").setDescription("Member to remove timeout from").setRequired(true))
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
    .setName("unban")
    .setDescription("Unban a user by Discord user ID.")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addStringOption((option) =>
      option.setName("user_id").setDescription("Discord user ID to unban").setRequired(true).setMinLength(17).setMaxLength(20)
    )
    .addStringOption((option) => option.setName("reason").setDescription("Reason").setMaxLength(1000)),
  new SlashCommandBuilder()
    .setName("clear")
    .setDescription("Bulk-delete recent messages.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption((option) =>
      option.setName("amount").setDescription("Messages to delete").setRequired(true).setMinValue(1).setMaxValue(100)
    ),
  new SlashCommandBuilder()
    .setName("case")
    .setDescription("View, search, create, and update moderation cases.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("view")
        .setDescription("View one moderation case.")
        .addIntegerOption((option) => option.setName("number").setDescription("Case number").setRequired(true).setMinValue(1))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("search")
        .setDescription("Search recent moderation cases.")
        .addIntegerOption((option) => option.setName("number").setDescription("Exact case number").setMinValue(1))
        .addStringOption((option) => option.setName("query").setDescription("Search user IDs, usernames, reasons, or notes").setMaxLength(100))
        .addUserOption((option) => option.setName("member").setDescription("Filter by member"))
        .addUserOption((option) => option.setName("moderator").setDescription("Filter by moderator"))
        .addStringOption((option) => option.setName("action").setDescription("Filter by action type"))
        .addStringOption((option) =>
          option
            .setName("status")
            .setDescription("Filter by case status")
            .addChoices(
              { name: "Active", value: "active" },
              { name: "Expired", value: "expired" },
              { name: "Reversed", value: "reversed" },
              { name: "Deleted", value: "deleted" },
              { name: "Resolved", value: "resolved" }
            )
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("create")
        .setDescription("Create a manual moderation case.")
        .addUserOption((option) => option.setName("member").setDescription("Member for this case").setRequired(true))
        .addStringOption((option) => option.setName("action").setDescription("Action type, such as manual or message_delete").setRequired(true).setMaxLength(40))
        .addStringOption((option) => option.setName("reason").setDescription("Reason").setMaxLength(1000))
        .addIntegerOption((option) => option.setName("duration_minutes").setDescription("Optional duration in minutes").setMinValue(1).setMaxValue(40320))
        .addStringOption((option) => option.setName("evidence").setDescription("Optional evidence or message link").setMaxLength(500))
        .addStringOption((option) =>
          option
            .setName("status")
            .setDescription("Initial case status")
            .addChoices(
              { name: "Active", value: "active" },
              { name: "Expired", value: "expired" },
              { name: "Reversed", value: "reversed" },
              { name: "Deleted", value: "deleted" },
              { name: "Resolved", value: "resolved" }
            )
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("edit")
        .setDescription("Edit a case reason or status.")
        .addIntegerOption((option) => option.setName("number").setDescription("Case number").setRequired(true).setMinValue(1))
        .addStringOption((option) => option.setName("reason").setDescription("New reason").setMaxLength(1000))
        .addStringOption((option) =>
          option
            .setName("status")
            .setDescription("New case status")
            .addChoices(
              { name: "Active", value: "active" },
              { name: "Expired", value: "expired" },
              { name: "Reversed", value: "reversed" },
              { name: "Deleted", value: "deleted" },
              { name: "Resolved", value: "resolved" }
            )
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("note")
        .setDescription("Add or replace a staff note on a case.")
        .addIntegerOption((option) => option.setName("number").setDescription("Case number").setRequired(true).setMinValue(1))
        .addStringOption((option) => option.setName("note").setDescription("Staff note").setRequired(true).setMaxLength(1000))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("resolve")
        .setDescription("Mark a moderation case resolved.")
        .addIntegerOption((option) => option.setName("number").setDescription("Case number").setRequired(true).setMinValue(1))
        .addStringOption((option) => option.setName("note").setDescription("Optional resolution note").setMaxLength(1000))
    ),
  new SlashCommandBuilder()
    .setName("lockdown")
    .setDescription("Lock all text channels — prevents @everyone from sending messages.")
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("Lock only this channel instead of all channels")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    ),
  new SlashCommandBuilder()
    .setName("unlockdown")
    .setDescription("Unlock channels after a lockdown — restores @everyone send permissions.")
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("Unlock only this channel instead of all channels")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    ),
  new SlashCommandBuilder()
    .setName("bot-status")
    .setDescription("View bot uptime, latency, memory usage, and server count.")
] as const;

export const commandData = commandBuilders.map((command) => command.toJSON());

export function assertUniqueCommandNames(
  commands: ReadonlyArray<{ name: string }> = commandData
): void {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const command of commands) {
    if (seen.has(command.name)) duplicates.add(command.name);
    seen.add(command.name);
  }
  if (duplicates.size > 0) {
    throw new Error(`Duplicate top-level slash commands: ${[...duplicates].join(", ")}`);
  }
}
