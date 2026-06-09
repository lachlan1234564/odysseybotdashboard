const sensitiveKeys = [
  "DISCORD_TOKEN",
  "DASHBOARD_PASSWORD",
  "DATABASE_URL"
] as const;

function redactSensitiveText(value: string): string {
  let message = value;
  for (const key of sensitiveKeys) {
    const secret = process.env[key];
    if (secret) message = message.replaceAll(secret, `[${key.toLowerCase()}]`);
  }
  return message
    .replace(/\b\d{17,20}\b/g, "[discord-id]")
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[ip-address]")
    .replace(/::1/g, "[ip-address]")
    .replace(/(?<![a-f0-9])(?:[a-f0-9]{1,4}:){3,}[a-f0-9:]{1,}(?![a-f0-9])/gi, "[ip-address]")
    .replace(/[A-Za-z\d_-]{20,}\.[A-Za-z\d_-]{6,}\.[A-Za-z\d_-]{20,}/g, "[discord-token]");
}

export function safeErrorSummary(error: unknown): string {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : "Unknown error";
  return redactSensitiveText(message).slice(0, 500);
}

export function safeErrorStack(error: unknown): string {
  if (!(error instanceof Error)) return safeErrorSummary(error);
  return redactSensitiveText(error.stack ?? `${error.name}: ${error.message}`).slice(0, 6000);
}

export function logError(context: string, error: unknown): void {
  console.error(`${context.replace(/[\r\n\t]+/g, " ").slice(0, 200)}: ${safeErrorSummary(error)}`);
}

export function logErrorStack(context: string, error: unknown): void {
  const safeContext = context.replace(/[\r\n\t]+/g, " ").slice(0, 200);
  console.error(`${safeContext}\n${safeErrorStack(error)}`);
}

function errorField(error: unknown, key: string): string | number | undefined {
  if (!error || typeof error !== "object" || !(key in error)) return undefined;
  const value = (error as Record<string, unknown>)[key];
  return typeof value === "string" || typeof value === "number" ? value : undefined;
}

export function discordErrorDetails(error: unknown): string {
  const details = [
    errorField(error, "code") !== undefined ? `code=${errorField(error, "code")}` : "",
    errorField(error, "status") !== undefined ? `status=${errorField(error, "status")}` : "",
    errorField(error, "method") ? `method=${errorField(error, "method")}` : ""
  ].filter(Boolean);
  return details.length ? details.join(" ") : "no Discord error metadata";
}

export function logDiscordError(context: string, error: unknown): void {
  const safeContext = context.replace(/[\r\n\t]+/g, " ").slice(0, 200);
  console.error(`${safeContext}: ${discordErrorDetails(error)} ${safeErrorSummary(error)}`);
}

export function friendlyDiscordError(error: unknown, action: string): string {
  const prefix = action.trim().replace(/[.!?]+$/, "");
  const code = errorField(error, "code");
  if (code === 50001) {
    return `${prefix}: Discord reports that Odyssey Bot is missing access to that channel.`;
  }
  if (code === 50013) {
    return `${prefix}: Odyssey Bot is missing one or more required channel permissions. Check View Channel, Send Messages, Embed Links, and Attach Files.`;
  }
  if (code === 10003) {
    return `${prefix}: that Discord channel no longer exists. Refresh the dashboard and choose another channel.`;
  }
  if (code === 50035) {
    return `${prefix}: Discord rejected the panel content or components as invalid. Check titles, descriptions, emoji, images, and menu options.`;
  }
  return `${prefix}: Discord did not accept the request. Check the bot log for the API error code and message.`;
}
