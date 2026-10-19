import { useEffect, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { api } from "./api";
import AdminPage from "./pages/AdminPage";
import RulesPage from "./pages/RulesPage";
import ViewerPage from "./pages/ViewerPage";
import type { PublicState } from "@shared/types";

export default function App() {
  const [state, setState] = useState<PublicState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const location = useLocation();

  async function reload() {
    try {
      setState(await api.state());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "読み込みに失敗しました");
    }
  }

  useEffect(() => {
    void reload();
    const id = window.setInterval(() => void reload(), 8000);
    return () => window.clearInterval(id);
  }, []);

  if (!state && !error) {
    return (
      <div className="boot">
        <div className="boot-mark">SOFTBALL</div>
        <p>トーナメントを読み込んでいます…</p>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="boot">
        <p>{error}</p>
        <button type="button" onClick={() => void reload()}>
          再読み込み
        </button>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand">
          <span className="brand-kicker">Lab Softball</span>
          <strong>{state.settings.title}</strong>
          <em>{formatHeaderDate(state.settings.date)}</em>
        </Link>
        <nav>
          <Link className={location.pathname === "/" ? "is-on" : ""} to="/">
            トーナメント
          </Link>
          <Link className={location.pathname === "/rules" ? "is-on" : ""} to="/rules">
            ルール
          </Link>
          <Link className={location.pathname.startsWith("/admin") ? "is-on" : ""} to="/admin">
            運営
          </Link>
        </nav>
      </header>
      <Routes>
        <Route path="/" element={<ViewerPage state={state} />} />
        <Route path="/rules" element={<RulesPage />} />
        <Route
          path="/admin"
          element={<AdminPage state={state} onChange={setState} />}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

function formatHeaderDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  if (!y || !m || !d) return isoDate;
  return `${y}.${m}.${d}`;
}
