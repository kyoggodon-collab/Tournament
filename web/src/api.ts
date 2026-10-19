import type { PublicState, Team } from "@shared/types";
import { remoteApi } from "./remoteStore";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `通信エラー (${res.status})`);
  }
  return data;
}

const httpApi = {
  state: () => request<PublicState>("/api/state"),
  me: () => request<{ admin: boolean }>("/api/me"),
  login: (password: string) =>
    request<{ ok: boolean }>("/api/login", {
      method: "POST",
      body: JSON.stringify({ password }),
    }),
  logout: () => request<{ ok: boolean }>("/api/logout", { method: "POST" }),
  saveTeams: (teams: Team[]) =>
    request<PublicState>("/api/teams", {
      method: "PUT",
      body: JSON.stringify({ teams }),
    }),
  resize: (count: number) =>
    request<PublicState>("/api/teams/resize", {
      method: "POST",
      body: JSON.stringify({ count }),
    }),
  sample: () => request<PublicState>("/api/teams/sample", { method: "POST" }),
  generate: (shuffle: boolean) =>
    request<PublicState>("/api/generate", {
      method: "POST",
      body: JSON.stringify({ shuffle }),
    }),
  result: (
    id: string,
    body: {
      score1: number | null;
      score2: number | null;
      winnerId: string | null;
      decidedBy: "score" | "janken" | "forfeit" | null;
    },
  ) =>
    request<PublicState>(`/api/matches/${id}/result`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  patchMatch: (id: string, body: Record<string, unknown>) =>
    request<PublicState>(`/api/matches/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  settings: (body: Record<string, unknown>) =>
    request<PublicState>("/api/settings", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  password: (password: string) =>
    request<{ ok: boolean }>("/api/password", {
      method: "POST",
      body: JSON.stringify({ password }),
    }),
};

export const api: typeof httpApi = import.meta.env.VITE_STATIC === "1" ? remoteApi : httpApi;
