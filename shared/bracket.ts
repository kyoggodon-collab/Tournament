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
export const BRACKET_VERSION = 5;
const LOSER_MARKS = "イロハニホヘトチリヌルヲワカヨタレソツネナラムウヰノオクヤマケフコエテアサキユメミシヱヒモセス";

type Built =
  | { type: "leaf"; source: Source; leafStart: number; leafSpan: number }
  | {
      type: "match";
      id: string;
      venue: Venue;
      kind: MatchKind;
      roundIndex: number;
      leafStart: number;
      leafSpan: number;
      child1: Built;
      child2: Built;
    };

type DraftMatch = {
  id: string;
  venue: Venue;
  kind: MatchKind;
  group: Venue | "finals" | "consolation";
  roundIndex: number;
  roundLabel: string;
  leafStart: number;
  innings: number;
  timeLimitMin: number;
  lastInningAtMin: number;
  source1: Source;
  source2: Source;
  team1Id: string | null;
  team2Id: string | null;
};

function rulesFor(kind: MatchKind): {
  innings: number;
  timeLimitMin: number;
  lastInningAtMin: number;
} {
  if (kind === "grandFinal") return { innings: 7, timeLimitMin: 60, lastInningAtMin: 55 };
  if (kind === "thirdPlace") return { innings: 5, timeLimitMin: 40, lastInningAtMin: 35 };
  if (kind === "consolation") return { innings: 3, timeLimitMin: 25, lastInningAtMin: 20 };
  return { innings: 3, timeLimitMin: 30, lastInningAtMin: 25 };
}

function sourceTeamId(source: Source): string | null {
  return source.kind === "team" ? source.teamId : null;
}

export function splitVenueGroups(teams: Team[]): { A: Team[]; B: Team[] } {
  const aCount = Math.ceil(teams.length / 2);
  return { A: teams.slice(0, aCount), B: teams.slice(aCount) };
}

function leafOf(source: Source): Built {
  return { type: "leaf", source, leafStart: 0, leafSpan: 1 };
}

function matchOf(child1: Built, child2: Built, id: string, venue: Venue): Built {
  return {
    type: "match",
    id,
    venue,
    kind: "venue",
    roundIndex: 0,
    leafStart: 0,
    leafSpan: 1,
    child1,
    child2,
  };
}

function firstRound(entries: Source[], plays: number, byes: number, index: { i: number }, idOf: () => string, venue: Venue): Built[] {
  const total = plays + byes;
  const playAt = new Set<number>();
  for (let play = 0; play < plays; play++) playAt.add(Math.floor((play * total) / plays));
  const nodes: Built[] = [];
  for (let slot = 0; slot < total; slot++) {
    if (playAt.has(slot)) {
      const left = entries[index.i++];
      const right = entries[index.i++];
      nodes.push(matchOf(leafOf(left), leafOf(right), idOf(), venue));
    } else {
      nodes.push(leafOf(entries[index.i++]));
    }
  }
  return nodes;
}

function perfect(nodes: Built[], idOf: () => string, venue: Venue): Built {
  if (nodes.length === 1) return nodes[0];
  const mid = nodes.length / 2;
  return matchOf(perfect(nodes.slice(0, mid), idOf, venue), perfect(nodes.slice(mid), idOf, venue), idOf(), venue);
}

function buildEntries(entries: Source[], idOf: () => string, venue: Venue): Built | null {
  if (entries.length === 0) return null;
  if (entries.length === 1) return leafOf(entries[0]);
  if (entries.length === 2) return matchOf(leafOf(entries[0]), leafOf(entries[1]), idOf(), venue);

  const pairSlots = 1 << (Math.ceil(Math.log2(entries.length)) - 1);
  const byeSlots = pairSlots * 2 - entries.length;
  const half = pairSlots / 2;
  let rightByes = Math.ceil(byeSlots / 2);
  let leftByes = byeSlots - rightByes;
  if (leftByes > half) {
    rightByes += leftByes - half;
    leftByes = half;
  }
  if (rightByes > half) {
    leftByes += rightByes - half;
    rightByes = half;
  }
  const index = { i: 0 };
  const advancers = [
    ...firstRound(entries, half - leftByes, leftByes, index, idOf, venue),
    ...firstRound(entries, half - rightByes, rightByes, index, idOf, venue),
  ];
  return perfect(advancers, idOf, venue);
}

