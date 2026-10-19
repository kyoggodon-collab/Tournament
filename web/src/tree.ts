import type { Match, Source } from "@shared/types";

export type TreeNode =
  | { kind: "team"; teamId: string }
  | { kind: "loser"; match: Match }
  | { kind: "match"; match: Match; top: TreeNode; bottom: TreeNode };

export function nodeFromSource(source: Source, matches: Match[]): TreeNode {
  if (source.kind === "team") return { kind: "team", teamId: source.teamId };
  const match = matches.find((item) => item.id === source.matchId);
  if (!match) return { kind: "team", teamId: "" };
  if (source.kind === "loser") return { kind: "loser", match };
  return {
    kind: "match",
    match,
    top: nodeFromSource(match.source1, matches),
    bottom: nodeFromSource(match.source2, matches),
  };
}

export function championshipTree(matches: Match[]): TreeNode | null {
  const grand = matches.find((match) => match.kind === "grandFinal");
  if (grand) return nodeFromSource({ kind: "winner", matchId: grand.id }, matches);
  const venue = matches.filter((match) => match.kind === "venue");
  if (venue.length === 0) return null;
  const last = [...venue].sort(
    (a, b) => b.roundIndex - a.roundIndex || a.venue.localeCompare(b.venue),
  )[0];
  return nodeFromSource({ kind: "winner", matchId: last.id }, matches);
}

export function thirdPlaceTree(matches: Match[]): TreeNode | null {
  const third = matches.find((match) => match.kind === "thirdPlace");
  if (!third) return null;
  return nodeFromSource({ kind: "winner", matchId: third.id }, matches);
}

export function uniqueSlots(matches: Match[]): {
  slot: number;
  mark: string;
  startTime: string;
  endTime: string;
  minutes: number;
}[] {
  const map = new Map<number, Match>();
  for (const match of matches) {
    if (!map.has(match.slot)) map.set(match.slot, match);
  }
  return [...map.values()]
    .sort((a, b) => a.slot - b.slot)
    .map((match) => ({
      slot: match.slot,
      mark: match.code.replace(/[AB]$/, ""),
      startTime: match.startTime,
      endTime: match.endTime,
      minutes: match.kind === "grandFinal" ? 60 : 40,
    }));
}
