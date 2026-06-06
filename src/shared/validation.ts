export const COMMAND_NAME_PATTERN = /^[a-z0-9_-]+$/;

export function normalizeCommandName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s]+/g, "-")
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "")
    .slice(0, 32);
}

export function isValidCommandName(value: string): boolean {
  return value.length >= 1 && value.length <= 32 && COMMAND_NAME_PATTERN.test(value);
}