function measure(node: Built, leafStart: number): number {
  node.leafStart = leafStart;
  if (node.type === "leaf") {
    node.leafSpan = 1;
    return leafStart + 1;
  }
  const mid = measure(node.child1, leafStart);
  const end = measure(node.child2, mid);
  node.leafSpan = end - leafStart;
  node.roundIndex = Math.max(roundOf(node.child1), roundOf(node.child2)) + 1;
  return end;
}

function roundOf(node: Built): number {
  return node.type === "leaf" ? -1 : node.roundIndex;
}

function championSource(node: Built | null): Source | null {
  if (!node) return null;
  if (node.type === "leaf") return node.source;
  return { kind: "winner", matchId: node.id };
}

function flatten(node: Built | null, into: Built[]): void {
  if (!node || node.type === "leaf") return;
  flatten(node.child1, into);
  flatten(node.child2, into);
  into.push(node);
}

function toDraft(node: Built & { type: "match" }, label: string): DraftMatch {
  const source1 = championSource(node.child1)!;
  const source2 = championSource(node.child2)!;
  return {
    id: node.id,
    venue: node.venue,
    kind: node.kind,
    group: node.venue,
    roundIndex: node.roundIndex,
    roundLabel: label,
    leafStart: node.leafStart,
    ...rulesFor(node.kind),
    source1,
    source2,
    team1Id: sourceTeamId(source1),
    team2Id: sourceTeamId(source2),
  };
}

function byRound(matches: DraftMatch[]): DraftMatch[] {
  return [...matches].sort((a, b) => a.roundIndex - b.roundIndex || a.leafStart - b.leafStart);
}

function consolationHalf(node: Built | null, drafts: DraftMatch[]): DraftMatch[] {
  const ids = new Set<string>();
  const walk = (current: Built | null) => {
    if (!current || current.type === "leaf") return;
    ids.add(current.id);
    walk(current.child1);
    walk(current.child2);
  };
  walk(node);
  return byRound(drafts.filter((draft) => ids.has(draft.id) && draft.kind === "consolation"));
}

function subtreeSize(node: Built): number {
  return node.leafSpan;
}

function consecutiveIds(node: Built | null): string[] {
  if (!node || node.type === "leaf") return [];
  const leftSize = subtreeSize(node.child1);
  const rightSize = subtreeSize(node.child2);
  const first = rightSize < leftSize ? node.child2 : node.child1;
  const second = first === node.child1 ? node.child2 : node.child1;
  return [...consecutiveIds(first), ...consecutiveIds(second), node.id];
}

function consecutiveOrder(root: Built | null, drafts: DraftMatch[]): DraftMatch[] {
  const byId = new Map(drafts.map((draft) => [draft.id, draft]));
  return consecutiveIds(root).flatMap((id) => {
    const draft = byId.get(id);
    return draft ? [draft] : [];
  });
}

function slotDuration(drafts: DraftMatch[], slot: number, slotOf: Map<string, number>): number {
  const inSlot = drafts.filter((m) => slotOf.get(m.id) === slot);
  if (inSlot.some((m) => m.kind === "grandFinal")) return 60;
  return 40;
}

function buildSlotTimes(slotOf: Map<string, number>, drafts: DraftMatch[], slotCount: number) {
  const slots: { start: string; end: string }[] = [];
  let cursor = FIRST_SLOT_MINUTES;
  for (let i = 0; i < slotCount; i++) {
    const duration = slotDuration(drafts, i, slotOf);
    slots.push({ start: formatMinutes(cursor), end: formatMinutes(cursor + duration) });
    cursor += duration + GAP_MINUTES;
  }
  return slots;
}

function loserPlaysInSlot(matchId: string, slot: number, drafts: DraftMatch[], slotOf: Map<string, number>): boolean {
  return drafts.some(
    (m) =>
      slotOf.get(m.id) === slot &&
      ((m.source1.kind === "loser" && m.source1.matchId === matchId) ||
        (m.source2.kind === "loser" && m.source2.matchId === matchId)),
  );
}

