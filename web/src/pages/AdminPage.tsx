import { FormEvent, useEffect, useState } from "react";
import type { Match, PublicState, Team } from "@shared/types";
import { api } from "../api";
import BracketView from "../components/BracketView";
import MatchCard from "../components/MatchCard";
import { teamName } from "../format";

type Tab = "teams" | "games" | "settings";

export default function AdminPage({
  state,
  onChange,
}: {
  state: PublicState;
  onChange: (state: PublicState) => void;
}) {
  const [admin, setAdmin] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("games");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Match | null>(null);

  useEffect(() => {
    void api.me().then((me) => setAdmin(me.admin)).catch(() => setAdmin(false));
  }, []);

  async function login(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.login(password);
      setAdmin(true);
      setPassword("");
      onChange(await api.state());
    } catch (err) {
      setError(err instanceof Error ? err.message : "ログインできませんでした");
    } finally {
      setBusy(false);
    }
  }

  if (admin === null) {
    return <main className="page"><p>確認しています…</p></main>;
  }

  if (!admin) {
    return (
      <main className="page login-page">
        <form className="login-card" onSubmit={(e) => void login(e)}>
          <p className="eyebrow">Admin</p>
          <h1>運営ログイン</h1>
          <p>このURLは運営用です。共通パスワードを入力してください。閲覧者はトップページで結果だけ確認できます。</p>
          <label>
            パスワード
            <input
              type="password"
              value={password}
              autoFocus
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error ? <p className="error">{error}</p> : null}
          <button type="submit" disabled={busy || !password}>
            {busy ? "確認中…" : "入室する"}
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="page admin">
      <div className="admin-head">
        <div>
          <p className="eyebrow">管理者</p>
          <h1>トーナメント表の編集</h1>
        </div>
        <button
          type="button"
          className="ghost"
          onClick={() => {
            void api.logout().then(() => setAdmin(false));
          }}
        >
          ログアウト
        </button>
      </div>
      <div className="tabs">
        {(["teams", "games", "settings"] as Tab[]).map((id) => (
          <button key={id} className={tab === id ? "is-on" : ""} type="button" onClick={() => setTab(id)}>
            {id === "teams" ? "チーム" : id === "games" ? "トーナメント表" : "設定"}
          </button>
        ))}
      </div>
      {tab === "teams" ? (
        <TeamsPanel state={state} onChange={onChange} setTab={setTab} />
      ) : null}
      {tab === "games" ? (
        state.matches.length > 0 ? (
          <BracketView state={state} onSelect={setSelected} />
        ) : (
          <p className="hint">先にチームタブで組み合わせを生成してください。</p>
        )
      ) : null}
      {tab === "settings" ? <SettingsPanel state={state} onChange={onChange} /> : null}
      {selected ? (
        <ScoreModal
          match={state.matches.find((m) => m.id === selected.id) ?? selected}
          state={state}
          onClose={() => setSelected(null)}
          onChange={onChange}
        />
      ) : null}
    </main>
  );
}

function TeamsPanel({
  state,
  onChange,
  setTab,
}: {
  state: PublicState;
  onChange: (state: PublicState) => void;
  setTab: (tab: Tab) => void;
}) {
  const [teams, setTeams] = useState<Team[]>(state.teams);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setTeams(state.teams);
  }, [state.teams]);

  async function run(action: () => Promise<PublicState>, ok: string) {
    setBusy(true);
    setMessage(null);
    try {
      onChange(await action());
      setMessage(ok);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "失敗しました");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <div className="row">
        <label>
          チーム数
          <input
            type="number"
            min={2}
            max={32}
            value={teams.length}
            onChange={(e) => {
              const count = Number(e.target.value);
              void run(() => api.resize(count), `${count}チームに更新しました。組み合わせは再生成してください。`);
            }}
          />
        </label>
        <button type="button" disabled={busy} onClick={() => void run(() => api.sample(), "昨年度寄りのサンプル名を読み込みました")}>
          サンプル名
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void run(
              () => api.saveTeams(teams),
              "チーム名を保存しました",
            )
          }
        >
          名前を保存
        </button>
      </div>
      <p className="hint">
        チームは半分ずつ会場A / 会場Bに固定します。予選中は会場をまたぎません。優勝決定戦だけB会場勝者がAへ、3位決定戦だけA会場準優勝がBへ移動します。
      </p>
      <ol className="team-editor">
        {teams.map((team, index) => (
          <li key={team.id}>
            <span>{index + 1}</span>
            <input
              value={team.name}
              onChange={(e) =>
                setTeams((cur) => cur.map((t) => (t.id === team.id ? { ...t, name: e.target.value } : t)))
              }
              placeholder="チーム名"
            />
            <input
              value={team.lab}
              onChange={(e) =>
                setTeams((cur) => cur.map((t) => (t.id === team.id ? { ...t, lab: e.target.value } : t)))
              }
              placeholder="研究室名"
            />
          </li>
        ))}
      </ol>
      <div className="row">
        <button
          type="button"
          className="primary"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const saved = await api.saveTeams(teams);
              onChange(saved);
              const generated = await api.generate(false);
              setTab("games");
              return generated;
            }, "登録順で組み合わせを生成しました")
          }
        >
          組み合わせを生成
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const saved = await api.saveTeams(teams);
              onChange(saved);
              const generated = await api.generate(true);
              setTab("games");
              return generated;
            }, "シャッフルして組み合わせを生成しました")
          }
        >
          シャッフルして生成
        </button>
      </div>
      {message ? <p className="flash">{message}</p> : null}
    </section>
  );
}

