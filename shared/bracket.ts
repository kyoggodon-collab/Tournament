import { matchCode, formatMinutes, parseMinutes } from "./time.js";
import type {
  GenerateOptions,
  Match,
  MatchKind,
  RefereeSource,
  Source,
  Standings,
  Team,
  Tournament,
  TournamentSettings,
  Venue,
} from "./types.js";

const FIRST_SLOT_MINUTES = parseMinutes("09:20");
const GAP_MINUTES = 10;
const COMFORTABLE_SLOTS = 8;

type Node = { kind: "team"; teamId: string } | { kind: "winner"; matchId: string };

type DraftMatch = {
  id: string;
  venue: Venue;
  kind: MatchKind;
  group: Venue | "finals";
  roundIndex: number;
  roundLabel: string;
  innings: number;
  timeLimitMin: number;
  lastInningAtMin: number;
  source1: Source;
  source2: Source;
  team1Id: string | null;
  team2Id: string | null;
};

function nodeToSource(node: Node): Source {
  return node.kind === "team"
    ? { kind: "team", teamId: node.teamId }
    : { kind: "winner", matchId: node.matchId };
}

function sourceTeamId(source: Source): string | null {
  return source.kind === "team" ? source.teamId : null;
}

function rulesFor(kind: MatchKind, isVenueFinal: boolean): {
  innings: number;
  timeLimitMin: number;
  lastInningAtMin: number;
} {
  if (kind === "grandFinal") {
    return { innings: 7, timeLimitMin: 60, lastInningAtMin: 55 };
  }
  if (kind === "thirdPlace") {
    return { innings: 5, timeLimitMin: 40, lastInningAtMin: 35 };
  }
  if (isVenueFinal) {
    return { innings: 5, timeLimitMin: 40, lastInningAtMin: 35 };
  }
  return { innings: 3, timeLimitMin: 30, lastInningAtMin: 25 };
}

function roundLabelFor(distanceFromFinal: number, isVenueFinal: boolean): string {
  if (isVenueFinal) return "会場決勝";
  if (distanceFromFinal === 1) return "準決勝";
  if (distanceFromFinal === 2) return "準々決勝";
  return `${distanceFromFinal + 1}回戦`;
}

export function splitVenueGroups(teams: Team[]): { A: Team[]; B: Team[] } {
  const aCount = Math.ceil(teams.length / 2);
  return { A: teams.slice(0, aCount), B: teams.slice(aCount) };
}

function buildVenueDraft(teams: Team[], venue: Venue): {
  matches: DraftMatch[];
  champion: Node | null;
  venueFinalId: string | null;
} {
  if (teams.length === 0) {
    return { matches: [], champion: null, venueFinalId: null };
  }
  if (teams.length === 1) {
    return {
      matches: [],
      champion: { kind: "team", teamId: teams[0].id },
      venueFinalId: null,
    };
  }

  const drafts: DraftMatch[] = [];
  let roundParticipants: Node[] = teams.map((t) => ({ kind: "team" as const, teamId: t.id }));
  let roundIndex = 0;

  while (roundParticipants.length > 1) {
    const next: Node[] = [];
    const roundNodes = [...roundParticipants];
    if (roundNodes.length % 2 === 1) {
      next.push(roundNodes[0]);
      roundNodes.shift();
    }
    for (let i = 0; i < roundNodes.length; i += 2) {
      const id = `m-${venue}-r${roundIndex}-${i / 2}`;
      const source1 = nodeToSource(roundNodes[i]);
      const source2 = nodeToSource(roundNodes[i + 1]);
      drafts.push({
        id,
        venue,
        kind: "venue",
        group: venue,
        roundIndex,
        roundLabel: "",
        ...rulesFor("venue", false),
        source1,
        source2,
        team1Id: sourceTeamId(source1),
        team2Id: sourceTeamId(source2),
      });
      next.push({ kind: "winner", matchId: id });
    }
    roundParticipants = next;
    roundIndex += 1;
  }

  const maxRound = Math.max(...drafts.map((m) => m.roundIndex));
  for (const match of drafts) {
    const isVenueFinal = match.roundIndex === maxRound;
    const distanceFromFinal = maxRound - match.roundIndex;
    match.roundLabel = roundLabelFor(distanceFromFinal, isVenueFinal);
    Object.assign(match, rulesFor("venue", isVenueFinal));
  }

  const venueFinalId = drafts.find((m) => m.roundIndex === maxRound)?.id ?? null;
  const champion = roundParticipants[0] ?? null;
  return { matches: drafts, champion, venueFinalId };
}

