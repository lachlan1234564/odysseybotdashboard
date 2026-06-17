export type DocsTopicDefinition = {
  slug: string;
  title: string;
  navTitle?: string;
  description: string;
  files: readonly string[];
  path: string;
  category?: string;
  defaultHash?: string;
  hiddenFromNav?: boolean;
  aliases?: readonly string[];
  sections?: readonly DocsSectionDefinition[];
};

export type DocsSectionDefinition = {
  title: string;
  description?: string;
  hash?: string;
  aliases?: readonly string[];
};

export type DocsSearchResult = {
  slug: string;
  title: string;
  description: string;
  path: string;
  category?: string;
  navTitle?: string;
  defaultHash?: string;
  hash?: string;
  heading?: string;
  matchedText?: string;
  kind: "page" | "section";
};

function stripMarkdown(value: string): string {
  return value
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_~#>]+/g, "")
    .trim();
}

export function docsAnchorId(value: string): string {
  return normalizeDocsSearch(stripMarkdown(value))
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "") || "section";
}

export function normalizeDocsSearch(value: string): string {
  return String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\bcloudfare\b/g, "cloudflare")
    .replace(/\bauto\s*mod\b/g, "automod")
    .replace(/\breaction\s+roles\b/g, "role panels")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function extractMarkdownHeadings(markdown: string): DocsSectionDefinition[] {
  const used = new Map<string, number>();
  return markdown
    .split(/\r?\n/)
    .map((line) => line.match(/^(#{2,4})\s+(.+?)\s*#*$/))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => {
      const title = stripMarkdown(match[2] ?? "");
      const base = docsAnchorId(title);
      const count = used.get(base) ?? 0;
      used.set(base, count + 1);
      return {
        title,
        hash: count ? `${base}-${count}` : base
      };
    });
}

function scoreTerm(query: string, term: string): number {
  const normalized = normalizeDocsSearch(term);
  const compactQuery = query.replace(/\s+/g, "");
  const compactTerm = normalized.replace(/\s+/g, "");
  const tokens = query.split(/\s+/).filter(Boolean);

  if (!normalized) return 0;
  if (normalized === query || compactTerm === compactQuery) return 160;
  if (normalized.startsWith(query) || compactTerm.startsWith(compactQuery)) return 130;
  if (normalized.includes(query) || compactTerm.includes(compactQuery)) return 105;
  if (tokens.every((token) => normalized.includes(token) || compactTerm.includes(token))) return 78;
  const matchingTokens = tokens.filter((token) => normalized.includes(token) || compactTerm.includes(token));
  return matchingTokens.length ? Math.min(60, matchingTokens.length * 18) : 0;
}

function resultForTopic(topic: DocsTopicDefinition): DocsSearchResult {
  return {
    slug: topic.slug,
    title: topic.title,
    description: topic.description,
    path: topic.path,
    category: topic.category,
    navTitle: topic.navTitle,
    defaultHash: topic.defaultHash,
    kind: "page"
  };
}

export function searchDocsIndex(
  query: string,
  topics: readonly DocsTopicDefinition[],
  readMarkdown: (topic: DocsTopicDefinition) => string
): DocsSearchResult[] {
  const normalized = normalizeDocsSearch(query);
  if (!normalized) return topics.map(resultForTopic);

  const scored: Array<{ result: DocsSearchResult; score: number; matchedText: string }> = [];
  for (const topic of topics) {
    const markdown = readMarkdown(topic);
    const pageTerms = [
      topic.title,
      topic.description,
      topic.path,
      ...(topic.aliases ?? [])
    ];
    const pageMatch = pageTerms.reduce(
      (best, term) => {
        const score = scoreTerm(normalized, term);
        return score > best.score ? { score, term } : best;
      },
      { score: scoreTerm(normalized, markdown) > 0 ? 42 : 0, term: topic.title }
    );
    if (pageMatch.score > 0) {
      scored.push({
        result: resultForTopic(topic),
        score: pageMatch.score + 6,
        matchedText: pageMatch.term
      });
    }

    const sections = [...(topic.sections ?? []), ...extractMarkdownHeadings(markdown)];
    const seenSections = new Set<string>();
    for (const section of sections) {
      const hash = section.hash ?? docsAnchorId(section.title);
      const key = `${topic.slug}:${hash}`;
      if (seenSections.has(key)) continue;
      seenSections.add(key);
      const terms = [
        section.title,
        section.description ?? "",
        topic.title,
        topic.path,
        ...(section.aliases ?? [])
      ];
      const match = terms.reduce(
        (best, term) => {
          const score = scoreTerm(normalized, term);
          return score > best.score ? { score, term } : best;
        },
        { score: 0, term: section.title }
      );
      if (match.score <= 0) continue;
      scored.push({
        result: {
          slug: topic.slug,
          title: topic.title,
          description: section.description || topic.description,
          path: topic.path,
          category: topic.category,
          navTitle: topic.navTitle,
          defaultHash: topic.defaultHash,
          hash,
          heading: section.title,
          kind: "section"
        },
        score: match.score + 12,
        matchedText: match.term
      });
    }
  }

  const seen = new Set<string>();
  return scored
    .sort((left, right) => right.score - left.score || left.result.title.localeCompare(right.result.title))
    .filter(({ result }) => {
      const key = `${result.slug}:${result.hash ?? ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 25)
    .map(({ result, matchedText }) => ({ ...result, matchedText }));
}