function assignReferees(drafts: DraftMatch[], slotOf: Map<string, number>): Map<string, RefereeSource> {
  const refs = new Map<string, RefereeSource>();
  for (const venue of ["A", "B"] as Venue[]) {
    const seq = drafts
      .filter((m) => m.venue === venue)
      .sort((a, b) => (slotOf.get(a.id) ?? 0) - (slotOf.get(b.id) ?? 0) || a.leafStart - b.leafStart);
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

function assignOpeningReferees(
  drafts: DraftMatch[],
  slotOf: Map<string, number>,
  refs: Map<string, RefereeSource>,
  groups: { A: Team[]; B: Team[] },
): void {
  for (const venue of ["A", "B"] as Venue[]) {
    const group = groups[venue];
    for (const match of drafts.filter((m) => m.venue === venue)) {
      if (refs.get(match.id)?.kind !== "staff") continue;
      const slot = slotOf.get(match.id);
      const busy = new Set<string>();
      for (const other of drafts) {
        if (slotOf.get(other.id) !== slot) continue;
        if (other.source1.kind === "team") busy.add(other.source1.teamId);
        if (other.source2.kind === "team") busy.add(other.source2.teamId);
      }
      const free = group.find((team) => !busy.has(team.id));
      if (free) refs.set(match.id, { kind: "team", teamId: free.id });
    }
  }
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
  if (teams.length < 2) throw new Error("チームは2以上必要です");
  const ordered = options.shuffle ? shuffleTeams(teams) : [...teams];
  const groups = splitVenueGroups(ordered);
  const warnings: string[] = [];
  let seq = 0;
  const nextId = (prefix: string) => () => `${prefix}-${seq++}`;

  const sideA = buildEntries(groups.A.map((t) => ({ kind: "team", teamId: t.id })), nextId("a"), "A");
  const sideB = buildEntries(groups.B.map((t) => ({ kind: "team", teamId: t.id })), nextId("b"), "B");
  if (sideA) measure(sideA, 0);
  if (sideB) measure(sideB, 0);

  const aNodes: Built[] = [];
  const bNodes: Built[] = [];
  flatten(sideA, aNodes);
  flatten(sideB, bNodes);
  const aDrafts = (aNodes.filter((n) => n.type === "match") as Extract<Built, { type: "match" }>[]).map((n) =>
    toDraft(n, "本戦"),
  );
  const bDrafts = (bNodes.filter((n) => n.type === "match") as Extract<Built, { type: "match" }>[]).map((n) =>
    toDraft(n, "本戦"),
  );
  for (const list of [aDrafts, bDrafts]) {
    if (list.length === 0) continue;
    const top = Math.max(...list.map((m) => m.roundIndex));
    for (const match of list) {
      if (match.roundIndex === top) {
        match.roundLabel = "会場決勝";
        Object.assign(match, rulesFor("venue"));
        match.innings = 5;
        match.timeLimitMin = 40;
        match.lastInningAtMin = 35;
      }
    }
  }

  const aOrder = consecutiveOrder(sideA, aDrafts);
  const bOrder = consecutiveOrder(sideB, bDrafts);
  const prelimSlots = Math.max(aOrder.length, bOrder.length, 0);
  const slotOf = new Map<string, number>();
  aOrder.forEach((match, index) => slotOf.set(match.id, index));
  bOrder.forEach((match, index) => slotOf.set(match.id, index));

  const seeds: DraftMatch[] = [];
  for (let i = 0; i < prelimSlots; i++) {
    if (aOrder[i]) seeds.push(aOrder[i]);
    if (bOrder[i]) seeds.push(bOrder[i]);
  }

  const consolationRoot =
    seeds.length >= 2
      ? buildEntries(
          seeds.map((match) => ({ kind: "loser" as const, matchId: match.id })),
          nextId("c"),
          "A",
        )
      : null;
  if (consolationRoot) measure(consolationRoot, 0);
  const cNodes: Built[] = [];
  flatten(consolationRoot, cNodes);
  const cMatches = cNodes.filter((n) => n.type === "match") as Extract<Built, { type: "match" }>[];
  if (cMatches.length > 0) {
    const root = cMatches[cMatches.length - 1];
    root.kind = "thirdPlace";
    for (const match of cMatches) {
      if (match !== root) match.kind = "consolation";
    }
  }
  const cDrafts = cMatches.map((n) => toDraft(n, n.kind === "thirdPlace" ? "3位決定戦" : "3位決定戦"));
  const consolationSide = consolationRoot?.type === "match" ? consolationRoot : null;
  const leftHalf = consolationHalf(consolationSide?.child1 ?? null, cDrafts);
  const rightHalf = consolationHalf(consolationSide?.child2 ?? null, cDrafts);
  const halfRows = Math.max(leftHalf.length, rightHalf.length);
  for (let index = 0; index < halfRows; index++) {
    const row: [DraftMatch | undefined, Venue][] = [
      [leftHalf[index], "A"],
      [rightHalf[index], "B"],
    ];
    for (const [match, venue] of row) {
      if (!match) continue;
      match.venue = venue;
      match.group = "consolation";
      slotOf.set(match.id, prelimSlots + index);
    }
  }
  const third = cDrafts.find((m) => m.kind === "thirdPlace");
  const finalSlot = prelimSlots + halfRows;

  const drafts: DraftMatch[] = [...aDrafts, ...bDrafts, ...cDrafts];
  const champA = championSource(sideA);
  const champB = championSource(sideB);
  if (champA && champB) {
    const grand: DraftMatch = {
      id: "m-grand-final",
      venue: "A",
      kind: "grandFinal",
      group: "finals",
      roundIndex: 100,
      roundLabel: "優勝決定戦",
      leafStart: 0,
      ...rulesFor("grandFinal"),
      source1: champA,
      source2: champB,
      team1Id: sourceTeamId(champA),
      team2Id: sourceTeamId(champB),
    };
    drafts.push(grand);
    slotOf.set(grand.id, finalSlot);
  }
  if (third) {
    third.venue = "B";
    third.group = "finals";
    slotOf.set(third.id, finalSlot);
  }

  if (seeds.length === 1) {
    warnings.push("敗退が1チームだけのため、3位決定戦の対戦はありません。");
  }
  const slotCount = drafts.length === 0 ? 0 : Math.max(...slotOf.values()) + 1;
  if (slotCount > COMFORTABLE_SLOTS) {
    warnings.push(`試合枠が${slotCount}あります。紙の8枠より長くなります。終了時刻を確認してください。`);
  }

  const refs = assignReferees(drafts, slotOf);
  assignOpeningReferees(drafts, slotOf, refs, groups);
  const slotTimes = buildSlotTimes(slotOf, drafts, slotCount);
  const markOf = new Map<string, string>();
  seeds.forEach((match, index) => markOf.set(match.id, LOSER_MARKS[index] ?? String(index + 1)));

  const matches: Match[] = drafts.map((draft) => {
    const slot = slotOf.get(draft.id) ?? 0;
    const time = slotTimes[slot] ?? { start: "09:20", end: "10:00" };
    const refereeSource = refs.get(draft.id) ?? { kind: "staff" as const };
    return {
      id: draft.id,
      venue: draft.venue,
      kind: draft.kind,
      group: draft.group === "consolation" ? draft.venue : draft.group,
      roundIndex: draft.roundIndex,
      roundLabel: draft.roundLabel,
      source1: draft.source1,
      source2: draft.source2,
      team1Id: draft.team1Id,
      team2Id: draft.team2Id,
      slot,
      code: matchCode(slot, draft.venue),
      startTime: time.start,
      endTime: time.end,
      innings: draft.innings,
      timeLimitMin: draft.timeLimitMin,
      lastInningAtMin: draft.lastInningAtMin,
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
  const closingTime = lastEnd ? formatMinutes(parseMinutes(lastEnd) + 20) : "16:30";
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
  const matches = resolveTournament(tournament).matches.map((m) => ({ ...m }));
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
