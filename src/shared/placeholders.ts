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
  server_name?: string;
  server_id?: string;
  server_member_count?: string;
  server_created_at?: string;
  server_icon?: string;
  channel_name?: string;
  channel_id?: string;
  user_name?: string;
  user_id?: string;
  user_avatar?: string;
  ticket_id?: string;
  ticket_category?: string;
  created_at?: string;
  closed_at?: string;
  boostCount?: string;
  tier?: string;
}

export function replacePlaceholders(value: string, variables: PlaceholderValues): string {
  return value.replace(/\{([a-zA-Z_]+)\}/g, (match, key: string) => {
    if (!(key in variables)) return match;
    return variables[key as keyof PlaceholderValues] ?? "";
  });
}
