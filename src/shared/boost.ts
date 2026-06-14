export interface BoostTemplateValues {
  user: string;
  server: string;
  boostCount: string | number;
  tier: string;
}

export function renderBoostTemplate(template: string, values: BoostTemplateValues): string {
  return template.replace(/\{(user|server|boostCount|tier)\}/g, (_match, key: keyof BoostTemplateValues) =>
    String(values[key])
  );
}
