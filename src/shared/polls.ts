import type { Poll, PollVote } from "./types.js";

export interface PollResultOption {
  id: string;
  text: string;
  votes: number;
  percent: number;
}

export interface PollResults {
  totalVotes: number;
  options: PollResultOption[];
}

export const POLL_OPEN_COLOR = 0xC58B4B;
export const POLL_CLOSED_COLOR = 0x879C68;

export function tallyPollVotes(poll: Pick<Poll, "options">, votes: Array<Pick<PollVote, "optionIds">>): PollResults {
  const counts = new Map(poll.options.map((option) => [option.id, 0]));
  for (const vote of votes) {
    for (const optionId of new Set(vote.optionIds)) {
      if (counts.has(optionId)) counts.set(optionId, (counts.get(optionId) ?? 0) + 1);
    }
  }
  const totalVotes = [...counts.values()].reduce((sum, count) => sum + count, 0);
  return {
    totalVotes,
    options: poll.options.map((option) => {
      const count = counts.get(option.id) ?? 0;
      return {
        id: option.id,
        text: option.label || option.text,
        votes: count,
        percent: totalVotes ? Math.round((count / totalVotes) * 100) : 0
      };
    })
  };
}

export function pollOptionLabel(option: { label?: string; text?: string }): string {
  return (option.label || option.text || "Option").slice(0, 100);
}

export function pollShowsPublicCounts(
  poll: Pick<Poll, "resultsVisibility" | "status">,
  closed = false
): boolean {
  if (poll.resultsVisibility === "hidden") return false;
  if (poll.resultsVisibility === "after_close") return closed || poll.status === "ended" || poll.status === "cancelled";
  return true;
}

export function pollProgressBar(percent: number, width = 12): string {
  const boundedPercent = Math.max(0, Math.min(100, Math.round(percent)));
  const filled = Math.round((boundedPercent / 100) * width);
  return `${"█".repeat(filled)}${"░".repeat(Math.max(0, width - filled))}`;
}

export function pollDisplayTitle(poll: Pick<Poll, "id" | "title" | "status">, closed = false): string {
  const title = poll.title || `Poll #${poll.id}`;
  if (poll.status === "cancelled") return `${title} · Poll cancelled`;
  if (closed || poll.status === "ended") return `${title} · Poll ended`;
  return title;
}

export function pollPublicDescription(
  poll: Pick<Poll, "question" | "options" | "resultsVisibility" | "status">,
  votes: Array<Pick<PollVote, "optionIds">> = [],
  closed = false
): string {
  const results = tallyPollVotes(poll, votes);
  const showCounts = pollShowsPublicCounts(poll, closed);
  const optionLines = poll.options.map((option, index) => {
    const optionPrefix = option.emoji ? `${option.emoji} ` : `**${index + 1}.** `;
    const description = option.description || (option.text !== option.label ? option.text : "");
    const label = `${optionPrefix}**${pollOptionLabel(option)}**`;
    if (!showCounts) return `${label}${description ? `\n${description}` : ""}`;

    const result = results.options.find((item) => item.id === option.id);
    const votesCount = result?.votes ?? 0;
    const percent = result?.percent ?? 0;
    const voteLabel = votesCount === 1 ? "vote" : "votes";
    return [
      `${label}${description ? `\n${description}` : ""}`,
      `${pollProgressBar(percent)} ${votesCount} ${voteLabel} · ${percent}%`
    ].join("\n");
  });

  return [`**${poll.question}**`, "", optionLines.join("\n\n")].join("\n");
}

export function nextPollSelection(
  poll: Pick<Poll, "multipleChoice" | "options">,
  currentOptionIds: string[],
  clickedOptionId: string
): string[] {
  const validOptionIds = new Set(poll.options.map((option) => option.id));
  if (!validOptionIds.has(clickedOptionId)) return [];
  if (!poll.multipleChoice) return [clickedOptionId];

  const current = currentOptionIds.filter((optionId, index, values) =>
    validOptionIds.has(optionId) && values.indexOf(optionId) === index
  );
  return current.includes(clickedOptionId)
    ? current.filter((optionId) => optionId !== clickedOptionId)
    : [...current, clickedOptionId];
}
