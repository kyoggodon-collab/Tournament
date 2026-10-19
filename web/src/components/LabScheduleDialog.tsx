import type { PublicState } from "@shared/types";
import { rowsForLab } from "../labSchedule";

type Props = {
  state: PublicState;
  lab: string;
  onClose: () => void;
};

export default function LabScheduleDialog({ state, lab, onClose }: Props) {
  const rows = rowsForLab(state, lab);
  const members = state.teams.filter((team) => team.lab === lab).map((team) => team.name);

  return (
    <div className="modal-backdrop lab-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal lab-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lab-schedule-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <h2 id="lab-schedule-title">{lab}</h2>
          <button type="button" className="ghost" onClick={onClose}>
            閉じる
          </button>
        </header>
        <p className="hint">
          {members.length > 0 ? `${members.join("、")}。` : ""}
          出場と審判が決まっている試合だけを、時刻順に表示します。得点は自チームから見た数字です。
        </p>
        {rows.length === 0 ? (
          <p className="sheet-empty">まだ確定した予定はありません。</p>
        ) : (
          <div className="table-wrap">
            <table className="lab-table">
              <thead>
                <tr>
                  <th>時刻</th>
                  <th>会場</th>
                  <th>試合</th>
                  <th>役割</th>
                  <th>チーム</th>
                  <th>相手</th>
                  <th>得点</th>
                  <th>結果</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.key} className={row.result === "勝ち" ? "is-win-row" : ""}>
                    <td>
                      {row.startTime}–{row.endTime}
                    </td>
                    <td>{row.venue}会場</td>
                    <td>
                      {row.code}
                      <small>{row.roundLabel}</small>
                    </td>
                    <td>{row.role}</td>
                    <td>{row.teamName}</td>
                    <td>{row.opponent}</td>
                    <td>{row.points || "—"}</td>
                    <td>{row.result}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
