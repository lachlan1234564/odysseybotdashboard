import { REST, Routes } from "discord.js";
import { loadDiscordConfig } from "../shared/config.js";
import { commandData } from "./commands.js";

const config = loadDiscordConfig();
const rest = new REST({ version: "10" }).setToken(config.DISCORD_TOKEN);

console.log(`Deploying ${commandData.length} guild slash commands...`);
await rest.put(
  Routes.applicationGuildCommands(config.DISCORD_CLIENT_ID, config.DISCORD_GUILD_ID),
  { body: commandData }
);
console.log(`Slash commands deployed to guild ${config.DISCORD_GUILD_ID}.`);
