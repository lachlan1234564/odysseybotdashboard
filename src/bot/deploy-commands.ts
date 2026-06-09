import { REST, Routes } from "discord.js";
import { loadDiscordConfig } from "../shared/config.js";
import { commandData } from "./commands.js";

const config = loadDiscordConfig();
const rest = new REST({ version: "10" }).setToken(config.DISCORD_TOKEN);

const guilds = await rest.get(Routes.userGuilds()) as Array<{ id: string }>;
if (!guilds.length) {
  throw new Error("Odyssey Bot is not installed in any Discord servers.");
}

console.log(`Deploying ${commandData.length} slash commands to ${guilds.length} server(s)...`);
await Promise.all(guilds.map((guild) =>
  rest.put(
    Routes.applicationGuildCommands(config.DISCORD_CLIENT_ID, guild.id),
    { body: commandData }
  )
));
console.log(`Slash commands deployed to ${guilds.length} server(s).`);
