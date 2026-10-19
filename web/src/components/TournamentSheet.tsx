import type { Match, PublicState, Team } from "@shared/types";
import { slotMark } from "@shared/time";
import {
  decidedLabel,
  formatDate,
  matchStatus,
  refereeLabel,
  teamById,
  teamName,
} from "../format";
import {
  championshipTree,
  thirdPlaceTree,
  uniqueSlots,
  type TreeNode,
} from "../tree";

const MARKS = "イロハニホヘトチリヌルヲワカヨタレソツネナラムウヰノオクヤマケフコエテアサキユメミシヱヒモセス";

type Props = {
  state: PublicState;
  onSelect?: (match: Match) => void;
  editable?: boolean;
};

export default function TournamentSheet({ state, onSelect, editable }: Props) {
  const main = championshipTree(state.matches);
  const third = thirdPlaceTree(state.matches);
  const slots = uniqueSlots(state.matches);
  const live = state.matches.filter((match) => match.slot === state.nowSlot && !match.winnerId);

  return (
    <article className="sheet">
      <header className="sheet-head">
        <h1>
          {state.settings.title}
          <span>トーナメント表</span>
        </h1>
        <p className="sheet-date">{formatDate(state.settings.date)}</p>
      </header>

      <table className="sheet-time">
        <tbody>
          <tr>
            <td>{state.settings.openingTime}-</td>
            <td colSpan={3}>開会式：{state.settings.openingVenue}会場</td>
          </tr>
          {pairSlots(slots).map((row, index) => (
            <tr key={index}>
              {row.map((slot, col) =>
                slot ? (
                  <SlotCells key={slot.slot} slot={slot} current={slot.slot === state.nowSlot} />
                ) : (
                  <EmptySlot key={`empty-${col}`} />
                ),
              )}
            </tr>
          ))}
          <tr>
            <td>閉会式：{state.settings.closingVenue}会場</td>
            <td colSpan={3}>{state.settings.closingTime}-</td>
          </tr>
        </tbody>
      </table>

      <p className="sheet-legend">
        <b>A会場</b>：{state.settings.venueAName}
        <b>B会場</b>：{state.settings.venueBName}
        <span className="ref-note">赤字：審判をするチーム</span>
      </p>

      {live.length > 0 ? (
        <p className="sheet-now">
          進行中：
          {live.map((match) => (
            <span key={match.id}>
              {match.code} {teamName(state.teams, match.team1Id)} vs {teamName(state.teams, match.team2Id)}
            </span>
          ))}
        </p>
      ) : null}

      {editable ? <p className="sheet-edit">試合マスをクリックするとスコアを記録できます。</p> : null}

      {state.matches.length === 0 ? (
        <p className="sheet-empty">まだ組み合わせがありません。運営が生成するとここに表が出ます。</p>
      ) : (
        <>
          <section className="sheet-block">
            <h2>本戦</h2>
            <div className="sheet-scroll">
              {main ? (
                <div className="t-wrap">
                  <ClassicTree node={main} state={state} onSelect={onSelect} />
                  <Crown label="優勝" team={teamById(state.teams, state.standings.championId)} />
                </div>
              ) : null}
            </div>
          </section>

          <section className="sheet-block">
            <h2>３位決定戦</h2>
            <div className="sheet-scroll">
              {third ? (
                <div className="t-wrap">
                  <ClassicTree node={third} state={state} onSelect={onSelect} />
                  <Crown label="３位" team={teamById(state.teams, state.standings.thirdId)} />
                </div>
              ) : (
                <p className="sheet-empty">3位決定戦はチーム数が足りないためありません。</p>
              )}
            </div>
          </section>

          <LoserKey state={state} />
        </>
      )}
    </article>
  );
}

function EmptySlot() {
  return (
    <>
      <td />
      <td />
    </>
  );
}

function SlotCells({
  slot,
  current,
}: {
  slot: ReturnType<typeof uniqueSlots>[number];
  current: boolean;
}) {
  return (
    <>
      <td className={current ? "is-now" : ""}>
        {slot.startTime}-{slot.endTime}
      </td>
      <td className={current ? "is-now" : ""}>
        （{slot.minutes}分）{slot.mark}
      </td>
    </>
  );
}

function pairSlots<T>(items: T[]): [T | null, T | null][] {
  const rows: [T | null, T | null][] = [];
  for (let i = 0; i < items.length; i += 2) {
    rows.push([items[i] ?? null, items[i + 1] ?? null]);
  }
  return rows;
}

