import type { Match, PublicState } from "@shared/types";
import { formatDate, teamName } from "../format";
import { championshipTree, thirdPlaceTree, uniqueSlots } from "../tree";
import BracketBoard from "./BracketBoard";

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

      <p className="sheet-legend">
        <b>A会場</b>：{state.settings.venueAName}
        <b>B会場</b>：{state.settings.venueBName}
        <span className="legend-advance">赤い線は勝ち上がったチーム</span>
        <span className="legend-ref">小さい「審」は審判</span>
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
      {editable ? <p className="sheet-edit">試合番号を押すとスコアを記録できます。</p> : null}

      {state.matches.length === 0 || !main ? (
        <p className="sheet-empty">まだ組み合わせがありません。運営が生成するとここに表が出ます。</p>
      ) : (
        <div className="sheet-pair">
          <section>
            <h2>本戦</h2>
            <p className="hint">
              各コートは小さい山から始め、次の相手が決まっているあいだは連戦です。不戦勝は1回戦だけに散らします。
            </p>
            <div className="sheet-scroll">
              <BracketBoard root={main} state={state} crown="優勝" onSelect={onSelect} />
            </div>
          </section>
          <section>
            <h2>３位決定戦（本戦で負けた{state.matches.filter((match) => match.kind === "venue").length}チーム全員）</h2>
            <p className="hint">本戦の各試合の敗者が、優勝決定戦を除いて全員出場します。決勝の敗者は準優勝です。</p>
            <div className="sheet-scroll">
              {third ? (
                <BracketBoard root={third} state={state} crown="３位" onSelect={onSelect} />
              ) : (
                <p className="sheet-empty">敗退チームが2つ以上になると3位決定戦を組みます。</p>
              )}
            </div>
            <LoserKey state={state} />
          </section>
        </div>
      )}

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
  for (let i = 0; i < items.length; i += 2) rows.push([items[i] ?? null, items[i + 1] ?? null]);
  return rows;
}

function LoserKey({ state }: { state: PublicState }) {
  const rows = state.matches
    .filter((match) => match.kind === "venue" && match.loserMark)
    .sort((a, b) => a.slot - b.slot || a.venue.localeCompare(b.venue));
  if (rows.length === 0) return null;
  return (
    <section className="sheet-key">
      {rows.map((match) => (
        <span key={match.id}>
          {match.loserMark}:{match.code}で負けたチーム
        </span>
      ))}
    </section>
  );
}
