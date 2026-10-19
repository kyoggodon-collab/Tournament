import type { Match, PublicState } from "@shared/types";
import BracketView from "../components/BracketView";
import MatchCard from "../components/MatchCard";
import { formatDate, venueName } from "../format";

export default function ViewerPage({ state }: { state: PublicState }) {
  const live = state.matches.filter((m) => m.slot === state.nowSlot && !m.winnerId);
  const upcoming = state.matches
    .filter((m) => !m.winnerId && (state.nowSlot === null || m.slot > state.nowSlot))
    .sort((a, b) => a.slot - b.slot || a.venue.localeCompare(b.venue))
    .slice(0, 4);
  const timeline = [...state.matches].sort(
    (a, b) => a.slot - b.slot || a.venue.localeCompare(b.venue),
  );

  return (
    <main className="page viewer">
      <section className="hero">
        <div>
          <p className="eyebrow">閲覧専用 / 結果は自動更新</p>
          <h1>試合結果・勝ち上がり</h1>
          <p>
            {formatDate(state.settings.date)}　開会 {state.settings.openingTime}（
            {venueName(state, state.settings.openingVenue)}）／閉会{" "}
            {state.settings.closingTime}（{venueName(state, state.settings.closingVenue)}）
          </p>
        </div>
        <div className="hero-venues">
          <div>
            <b>会場A</b>
            <span>{state.settings.venueAName}</span>
          </div>
          <div>
            <b>会場B</b>
            <span>{state.settings.venueBName}</span>
          </div>
        </div>
      </section>

      {state.warnings.length > 0 ? (
        <ul className="warnings">
          {state.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      ) : null}

      <section className="now-block">
        <h2>いまの試合</h2>
        {live.length === 0 ? (
          <p className="hint">
            {state.matches.length === 0
              ? "まだトーナメントが生成されていません。運営が組み合わせを確定するとここに表示されます。"
              : "進行中の試合はありません。"}
          </p>
        ) : (
          <div className="card-grid">
            {live.map((match) => (
              <MatchCard key={match.id} match={match} state={state} current />
            ))}
          </div>
        )}
      </section>

      {upcoming.length > 0 ? (
        <section>
          <h2>次の試合</h2>
          <div className="card-grid">
            {upcoming.map((match) => (
              <MatchCard key={match.id} match={match} state={state} />
            ))}
          </div>
        </section>
      ) : null}

      {state.matches.length > 0 ? <BracketView state={state} /> : null}

      {timeline.length > 0 ? (
        <section className="timeline">
          <h2>全試合タイムテーブル</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>試合</th>
                  <th>時刻</th>
                  <th>会場</th>
                  <th>カード</th>
                  <th>スコア</th>
                  <th>審判</th>
                </tr>
              </thead>
              <tbody>
                {timeline.map((match) => (
                  <tr key={match.id} className={match.slot === state.nowSlot ? "is-now" : ""}>
                    <td>
                      {match.code}
                      <small>{match.roundLabel}</small>
                    </td>
                    <td>
                      {match.startTime}–{match.endTime}
                    </td>
                    <td>{match.venue}</td>
                    <td>{cardLabel(match, state)}</td>
                    <td>{scoreLabel(match)}</td>
                    <td>{match.refereeTeamId ? state.teams.find((t) => t.id === match.refereeTeamId)?.name : "運営"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </main>
  );
}

function cardLabel(match: Match, state: PublicState): string {
  const n = (id: string | null) => state.teams.find((t) => t.id === id)?.name ?? "未定";
  return `${n(match.team1Id)} vs ${n(match.team2Id)}`;
}

function scoreLabel(match: Match): string {
  if (match.score1 === null || match.score2 === null) {
    return match.winnerId ? "勝敗のみ" : "—";
  }
  return `${match.score1} – ${match.score2}`;
}
