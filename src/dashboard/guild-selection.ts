export interface ManageableGuild {
  id: string;
  name: string;
  icon?: string | null;
}

export interface GuildSelectionState {
  selectedGuildId: string | null;
  autoSelected: boolean;
  selectionRequired: boolean;
}

export function resolveGuildSelection(
  guilds: ManageableGuild[],
  selectedGuildId?: string
): GuildSelectionState {
  const selectedIsValid = Boolean(
    selectedGuildId && guilds.some((guild) => guild.id === selectedGuildId)
  );
  if (selectedIsValid) {
    return {
      selectedGuildId: selectedGuildId!,
      autoSelected: false,
      selectionRequired: false
    };
  }
  if (guilds.length === 1) {
    return {
      selectedGuildId: guilds[0]!.id,
      autoSelected: true,
      selectionRequired: false
    };
  }
  return {
    selectedGuildId: null,
    autoSelected: false,
    selectionRequired: guilds.length > 1
  };
}