function SettingsPanel({
  state,
  onChange,
}: {
  state: PublicState;
  onChange: (state: PublicState) => void;
}) {
  const [form, setForm] = useState(state.settings);
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => setForm(state.settings), [state.settings]);

  return (
    <section className="panel settings-grid">
      <label>
        大会名
        <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      </label>
      <label>
        開催日
        <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
      </label>
      <label>
        会場A
        <input value={form.venueAName} onChange={(e) => setForm({ ...form, venueAName: e.target.value })} />
      </label>
      <label>
        会場B
        <input value={form.venueBName} onChange={(e) => setForm({ ...form, venueBName: e.target.value })} />
      </label>
      <label>
        開会
        <input value={form.openingTime} onChange={(e) => setForm({ ...form, openingTime: e.target.value })} />
      </label>
      <label>
        閉会
        <input value={form.closingTime} onChange={(e) => setForm({ ...form, closingTime: e.target.value })} />
      </label>
      <button
        type="button"
        className="primary"
        onClick={() => {
          void api.settings(form).then(onChange).then(() => setMessage("設定を保存しました"));
        }}
      >
        設定を保存
      </button>
      <label>
        運営パスワードの変更
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="新しい共通パスワード"
        />
      </label>
      <button
        type="button"
        onClick={() => {
          void api.password(password).then(() => {
            setPassword("");
            setMessage("パスワードを更新しました");
          });
        }}
        disabled={password.length < 4}
      >
        パスワード更新
      </button>
      {message ? <p className="flash">{message}</p> : null}
    </section>
  );
}

function ScoreModal({
  match,
  state,
  onClose,
  onChange,
}: {
  match: Match;
  state: PublicState;
  onClose: () => void;
  onChange: (state: PublicState) => void;
}) {
  const [score1, setScore1] = useState(match.score1 ?? 0);
  const [score2, setScore2] = useState(match.score2 ?? 0);
  const [winnerId, setWinnerId] = useState(match.winnerId);
  const [startTime, setStartTime] = useState(match.startTime);
  const [endTime, setEndTime] = useState(match.endTime);
  const [error, setError] = useState<string | null>(null);
  const ready = Boolean(match.team1Id && match.team2Id);
  const tied = score1 === score2;

  useEffect(() => {
    setScore1(match.score1 ?? 0);
    setScore2(match.score2 ?? 0);
    setWinnerId(match.winnerId);
    setStartTime(match.startTime);
    setEndTime(match.endTime);
  }, [match]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>
            {match.code} {match.roundLabel}
          </h2>
          <button type="button" className="ghost" onClick={onClose}>
            閉じる
          </button>
        </header>
        <MatchCard match={match} state={state} />
        {!ready ? (
          <p className="hint">対戦チームが決まるまでスコアは記録できません。</p>
        ) : (
          <>
            <div className="score-pad">
              <label>
                {teamName(state.teams, match.team1Id)}
                <input
                  type="number"
                  min={0}
                  value={score1}
                  onChange={(e) => setScore1(Number(e.target.value))}
                />
              </label>
              <label>
                {teamName(state.teams, match.team2Id)}
                <input
                  type="number"
                  min={0}
                  value={score2}
                  onChange={(e) => setScore2(Number(e.target.value))}
                />
              </label>
            </div>
            {tied ? (
              <label>
                同点のためじゃんけんの勝者
                <select value={winnerId ?? ""} onChange={(e) => setWinnerId(e.target.value || null)}>
                  <option value="">選択してください</option>
                  <option value={match.team1Id ?? ""}>{teamName(state.teams, match.team1Id)}</option>
                  <option value={match.team2Id ?? ""}>{teamName(state.teams, match.team2Id)}</option>
                </select>
              </label>
            ) : null}
            <div className="row">
              <button
                type="button"
                className="primary"
                onClick={() => {
                  setError(null);
                  void api
                    .result(match.id, {
                      score1,
                      score2,
                      winnerId: tied ? winnerId : null,
                      decidedBy: tied ? "janken" : "score",
                    })
                    .then(onChange)
                    .then(onClose)
                    .catch((err) => setError(err instanceof Error ? err.message : "保存できませんでした"));
                }}
              >
                結果を確定
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!match.team1Id) return;
                  void api
                    .result(match.id, {
                      score1: null,
                      score2: null,
                      winnerId: match.team1Id,
                      decidedBy: "forfeit",
                    })
                    .then(onChange)
                    .then(onClose);
                }}
              >
                {teamName(state.teams, match.team1Id)}の不戦勝
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!match.team2Id) return;
                  void api
                    .result(match.id, {
                      score1: null,
                      score2: null,
                      winnerId: match.team2Id,
                      decidedBy: "forfeit",
                    })
                    .then(onChange)
                    .then(onClose);
                }}
              >
                {teamName(state.teams, match.team2Id)}の不戦勝
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  void api
                    .result(match.id, {
                      score1: null,
                      score2: null,
                      winnerId: null,
                      decidedBy: null,
                    })
                    .then(onChange)
                    .then(onClose);
                }}
              >
                結果を取り消す
              </button>
            </div>
          </>
        )}
        <div className="row">
          <label>
            開始
            <input value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </label>
          <label>
            終了
            <input value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </label>
          <button
            type="button"
            onClick={() => {
              void api.patchMatch(match.id, { startTime, endTime }).then(onChange);
            }}
          >
            時刻を保存
          </button>
        </div>
        {error ? <p className="error">{error}</p> : null}
      </div>
    </div>
  );
}
