import type { Match, PublicState, Venue } from "@shared/types";
import { splitVenueGroups } from "@shared/bracket";
import { teamName, venueName } from "../format";
import MatchCard from "./MatchCard";

type Props = {
  state: PublicState;
  onSelect?: (match: Match) => void;
};

export default function BracketView({ state, onSelect }: Props) {
  const groups = splitVenueGroups(state.teams);
  const current = state.nowSlot;
  return (
    <div className="bracket">
      <VenueColumn
        venue="A"
        title={venueName(state, "A")}
        teams={groups.A}
        matches={state.matches.filter((m) => m.group === "A")}
        state={state}
        current={current}
        onSelect={onSelect}
      />
      <VenueColumn
        venue="B"
        title={venueName(state, "B")}
        teams={groups.B}
        matches={state.matches.filter((m) => m.group === "B")}
        state={state}
        current={current}
        onSelect={onSelect}
      />
      <section className="finals-stage">
        <h2>決勝ステージ</h2>
        <p className="hint">
          各会場の優勝同士はA会場、各会場の準優勝同士はB会場。閉会式はA会場です。
        </p>
        <div className="finals-grid">
          {state.matches
            .filter((m) => m.group === "finals")
            .sort((a, b) => a.kind.localeCompare(b.kind))
            .map((match) => (
              <MatchCard
                key={match.id}
                match={match}
                state={state}
                current={match.slot === current}
                onSelect={onSelect}
              />
            ))}
        </div>
        <Standings state={state} />
      </section>
    </div>
  );
}

function VenueColumn({
  venue,
  title,
  teams,
  matches,
  state,
  current,
  onSelect,
}: {
  venue: Venue;
  title: string;
  teams: PublicState["teams"];
  matches: Match[];
  state: PublicState;
  current: number | null;
  onSelect?: (match: Match) => void;
}) {
  const rounds = [...new Set(matches.map((m) => m.roundIndex))].sort((a, b) => a - b);
  return (
    <section className={`venue-col venue-${venue}`}>
      <header>
        <h2>{title}</h2>
        <p>
          {teams.map((t) => t.name).join(" / ") || "チームなし"}
        </p>
      </header>
      {rounds.length === 0 ? (
        <p className="hint">{teams[0] ? `${teams[0].name} は不戦勝で決勝へ` : "割当なし"}</p>
      ) : (
        rounds.map((round) => {
          const games = matches.filter((m) => m.roundIndex === round);
          return (
            <div key={`${venue}-${round}`} className="round-block">
              <h3>{games[0]?.roundLabel}</h3>
              {games.map((match) => (
                <MatchCard
                  key={match.id}
                  match={match}
                  state={state}
                  current={match.slot === current}
                  onSelect={onSelect}
                />
              ))}
            </div>
          );
        })
      )}
    </section>
  );
}

function Standings({ state }: { state: PublicState }) {
  const row = [
    ["優勝", state.standings.championId],
    ["準優勝", state.standings.runnerUpId],
    ["3位", state.standings.thirdId],
    ["4位", state.standings.fourthId],
  ] as const;
  return (
    <ol className="standings">
      {row.map(([label, id]) => (
        <li key={label}>
          <span>{label}</span>
          <strong>{id ? teamName(state.teams, id) : "—"}</strong>
        </li>
      ))}
    </ol>
  );
}
