import bcrypt from "bcryptjs";
import {
  applyMatchResult,
  createTeams,
  generateMatches,
  toPublicState,
} from "@shared/bracket";
import { SAMPLE_TEAMS } from "@shared/sample";
import fallback from "@shared/published.json";
import type { Match, PublicState, Team, Tournament, TournamentSettings } from "@shared/types";

const LIVE_URL = "https://extendsclass.com/api/json-storage/bin/dcacbac";
const SESSION_KEY = "sb-admin-until";
const SESSION_MS = 1000 * 60 * 60 * 18;

type ResultBody = {
  score1: number | null;
  score2: number | null;
  winnerId: string | null;
  decidedBy: Match["decidedBy"];
};

let attempts = { count: 0, until: 0 };
let seenUpdatedAt: string | null = null;

function cloneFallback(): Tournament {
  return structuredClone(fallback) as Tournament;
}

function isTournament(value: unknown): value is Tournament {
  if (!value || typeof value !== "object") return false;
  const data = value as Tournament;
  return Array.isArray(data.teams) && Array.isArray(data.matches) && Boolean(data.settings);
}

async function pull(): Promise<Tournament> {
  const response = await fetch(`${LIVE_URL}?v=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) throw new Error("共有の表を読み込めませんでした");
  const data = (await response.json()) as unknown;
  if (!isTournament(data)) throw new Error("共有の表を読み込めませんでした");
  seenUpdatedAt = data.updatedAt ?? null;
  return data;
}

async function load(): Promise<Tournament> {
  try {
    return await pull();
  } catch {
    return cloneFallback();
  }
}

async function push(next: Tournament): Promise<PublicState> {
  const basedOn = seenUpdatedAt;
  const current = await pull().catch(() => null);
  if (current?.updatedAt && basedOn && current.updatedAt !== basedOn) {
    throw new Error("ほかの更新が入ったので、もう一度記録してください");
  }
  next.updatedAt = new Date().toISOString();
  next.settings = { ...next.settings, sessionSecret: "" };
  const response = await fetch(LIVE_URL, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(next),
  });
  if (!response.ok) throw new Error("共有の表を更新できませんでした");
  seenUpdatedAt = next.updatedAt;
  return toPublicState(next);
}

function adminUntil(): number {
  return Number(sessionStorage.getItem(SESSION_KEY) || 0);
}

function requireAdmin(): void {
  if (adminUntil() <= Date.now()) throw new Error("管理者としてログインしてください");
}

function pickSettings(body: Record<string, unknown>): Partial<TournamentSettings> {
  const next: Partial<TournamentSettings> = {};
  if (typeof body.title === "string") next.title = body.title;
  if (typeof body.date === "string") next.date = body.date;
  if (typeof body.venueAName === "string") next.venueAName = body.venueAName;
  if (typeof body.venueBName === "string") next.venueBName = body.venueBName;
  if (typeof body.openingTime === "string") next.openingTime = body.openingTime;
  if (body.openingVenue === "A" || body.openingVenue === "B") next.openingVenue = body.openingVenue;
  if (typeof body.closingTime === "string") next.closingTime = body.closingTime;
  if (body.closingVenue === "A" || body.closingVenue === "B") next.closingVenue = body.closingVenue;
  return next;
}

function cleanTeams(teams: Team[]): Team[] {
  return teams.map((team, index) => ({
    id: team.id || crypto.randomUUID(),
    name: String(team.name || `チーム${index + 1}`).slice(0, 40),
    lab: String(team.lab || "").slice(0, 40),
  }));
}

export const remoteApi = {
  async state(): Promise<PublicState> {
    return toPublicState(await load());
  },
  async me(): Promise<{ admin: boolean }> {
    return { admin: adminUntil() > Date.now() };
  },
  async login(password: string): Promise<{ ok: boolean }> {
    const now = Date.now();
    if (attempts.until > now && attempts.count >= 8) {
      throw new Error("試行が多すぎます。しばらく待ってください。");
    }
    const data = await load();
    const ok = await bcrypt.compare(password, data.settings.adminPasswordHash || "");
    if (!ok) {
      attempts = { count: attempts.count + 1, until: now + 60_000 };
      throw new Error("パスワードが違います");
    }
    attempts = { count: 0, until: 0 };
    sessionStorage.setItem(SESSION_KEY, String(now + SESSION_MS));
    return { ok: true };
  },
  async logout(): Promise<{ ok: boolean }> {
    sessionStorage.removeItem(SESSION_KEY);
    return { ok: true };
  },
  async saveTeams(teams: Team[]): Promise<PublicState> {
    requireAdmin();
    if (teams.length < 2 || teams.length > 32) throw new Error("チーム数は2〜32です");
    const data = await load();
    data.teams = cleanTeams(teams);
    return push(data);
  },
  async resize(count: number): Promise<PublicState> {
    requireAdmin();
    if (!Number.isInteger(count) || count < 2 || count > 32) throw new Error("チーム数は2〜32です");
    const data = await load();
    data.teams = createTeams(count, data.teams);
    data.matches = [];
    data.generatedAt = null;
    return push(data);
  },
  async sample(): Promise<PublicState> {
    requireAdmin();
    const data = await load();
    data.teams = SAMPLE_TEAMS.map((team) => ({ ...team, id: crypto.randomUUID() }));
    data.matches = [];
    data.generatedAt = null;
    return push(data);
  },
  async generate(shuffle: boolean): Promise<PublicState> {
    requireAdmin();
    const data = await load();
    const generated = generateMatches(data.teams, { shuffle });
    data.teams = generated.teams;
    data.matches = generated.matches;
    data.generatedAt = new Date().toISOString();
    data.settings.closingTime = generated.closingTime;
    return push(data);
  },
  async result(id: string, body: ResultBody): Promise<PublicState> {
    requireAdmin();
    const data = await load();
    return push(
      applyMatchResult(data, id, {
        score1: body.score1 === null || body.score1 === undefined ? null : Number(body.score1),
        score2: body.score2 === null || body.score2 === undefined ? null : Number(body.score2),
        winnerId: body.winnerId ?? null,
        decidedBy: body.decidedBy ?? null,
      }),
    );
  },
  async patchMatch(id: string, body: Record<string, unknown>): Promise<PublicState> {
    requireAdmin();
    const data = await load();
    const match = data.matches.find((item) => item.id === id);
    if (!match) throw new Error("試合が見つかりません");
    if (typeof body.startTime === "string") match.startTime = body.startTime;
    if (typeof body.endTime === "string") match.endTime = body.endTime;
    if (typeof body.code === "string") match.code = body.code;
    if (typeof body.innings === "number") match.innings = body.innings;
    if (typeof body.timeLimitMin === "number") match.timeLimitMin = body.timeLimitMin;
    if (typeof body.lastInningAtMin === "number") match.lastInningAtMin = body.lastInningAtMin;
    if (body.refereeSource) match.refereeSource = body.refereeSource as Match["refereeSource"];
    if (body.refereeTeamId !== undefined) {
      match.refereeTeamId = (body.refereeTeamId as string | null) ?? null;
      if (body.refereeTeamId) {
        match.refereeSource = { kind: "team", teamId: String(body.refereeTeamId) };
      } else if (!body.refereeSource) {
        match.refereeSource = { kind: "staff" };
      }
    }
    return push(data);
  },
  async settings(body: Record<string, unknown>): Promise<PublicState> {
    requireAdmin();
    const data = await load();
    data.settings = { ...data.settings, ...pickSettings(body) };
    return push(data);
  },
  async password(password: string): Promise<{ ok: boolean }> {
    requireAdmin();
    if (password.length < 4) throw new Error("パスワードは4文字以上にしてください");
    const data = await load();
    data.settings.adminPasswordHash = await bcrypt.hash(password, 10);
    await push(data);
    return { ok: true };
  },
};