function scheduleDrafts(drafts: DraftMatch[]): {
  slotOf: Map<string, number>;
  slotCount: number;
} {
  const slotOf = new Map<string, number>();
  const nextSlot: Record<Venue, number> = { A: 0, B: 0 };

  const venueMatches = drafts
    .filter((m) => m.kind === "venue")
    .sort((a, b) => a.roundIndex - b.roundIndex || a.venue.localeCompare(b.venue) || a.id.localeCompare(b.id));

  for (const match of venueMatches) {
    const slot = nextSlot[match.venue];
    slotOf.set(match.id, slot);
    nextSlot[match.venue] = slot + 1;
  }

  const finalsSlot = Math.max(nextSlot.A, nextSlot.B, 0);
  for (const match of drafts.filter((m) => m.kind !== "venue")) {
    slotOf.set(match.id, finalsSlot);
  }

  const slotCount = drafts.length === 0 ? 0 : Math.max(...slotOf.values()) + 1;
  return { slotOf, slotCount };
}

function slotDuration(drafts: DraftMatch[], slot: number, slotOf: Map<string, number>): number {
  const inSlot = drafts.filter((m) => slotOf.get(m.id) === slot);
  if (inSlot.some((m) => m.kind === "grandFinal")) return 60;
  const longest = Math.max(40, ...inSlot.map((m) => m.timeLimitMin + 10));
  return longest;
}

function buildSlotTimes(
  drafts: DraftMatch[],
  slotOf: Map<string, number>,
  slotCount: number,
): { start: string; end: string }[] {
  const slots: { start: string; end: string }[] = [];
  let cursor = FIRST_SLOT_MINUTES;
  for (let i = 0; i < slotCount; i++) {
    const duration = slotDuration(drafts, i, slotOf);
    slots.push({
      start: formatMinutes(cursor),
      end: formatMinutes(cursor + duration),
    });
    cursor += duration + GAP_MINUTES;
  }
  return slots;
}

function loserPlaysInSlot(
  matchId: string,
  slot: number,
  drafts: DraftMatch[],
  slotOf: Map<string, number>,
): boolean {
  return drafts.some(
    (m) =>
      slotOf.get(m.id) === slot &&
      ((m.source1.kind === "loser" && m.source1.matchId === matchId) ||
        (m.source2.kind === "loser" && m.source2.matchId === matchId)),
  );
}

function assignReferees(
  drafts: DraftMatch[],
  slotOf: Map<string, number>,
): Map<string, RefereeSource> {
  const refs = new Map<string, RefereeSource>();
  for (const venue of ["A", "B"] as Venue[]) {
    const seq = drafts
      .filter((m) => m.venue === venue)
      .sort((a, b) => (slotOf.get(a.id) ?? 0) - (slotOf.get(b.id) ?? 0) || a.id.localeCompare(b.id));

    const previous: DraftMatch[] = [];
    for (const match of seq) {
      const slot = slotOf.get(match.id) ?? 0;
      let assigned: RefereeSource = { kind: "staff" };
      for (let i = previous.length - 1; i >= 0; i--) {
        const prev = previous[i];
        if (loserPlaysInSlot(prev.id, slot, drafts, slotOf)) continue;
        assigned = { kind: "loser", matchId: prev.id };
        break;
      }
      refs.set(match.id, assigned);
      previous.push(match);
    }
  }
  return refs;
}

