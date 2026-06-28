import { REST, Routes } from "discord.js";
import { getRuntimeAppConfig } from "../database/index.js";
import { assertUniqueCommandNames, commandData } from "./commands.js";

const config = await getRuntimeAppConfig();
if (!config.discordToken || !config.discordClientId) {
  throw new Error("Bot Dashboard setup is incomplete. Save the Discord bot token and client ID in the dashboard setup flow before deploying commands.");
}
const rest = new REST({ version: "10" }).setToken(config.discordToken);
assertUniqueCommandNames();

const guilds = await rest.get(Routes.userGuilds()) as Array<{ id: string }>;
if (!guilds.length) {
  throw new Error("Bot Dashboard is not installed in any Discord servers.");
}

console.log(`Deploying ${commandData.length} slash commands to ${guilds.length} server(s)...`);
await Promise.all(guilds.map((guild) =>
  rest.put(
    Routes.applicationGuildCommands(config.discordClientId, guild.id),
    { body: commandData }
  )
));

const verification = await Promise.all(guilds.map(async (guild) => {
  const registered = await rest.get(
    Routes.applicationGuildCommands(config.discordClientId, guild.id)
  ) as Array<{ name: string; options?: Array<{ name: string }> }>;
  const server = registered.filter((command) => command.name === "server");
  const legacy = registered.filter((command) => command.name === "server-info");
  const hasInfo = server.length === 1
    && server[0]?.options?.some((option) => option.name === "info");
  return {
    commandCount: registered.length,
    hasInfo,
    legacyCount: legacy.length
  };
}));

const failed = verification.filter((result) => !result.hasInfo || result.legacyCount !== 0);
if (failed.length > 0) {
  throw new Error(
    "Discord command verification failed: expected one /server info command and no /server-info legacy alias."
  );
}
console.log(
  `Slash commands deployed and verified in ${guilds.length} server(s): `
  + `${verification[0]?.commandCount ?? commandData.length} commands, /server info active, legacy alias removed.`
);