function ClassicTree({
  node,
  state,
  onSelect,
}: {
  node: TreeNode;
  state: PublicState;
  onSelect?: (match: Match) => void;
}) {
  if (node.kind === "team") {
    return <TeamLeaf team={teamById(state.teams, node.teamId)} />;
  }
  if (node.kind === "loser") {
    const loserId =
      node.match.winnerId && node.match.team1Id && node.match.team2Id
        ? node.match.winnerId === node.match.team1Id
          ? node.match.team2Id
          : node.match.team1Id
        : null;
    const mark = node.match.loserMark || markFor(node.match, state.matches);
    return (
      <TeamLeaf
        team={teamById(state.teams, loserId)}
        fallback={`${node.match.code}負`}
        mark={mark}
      />
    );
  }

  return (
    <div className="t-fork">
      <div className="t-kids">
        <ClassicTree node={node.top} state={state} onSelect={onSelect} />
        <ClassicTree node={node.bottom} state={state} onSelect={onSelect} />
      </div>
      <div className="t-join">
        <MatchCell match={node.match} state={state} onSelect={onSelect} />
      </div>
    </div>
  );
}

function TeamLeaf({
  team,
  fallback,
  mark,
}: {
  team: Team | null;
  fallback?: string;
  mark?: string;
}) {
  return (
    <div className="t-leaf">
      {mark ? <i className="t-kana">{mark}</i> : null}
      <div className="t-team">
        <strong>{team?.name ?? fallback ?? "未定"}</strong>
        {team?.lab ? <small>{team.lab}</small> : null}
      </div>
    </div>
  );
}

function MatchCell({
  match,
  state,
  onSelect,
}: {
  match: Match;
  state: PublicState;
  onSelect?: (match: Match) => void;
}) {
  const status = matchStatus(match);
  const t1 = teamById(state.teams, match.team1Id);
  const t2 = teamById(state.teams, match.team2Id);
  const clickable = Boolean(onSelect);
  return (
    <button
      type="button"
      className={`t-match venue-${match.venue} status-${status}${match.slot === state.nowSlot ? " is-now" : ""}`}
      onClick={clickable ? () => onSelect?.(match) : undefined}
      disabled={!clickable}
    >
      <div className="t-match-head">
        <b>{match.code}</b>
        <span>
          {match.startTime}-{match.endTime} {match.venue}会場
        </span>
      </div>
      <SideRow
        name={t1?.name ?? sourceName(match, 1, state)}
        score={match.score1}
        win={Boolean(match.winnerId && match.winnerId === match.team1Id)}
      />
      <SideRow
        name={t2?.name ?? sourceName(match, 2, state)}
        score={match.score2}
        win={Boolean(match.winnerId && match.winnerId === match.team2Id)}
      />
      <div className="t-match-foot">
        <span className="ref-note">審判 {refereeLabel(match, state)}</span>
        {decidedLabel(match) ? <span>{decidedLabel(match)}</span> : null}
      </div>
    </button>
  );
}

function SideRow({ name, score, win }: { name: string; score: number | null; win: boolean }) {
  return (
    <div className={`t-side${win ? " is-win" : ""}`}>
      <em>{name}</em>
      <b>{score === null ? "" : score}</b>
    </div>
  );
}

function Crown({ label, team }: { label: string; team: Team | null }) {
  return (
    <div className="t-crown">
      <span>{label}</span>
      <strong>{team?.name ?? "　　"}</strong>
      {team?.lab ? <small>{team.lab}</small> : null}
    </div>
  );
}

function LoserKey({ state }: { state: PublicState }) {
  const rows = state.matches
    .filter((match) => match.kind === "venue")
    .sort((a, b) => a.slot - b.slot || a.venue.localeCompare(b.venue))
    .map((match) => ({
      mark: match.loserMark || markFor(match, state.matches),
      text: `${match.code}で負けたチーム`,
    }));
  if (rows.length === 0) return null;
  return (
    <section className="sheet-key">
      {rows.map((row) => (
        <span key={row.mark}>
          {row.mark}:{row.text}
        </span>
      ))}
    </section>
  );
}

function sourceName(match: Match, side: 1 | 2, state: PublicState): string {
  const source = side === 1 ? match.source1 : match.source2;
  if (source.kind === "team") return teamName(state.teams, source.teamId);
  const prev = state.matches.find((item) => item.id === source.matchId);
  if (!prev) return "未定";
  return `${prev.code}の${source.kind === "winner" ? "勝者" : "敗者"}`;
}

function markFor(match: Match, matches: Match[]): string {
  const list = matches
    .filter((item) => item.kind === "venue")
    .sort((a, b) => a.slot - b.slot || a.venue.localeCompare(b.venue));
  const index = list.findIndex((item) => item.id === match.id);
  return index >= 0 ? MARKS[index] ?? slotMark(index) : "";
}
