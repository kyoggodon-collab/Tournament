import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import express from "express";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import {
  applyMatchResult,
  collectWarnings,
  createTeams,
  currentSlot,
  defaultSettings,
  BRACKET_VERSION,
  generateMatches,
  resolveTournament,
  standingsOf,
} from "../shared/bracket.js";
import { SAMPLE_TEAMS } from "../shared/sample.js";
import type { PublicState, Team, Tournament } from "../shared/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const DATA_PATH = path.join(DATA_DIR, "tournament.json");
const DIST_DIR = path.join(ROOT, "dist");
const COOKIE = "sb_admin";
const COOKIE_MAX_AGE = 1000 * 60 * 60 * 18;
const DEFAULT_PASSWORD = process.env.ADMIN_PASSWORD || "r8softball";

const loginAttempts = new Map<string, { count: number; until: number }>();

function emptyTournament(): Tournament {
  const teams = SAMPLE_TEAMS.map((team) => ({ ...team, id: crypto.randomUUID() }));
  const generated = generateMatches(teams, { shuffle: false });
  const settings = defaultSettings();
  settings.closingTime = generated.closingTime;
  return {
    version: BRACKET_VERSION,
    settings,
    teams: generated.teams,
    matches: generated.matches,
    generatedAt: new Date().toISOString(),
  };
}

function readStore(): Tournament {
  if (!fs.existsSync(DATA_PATH)) return emptyTournament();
  const raw = fs.readFileSync(DATA_PATH, "utf8");
  return JSON.parse(raw) as Tournament;
}

function writeStore(data: Tournament): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${DATA_PATH}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, DATA_PATH);
}

function migrateBracket(data: Tournament): Tournament {
  if (data.version === BRACKET_VERSION) return data;
  if (data.teams.length >= 2) {
    const generated = generateMatches(data.teams, { shuffle: false });
    data.teams = generated.teams;
    data.matches = generated.matches;
    data.settings.closingTime = generated.closingTime;
    data.generatedAt = new Date().toISOString();
  }
  data.version = BRACKET_VERSION;
  writeStore(data);
  return data;
}

async function ensureSecrets(data: Tournament): Promise<Tournament> {
  data = migrateBracket(data);
  let changed = false;
  if (!data.settings.sessionSecret) {
    data.settings.sessionSecret = crypto.randomBytes(24).toString("hex");
    changed = true;
  }
  if (!data.settings.adminPasswordHash) {
    data.settings.adminPasswordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
    changed = true;
  }
  if (changed) writeStore(data);
  return data;
}

function pickSettings(body: Record<string, unknown>): Partial<Tournament["settings"]> {
  const next: Partial<Tournament["settings"]> = {};
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

function publicState(data: Tournament): PublicState {
  const resolved = resolveTournament(data);
  const { adminPasswordHash: _h, sessionSecret: _s, ...settings } = resolved.settings;
  return {
    settings,
    teams: resolved.teams,
    matches: resolved.matches,
    generatedAt: resolved.generatedAt,
    standings: standingsOf(resolved),
    warnings: collectWarnings(resolved),
    nowSlot: currentSlot(resolved.matches),
  };
}

function signSession(secret: string, exp: number): string {
  const payload = `${exp}`;
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

function validSession(token: string | undefined, secret: string): boolean {
  if (!token || !secret) return false;
  const [expRaw, sig] = token.split(".");
  if (!expRaw || !sig) return false;
  const expected = crypto.createHmac("sha256", secret).update(expRaw).digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  return Number(expRaw) > Date.now();
}

function requireAdmin(
  req: express.Request,
  res: express.Response,
  data: Tournament,
): boolean {
  if (validSession(req.cookies[COOKIE], data.settings.sessionSecret)) return true;
  res.status(401).json({ error: "管理者としてログインしてください" });
  return false;
}

function clientKey(req: express.Request): string {
  return req.ip || "unknown";
}

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/state", async (_req, res) => {
  const data = await ensureSecrets(readStore());
  res.json(publicState(data));
});

app.get("/api/me", async (req, res) => {
  const data = await ensureSecrets(readStore());
  res.json({
    admin: validSession(req.cookies[COOKIE], data.settings.sessionSecret),
  });
});

