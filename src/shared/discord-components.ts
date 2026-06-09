export interface DiscordComponentEmoji {
  id?: string;
  name: string;
  animated?: boolean;
}

const customEmojiPattern = /^<(a?):([a-zA-Z0-9_]{2,32}):(\d{17,20})>$/;
const unicodeEmojiPattern = /[\p{Extended_Pictographic}\p{Regional_Indicator}\u20E3\uFE0F]/u;

export function parseDiscordComponentEmoji(value: string): DiscordComponentEmoji | undefined {
  const emoji = value.trim();
  if (!emoji) return undefined;

  const custom = customEmojiPattern.exec(emoji);
  if (custom) {
    return {
      animated: custom[1] === "a",
      name: custom[2]!,
      id: custom[3]!
    };
  }

  if (emoji.includes("<") || emoji.includes(">") || !unicodeEmojiPattern.test(emoji)) {
    throw new Error("Use one Unicode emoji or a Discord custom emoji such as <:help:123456789012345678>.");
  }

  return { name: emoji };
}
