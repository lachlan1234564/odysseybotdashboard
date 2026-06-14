const discordInvitePattern =
  /(?:https?:\/\/)?(?:www\.)?(?:discord\.gg|discord(?:app)?\.com\/invite)\/[a-z0-9-]+(?:[/?#][^\s<]*)?/i;

export function containsDiscordInvite(value: string): boolean {
  return discordInvitePattern.test(value);
}