function shuffleTeams(teams: Team[]): Team[] {
  const copy = [...teams];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function generateMatches(
  teams: Team[],
  options: GenerateOptions = { shuffle: false },
): { matches: Match[]; warnings: string[]; closingTime: string; teams: Team[] } {
  if (teams.length < 2) {
    throw new Error("チームは2以上必要です");
  }

  const ordered = options.shuffle ? shuffleTeams(teams) : [...teams];
  const groups = splitVenueGroups(ordered);
  const warnings: string[] = [];

  const a = buildVenueDraft(groups.A, "A");
  const b = buildVenueDraft(groups.B, "B");
  const drafts: DraftMatch[] = [...a.matches, ...b.matches];

  if (a.champion && b.champion) {
    drafts.push({
      id: "m-grand-final",
      venue: "A",
      kind: "grandFinal",
      group: "finals",
      roundIndex: 100,
      roundLabel: "優勝決定戦",
      ...rulesFor("grandFinal", false),
      source1: nodeToSource(a.champion),
      source2: nodeToSource(b.champion),
      team1Id: sourceTeamId(nodeToSource(a.champion)),
      team2Id: sourceTeamId(nodeToSource(b.champion)),
    });
  }

  if (a.venueFinalId && b.venueFinalId) {
    drafts.push({
      id: "m-third-place",
      venue: "B",
      kind: "thirdPlace",
      group: "finals",
      roundIndex: 100,
      roundLabel: "3位決定戦",
      ...rulesFor("thirdPlace", false),
      source1: { kind: "loser", matchId: a.venueFinalId },
      source2: { kind: "loser", matchId: b.venueFinalId },
      team1Id: null,
      team2Id: null,
    });
  } else if (groups.A.length >= 2 && groups.B.length === 0) {
    warnings.push("会場Bにチームが割り当てられなかったため、全試合を会場Aで行います。");
  }

  if (groups.B.length === 1 && groups.A.length >= 2) {
    warnings.push("会場Bは1チームのため予選なし。A会場勝者との優勝決定戦のみ移動します。");
  }

  const { slotOf, slotCount } = scheduleDrafts(drafts);
  if (slotCount > COMFORTABLE_SLOTS) {
    warnings.push(
      `試合進行が${slotCount}枠になるため、従来の8枠日程より延長しています。開始時刻は管理画面で調整できます。`,
    );
  }

  const slotTimes = buildSlotTimes(drafts, slotOf, slotCount);
  const refs = assignReferees(drafts, slotOf);

  const MARKS = "イロハニホヘトチリヌルヲワカヨタレソツネナラムウヰノオクヤマケフコエテアサキユメミシヱヒモセス";
  const orderedDrafts = [...drafts].sort(
    (a, b) => (slotOf.get(a.id) ?? 0) - (slotOf.get(b.id) ?? 0) || a.venue.localeCompare(b.venue),
  );
  const markOf = new Map<string, string>();
  let markIndex = 0;
  for (const draft of orderedDrafts) {
    if (draft.kind === "venue") {
      markOf.set(draft.id, MARKS[markIndex] ?? String(markIndex + 1));
      markIndex += 1;
    }
  }

  const matches: Match[] = drafts.map((draft) => {
    const slot = slotOf.get(draft.id) ?? 0;
    const time = slotTimes[slot] ?? { start: "09:20", end: "10:00" };
    const refereeSource = refs.get(draft.id) ?? { kind: "staff" as const };
    return {
      ...draft,
      slot,
      code: matchCode(slot, draft.venue),
      startTime: time.start,
      endTime: time.end,
      refereeSource,
      refereeTeamId: refereeSource.kind === "team" ? refereeSource.teamId : null,
      score1: null,
      score2: null,
      winnerId: null,
      decidedBy: null,
      loserMark: markOf.get(draft.id) ?? null,
    };
  });

  const lastEnd = slotTimes[slotTimes.length - 1]?.end;
  const closingTime = lastEnd
    ? formatMinutes(parseMinutes(lastEnd) + 20)
    : "16:30";

  return { matches, warnings, closingTime, teams: ordered };
}

export function defaultSettings(): TournamentSettings {
  return {
    title: "令和8年度 研究室対抗ソフトボール大会",
    date: "2026-10-13",
    venueAName: "ソフトボール場（体育館の方）",
    venueBName: "多目的広場（芝生）",
    openingTime: "09:00",
    openingVenue: "A",
    closingTime: "16:30",
    closingVenue: "A",
    adminPasswordHash: "",
    sessionSecret: "",
  };
}

export function createTeams(count: number, existing: Team[] = []): Team[] {
  const next: Team[] = [];
  for (let i = 0; i < count; i++) {
    if (existing[i]) {
      next.push(existing[i]);
    } else {
      next.push({
        id: crypto.randomUUID(),
        name: `チーム${i + 1}`,
        lab: "",
      });
    }
  }
  return next;
}

function sourceDependsOn(source: Source, matchId: string, matches: Match[]): boolean {
  if (source.kind === "team") return false;
  if (source.matchId === matchId) return true;
  const parent = matches.find((m) => m.id === source.matchId);
  if (!parent) return false;
  return (
    sourceDependsOn(parent.source1, matchId, matches) ||
    sourceDependsOn(parent.source2, matchId, matches)
  );
}

export function dependentMatchIds(matchId: string, matches: Match[]): string[] {
  return matches
    .filter(
      (m) =>
        m.id !== matchId &&
        (sourceDependsOn(m.source1, matchId, matches) ||
          sourceDependsOn(m.source2, matchId, matches)),
    )
    .map((m) => m.id);
}

export function resolveSourceTeamId(
  source: Source,
  matches: Match[],
): string | null {
  if (source.kind === "team") return source.teamId;
  const parent = matches.find((m) => m.id === source.matchId);
  if (!parent?.winnerId || !parent.team1Id || !parent.team2Id) return null;
  if (source.kind === "winner") return parent.winnerId;
  return parent.winnerId === parent.team1Id ? parent.team2Id : parent.team1Id;
}

export function resolveRefereeTeamId(
  source: RefereeSource,
  matches: Match[],
): string | null {
  if (source.kind === "staff") return null;
  if (source.kind === "team") return source.teamId;
  return resolveSourceTeamId({ kind: "loser", matchId: source.matchId }, matches);
}

function impliedWinner(match: Match): string | null {
  if (match.decidedBy === "janken" || match.decidedBy === "forfeit") {
    return match.winnerId;
  }
  if (match.score1 === null || match.score2 === null) return match.winnerId;
  if (match.score1 > match.score2) return match.team1Id;
  if (match.score2 > match.score1) return match.team2Id;
  return match.winnerId;
}

export function resolveTournament(tournament: Tournament): Tournament {
  const matches = tournament.matches.map((m) => ({ ...m }));
  for (let pass = 0; pass < matches.length + 2; pass++) {
    for (const match of matches) {
      match.team1Id = resolveSourceTeamId(match.source1, matches);
      match.team2Id = resolveSourceTeamId(match.source2, matches);
      match.winnerId = impliedWinner(match);
      match.refereeTeamId = resolveRefereeTeamId(match.refereeSource, matches);
      match.loserMark = match.loserMark ?? null;
    }
  }
  return { ...tournament, matches };
}

export function applyMatchResult(
  tournament: Tournament,
  matchId: string,
  payload: {
    score1: number | null;
    score2: number | null;
    winnerId: string | null;
    decidedBy: Match["decidedBy"];
  },
): Tournament {
  const matches = tournament.matches.map((m) => ({ ...m }));
  const target = matches.find((m) => m.id === matchId);
  if (!target) throw new Error("試合が見つかりません");

  const previousWinner = target.winnerId;
  const clearing = payload.winnerId === null && payload.score1 === null && payload.score2 === null;

  let score1 = payload.score1;
  let score2 = payload.score2;
  let winnerId = payload.winnerId;
  let decidedBy = payload.decidedBy;

  if (!clearing && score1 !== null && score2 !== null && score1 !== score2) {
    if (!target.team1Id || !target.team2Id) {
      throw new Error("対戦チームがまだ決まっていません");
    }
    winnerId = score1 > score2 ? target.team1Id : target.team2Id;
    decidedBy = "score";
  }

  if (!clearing && score1 !== null && score2 !== null && score1 === score2) {
    if (decidedBy !== "janken" && decidedBy !== "forfeit") {
      throw new Error("同点のときはじゃんけんか不戦勝で勝者を指定してください");
    }
    if (!winnerId) {
      throw new Error("同点のときは勝者を指定してください");
    }
  }

  if (!clearing && decidedBy === "forfeit" && !winnerId) {
    throw new Error("不戦勝のチームを指定してください");
  }

  target.score1 = score1;
  target.score2 = score2;
  target.winnerId = winnerId;
  target.decidedBy = decidedBy;

  if (clearing || previousWinner !== impliedWinner(target)) {
    const deps = new Set(dependentMatchIds(matchId, matches));
    for (const match of matches) {
      if (!deps.has(match.id)) continue;
      match.score1 = null;
      match.score2 = null;
      match.winnerId = null;
      match.decidedBy = null;
    }
  }

  return resolveTournament({ ...tournament, matches });
}

export function standingsOf(tournament: Tournament): Standings {
  const resolved = resolveTournament(tournament);
  const grand = resolved.matches.find((m) => m.kind === "grandFinal");
  const third = resolved.matches.find((m) => m.kind === "thirdPlace");
  const championId = grand?.winnerId ?? null;
  let runnerUpId: string | null = null;
  if (grand?.winnerId && grand.team1Id && grand.team2Id) {
    runnerUpId = grand.winnerId === grand.team1Id ? grand.team2Id : grand.team1Id;
  }
  const thirdId = third?.winnerId ?? null;
  let fourthId: string | null = null;
  if (third?.winnerId && third.team1Id && third.team2Id) {
    fourthId = third.winnerId === third.team1Id ? third.team2Id : third.team1Id;
  }
  return { championId, runnerUpId, thirdId, fourthId };
}

export function collectWarnings(tournament: Tournament): string[] {
  const warnings: string[] = [];
  const slots = new Set(tournament.matches.map((m) => m.slot));
  if (slots.size > COMFORTABLE_SLOTS) {
    warnings.push(`試合枠が${slots.size}あります。終了時刻をご確認ください。`);
  }
  return warnings;
}

export function currentSlot(matches: Match[], now = new Date()): number | null {
  if (matches.length === 0) return null;
  const minutes = now.getHours() * 60 + now.getMinutes();
  const bySlot = new Map<number, Match[]>();
  for (const match of matches) {
    const list = bySlot.get(match.slot) ?? [];
    list.push(match);
    bySlot.set(match.slot, list);
  }
  const slots = [...bySlot.keys()].sort((a, b) => a - b);
  for (const slot of slots) {
    const games = bySlot.get(slot)!;
    const start = parseMinutes(games[0].startTime);
    const end = parseMinutes(games[0].endTime);
    if (minutes >= start && minutes < end) return slot;
  }
  return null;
}

export function possibleTeamsForMatch(match: Match, matches: Match[]): string[] {
  const walk = (source: Source): string[] => {
    if (source.kind === "team") return [source.teamId];
    const parent = matches.find((m) => m.id === source.matchId);
    if (!parent) return [];
    const fromParent = [
      ...walk(parent.source1),
      ...walk(parent.source2),
    ];
    return [...new Set(fromParent)];
  };
  return [...new Set([...walk(match.source1), ...walk(match.source2)])];
}

export function buildingGroups(teams: Team[]): { A: Team[]; B: Team[] } {
  return splitVenueGroups(teams);
}
