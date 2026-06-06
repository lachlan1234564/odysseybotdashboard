export interface PlaceholderValues {
  user: string;
  username: string;
  server: string;
  channel: string;
  text: string;
  reason: string;
  target: string;
  memberCount?: string;
  createdAt?: string;
}

export function replacePlaceholders(value: string, variables: PlaceholderValues): string {
  return value.replace(/\{(user|username|server|channel|text|reason|target|memberCount|createdAt)\}/g, (_, key: keyof PlaceholderValues) => {
    return variables[key] ?? "";
  });
}