app.post("/api/login", async (req, res) => {
  const data = await ensureSecrets(readStore());
  const ip = clientKey(req);
  const gate = loginAttempts.get(ip);
  if (gate && gate.until > Date.now() && gate.count >= 8) {
    res.status(429).json({ error: "試行が多すぎます。しばらく待ってください。" });
    return;
  }
  const password = String(req.body?.password ?? "");
  const ok = await bcrypt.compare(password, data.settings.adminPasswordHash);
  if (!ok) {
    const prev = loginAttempts.get(ip) ?? { count: 0, until: Date.now() + 60_000 };
    prev.count += 1;
    prev.until = Date.now() + 60_000;
    loginAttempts.set(ip, prev);
    res.status(401).json({ error: "パスワードが違います" });
    return;
  }
  loginAttempts.delete(ip);
  const exp = Date.now() + COOKIE_MAX_AGE;
  res.cookie(COOKIE, signSession(data.settings.sessionSecret, exp), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
  res.json({ ok: true });
});

app.post("/api/logout", (_req, res) => {
  res.clearCookie(COOKIE, { path: "/" });
  res.json({ ok: true });
});

app.put("/api/settings", async (req, res) => {
  const data = await ensureSecrets(readStore());
  if (!requireAdmin(req, res, data)) return;
  data.settings = {
    ...data.settings,
    ...pickSettings((req.body ?? {}) as Record<string, unknown>),
  };
  writeStore(data);
  res.json(publicState(data));
});

app.post("/api/password", async (req, res) => {
  const data = await ensureSecrets(readStore());
  if (!requireAdmin(req, res, data)) return;
  const next = String(req.body?.password ?? "");
  if (next.length < 4) {
    res.status(400).json({ error: "パスワードは4文字以上にしてください" });
    return;
  }
  data.settings.adminPasswordHash = await bcrypt.hash(next, 10);
  writeStore(data);
  res.json({ ok: true });
});

app.put("/api/teams", async (req, res) => {
  const data = await ensureSecrets(readStore());
  if (!requireAdmin(req, res, data)) return;
  const incoming = Array.isArray(req.body?.teams) ? (req.body.teams as Team[]) : null;
  if (!incoming || incoming.length < 2 || incoming.length > 32) {
    res.status(400).json({ error: "チーム数は2〜32です" });
    return;
  }
  data.teams = incoming.map((team, i) => ({
    id: team.id || crypto.randomUUID(),
    name: String(team.name || `チーム${i + 1}`).slice(0, 40),
    lab: String(team.lab || "").slice(0, 40),
  }));
  writeStore(data);
  res.json(publicState(data));
});

app.post("/api/teams/sample", async (req, res) => {
  const data = await ensureSecrets(readStore());
  if (!requireAdmin(req, res, data)) return;
  data.teams = SAMPLE_TEAMS.map((t) => ({ ...t, id: crypto.randomUUID() }));
  data.matches = [];
  data.generatedAt = null;
  writeStore(data);
  res.json(publicState(data));
});

app.post("/api/teams/resize", async (req, res) => {
  const data = await ensureSecrets(readStore());
  if (!requireAdmin(req, res, data)) return;
  const count = Number(req.body?.count);
  if (!Number.isInteger(count) || count < 2 || count > 32) {
    res.status(400).json({ error: "チーム数は2〜32です" });
    return;
  }
  data.teams = createTeams(count, data.teams);
  data.matches = [];
  data.generatedAt = null;
  writeStore(data);
  res.json(publicState(data));
});

app.post("/api/generate", async (req, res) => {
  const data = await ensureSecrets(readStore());
  if (!requireAdmin(req, res, data)) return;
  const shuffle = Boolean(req.body?.shuffle);
  try {
    const { matches, closingTime, teams } = generateMatches(data.teams, { shuffle });
    data.teams = teams;
    data.matches = matches;
    data.generatedAt = new Date().toISOString();
    data.settings.closingTime = closingTime;
    writeStore(data);
    res.json(publicState(data));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "生成に失敗しました" });
  }
});

app.post("/api/matches/:id/result", async (req, res) => {
  const data = await ensureSecrets(readStore());
  if (!requireAdmin(req, res, data)) return;
  try {
    const next = applyMatchResult(data, req.params.id, {
      score1: req.body?.score1 === null || req.body?.score1 === undefined ? null : Number(req.body.score1),
      score2: req.body?.score2 === null || req.body?.score2 === undefined ? null : Number(req.body.score2),
      winnerId: req.body?.winnerId ?? null,
      decidedBy: req.body?.decidedBy ?? null,
    });
    writeStore(next);
    res.json(publicState(next));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "記録に失敗しました" });
  }
});

app.patch("/api/matches/:id", async (req, res) => {
  const data = await ensureSecrets(readStore());
  if (!requireAdmin(req, res, data)) return;
  const match = data.matches.find((m) => m.id === req.params.id);
  if (!match) {
    res.status(404).json({ error: "試合が見つかりません" });
    return;
  }
  const body = req.body ?? {};
  if (typeof body.startTime === "string") match.startTime = body.startTime;
  if (typeof body.endTime === "string") match.endTime = body.endTime;
  if (typeof body.code === "string") match.code = body.code;
  if (typeof body.innings === "number") match.innings = body.innings;
  if (typeof body.timeLimitMin === "number") match.timeLimitMin = body.timeLimitMin;
  if (typeof body.lastInningAtMin === "number") match.lastInningAtMin = body.lastInningAtMin;
  if (body.refereeSource) match.refereeSource = body.refereeSource;
  if (body.refereeTeamId !== undefined) {
    match.refereeTeamId = body.refereeTeamId;
    if (body.refereeTeamId) {
      match.refereeSource = { kind: "team", teamId: body.refereeTeamId };
    } else if (!body.refereeSource) {
      match.refereeSource = { kind: "staff" };
    }
  }
  writeStore(data);
  res.json(publicState(data));
});

if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api")) {
      next();
      return;
    }
    res.sendFile(path.join(DIST_DIR, "index.html"));
  });
}

const port = Number(process.env.PORT || 3000);
const server = app.listen(port, "0.0.0.0", () => {
  console.log(`softball tournament listening on http://0.0.0.0:${port}`);
  console.log(`閲覧: http://localhost:${port}/`);
  console.log(`ルール: http://localhost:${port}/rules`);
  console.log(`運営: http://localhost:${port}/admin`);
});

server.on("error", (error) => {
  console.error(error);
  process.exit(1);
});
