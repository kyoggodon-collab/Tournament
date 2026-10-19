import type { Match, PublicState } from "@shared/types";
import {
  coldNote,
  decidedLabel,
  matchStatus,
  refereeLabel,
  teamById,
  teamName,
} from "../format";

type Props = {
  match: Match;
  state: PublicState;
  current?: boolean;
  onSelect?: (match: Match) => void;
};

export default function MatchCard({ match, state, current, onSelect }: Props) {
  const status = matchStatus(match);
  const t1 = teamById(state.teams, match.team1Id);
  const t2 = teamById(state.teams, match.team2Id);
  const clickable = Boolean(onSelect);

  return (
    <article
      className={`match-card venue-${match.venue} status-${status}${current ? " is-now" : ""}`}
      onClick={clickable ? () => onSelect?.(match) : undefined}
      onKeyDown={
        clickable
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") onSelect?.(match);
            }
          : undefined
      }
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
    >
      <header>
        <span className="code">{match.code}</span>
        <span className="when">
          {match.startTime}–{match.endTime}
        </span>
        <span className="round">{match.roundLabel}</span>
      </header>
      <div className="sides">
        <Side
          name={t1?.name ?? (match.team1Id ? teamName(state.teams, match.team1Id) : sourceFallback(match, 1, state))}
          lab={t1?.lab ?? ""}
          score={match.score1}
          winner={Boolean(match.winnerId && match.winnerId === match.team1Id)}
        />
        <div className="vs">VS</div>
        <Side
          name={t2?.name ?? (match.team2Id ? teamName(state.teams, match.team2Id) : sourceFallback(match, 2, state))}
          lab={t2?.lab ?? ""}
          score={match.score2}
          winner={Boolean(match.winnerId && match.winnerId === match.team2Id)}
        />
      </div>
      <footer>
        <span>審判 {refereeLabel(match, state)}</span>
        <span>{coldNote(match)}</span>
        {decidedLabel(match) ? <b>{decidedLabel(match)}</b> : null}
      </footer>
    </article>
  );
}

function Side({
  name,
  lab,
  score,
  winner,
}: {
  name: string;
  lab: string;
  score: number | null;
  winner: boolean;
}) {
  return (
    <div className={`side${winner ? " is-win" : ""}`}>
      <strong>{name}</strong>
      {lab ? <small>{lab}</small> : <small>&nbsp;</small>}
      <em>{score === null ? "–" : score}</em>
    </div>
  );
}

function sourceFallback(match: Match, side: 1 | 2, state: PublicState): string {
  const source = side === 1 ? match.source1 : match.source2;
  if (source.kind === "team") return teamName(state.teams, source.teamId);
  const prev = state.matches.find((m) => m.id === source.matchId);
  return prev
    ? `${prev.code}の${source.kind === "winner" ? "勝者" : "敗者"}`
    : "未定";
}
