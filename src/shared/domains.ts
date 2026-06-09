const domainPattern = /^(?:\*\.)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

export function normalizeDomain(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) throw new Error("Domain cannot be empty.");
  if (trimmed.includes("://") || trimmed.includes("/") || trimmed.includes("?") || trimmed.includes("#")) {
    throw new Error("Enter domains only, such as x.com, without https:// or a path.");
  }
  const domain = trimmed.replace(/^www\./, "").replace(/\.$/, "");
  if (!domainPattern.test(domain)) {
    throw new Error(`"${value}" is not a valid domain.`);
  }
  return domain;
}

export function domainMatches(hostname: string, rule: string): boolean {
  const host = hostname.toLowerCase().replace(/^www\./, "");
  const normalizedRule = rule.replace(/^\*\./, "");
  return host === normalizedRule || host.endsWith(`.${normalizedRule}`);
}

export function extractMessageDomains(content: string): string[] {
  const matches = content.match(/https?:\/\/[^\s<>()]+/gi) ?? [];
  const domains = matches.flatMap((value) => {
    try {
      return [new URL(value).hostname.toLowerCase().replace(/^www\./, "")];
    } catch {
      return [];
    }
  });
  return [...new Set(domains)];
}
