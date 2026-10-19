import type { Match, PublicState, Source, Team, Venue } from "@shared/types";

export function teamById(teams: Team[], id: string | null | undefined): Team | null {
  if (!id) return null;
  return teams.find((t) => t.id === id) ?? null;
}

export function teamName(teams: Team[], id: string | null | undefined): string {
  return teamById(teams, id)?.name ?? "未定";
}

export function teamSub(team: Team | null): string {
  return team?.lab ? team.lab : "";
}

export function venueName(state: PublicState, venue: Venue): string {
  return venue === "A" ? `A ${state.settings.venueAName}` : `B ${state.settings.venueBName}`;
}

export function sourceLabel(source: Source, state: PublicState): string {
  if (source.kind === "team") return teamName(state.teams, source.teamId);
  const match = state.matches.find((m) => m.id === source.matchId);
  const code = match?.code ?? "前の試合";
  return source.kind === "winner" ? `${code}の勝者` : `${code}の敗者`;
}

export function refereeLabel(match: Match, state: PublicState): string {
  if (match.refereeTeamId) return teamName(state.teams, match.refereeTeamId);
  const referee = match.refereeSource;
  if (referee.kind === "loser") {
    const src = state.matches.find((m) => m.id === referee.matchId);
    return src ? `${src.code}の敗者（負け審）` : "負け審";
  }
  return "運営";
}

export function matchStatus(match: Match): "done" | "ready" | "waiting" {
  if (match.winnerId) return "done";
  if (match.team1Id && match.team2Id) return "ready";
  return "waiting";
}

export function decidedLabel(match: Match): string | null {
  if (match.decidedBy === "janken") return "じゃんけん";
  if (match.decidedBy === "forfeit") return "不戦勝";
  return null;
}

export function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return isoDate;
  return `${y}年${m}月${d}日`;
}

export function coldNote(match: Match): string {
  return `${match.innings}回制・制限${match.timeLimitMin}分（最終回${match.lastInningAtMin}分）`;
}
