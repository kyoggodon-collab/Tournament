import type { Match, PublicState, Venue } from "@shared/types";
import { teamName } from "./format";

export type LabRow = {
  key: string;
  slot: number;
  startTime: string;
  endTime: string;
  venue: Venue;
  code: string;
  roundLabel: string;
  role: "試合" | "審判";
  teamName: string;
  opponent: string;
  points: string;
  result: string;
};

export function rowsForLab(state: PublicState, lab: string): LabRow[] {
  const ids = new Set(state.teams.filter((team) => team.lab === lab).map((team) => team.id));
  if (ids.size === 0) return [];
  const rows: LabRow[] = [];
  for (const match of state.matches) {
    const onSide1 = Boolean(match.team1Id && ids.has(match.team1Id));
    const onSide2 = Boolean(match.team2Id && ids.has(match.team2Id));
    if (onSide1 || onSide2) {
      const ours = (onSide1 ? match.team1Id : match.team2Id) as string;
      const opponentId = onSide1 ? match.team2Id : match.team1Id;
      const ourScore = onSide1 ? match.score1 : match.score2;
      const theirScore = onSide1 ? match.score2 : match.score1;
      rows.push({
        key: `${match.id}:play`,
        slot: match.slot,
        startTime: match.startTime,
        endTime: match.endTime,
        venue: match.venue,
        code: match.code,
        roundLabel: match.roundLabel,
        role: "試合",
        teamName: teamName(state.teams, ours),
        opponent: opponentId ? teamName(state.teams, opponentId) : "未定",
        points: ourScore !== null && theirScore !== null ? `${ourScore}–${theirScore}` : "",
        result: playResult(match, ours),
      });
    }
    if (match.refereeTeamId && ids.has(match.refereeTeamId)) {
      const playing = match.refereeTeamId === match.team1Id || match.refereeTeamId === match.team2Id;
      if (!playing) {
        rows.push({
          key: `${match.id}:ref`,
          slot: match.slot,
          startTime: match.startTime,
          endTime: match.endTime,
          venue: match.venue,
          code: match.code,
          roundLabel: match.roundLabel,
          role: "審判",
          teamName: teamName(state.teams, match.refereeTeamId),
          opponent: fixtureLabel(match, state),
          points: "",
          result: "審判",
        });
      }
    }
  }
  return rows.sort(
    (a, b) =>
      a.slot - b.slot ||
      a.startTime.localeCompare(b.startTime) ||
      a.code.localeCompare(b.code, "ja") ||
      a.role.localeCompare(b.role, "ja"),
  );
}

function playResult(match: Match, teamId: string): string {
  if (!match.winnerId) return "未試合";
  return match.winnerId === teamId ? "勝ち" : "負け";
}

function fixtureLabel(match: Match, state: PublicState): string {
  const left = match.team1Id ? teamName(state.teams, match.team1Id) : "未定";
  const right = match.team2Id ? teamName(state.teams, match.team2Id) : "未定";
  return `${left} 対 ${right}`;
}
