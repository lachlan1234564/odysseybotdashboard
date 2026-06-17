import {
  ChatInputCommandInteraction,
  InteractionReplyOptions,
  MessageFlags
} from "discord.js";

function replyPayload(
  options: string | InteractionReplyOptions
): InteractionReplyOptions {
  return typeof options === "string" ? { content: options } : options;
}

export function withEphemeralFlag(
  options: string | InteractionReplyOptions
): InteractionReplyOptions {
  return {
    ...replyPayload(options),
    flags: MessageFlags.Ephemeral
  };
}

export async function deferCommandReply(
  interaction: ChatInputCommandInteraction,
  ephemeral = true
): Promise<void> {
  if (interaction.deferred || interaction.replied) return;
  await interaction.deferReply({
    flags: ephemeral ? MessageFlags.Ephemeral : undefined
  });
}

export async function replyToCommand(
  interaction: ChatInputCommandInteraction,
  options: string | InteractionReplyOptions
): Promise<void> {
  const payload = replyPayload(options);
  if (interaction.deferred) {
    const { flags: _flags, ...editable } = payload;
    await interaction.editReply(editable);
    return;
  }
  if (interaction.replied) {
    await interaction.followUp(payload);
    return;
  }
  await interaction.reply(payload);
}

export async function replyEphemeral(
  interaction: ChatInputCommandInteraction,
  options: string | InteractionReplyOptions
): Promise<void> {
  await replyToCommand(interaction, withEphemeralFlag(options));
}
