export type Venue = "A" | "B";

export type Source =
  | { kind: "team"; teamId: string }
  | { kind: "winner"; matchId: string }
  | { kind: "loser"; matchId: string };

export type RefereeSource =
  | { kind: "staff" }
  | { kind: "team"; teamId: string }
  | { kind: "loser"; matchId: string };

export type MatchKind = "venue" | "grandFinal" | "thirdPlace";

export type DecidedBy = "score" | "janken" | "forfeit" | null;

export type Team = {
  id: string;
  name: string;
  lab: string;
};

export type Match = {
  id: string;
  code: string;
  slot: number;
  venue: Venue;
  kind: MatchKind;
  group: Venue | "finals";
  roundIndex: number;
  roundLabel: string;
  startTime: string;
  endTime: string;
  innings: number;
  timeLimitMin: number;
  lastInningAtMin: number;
  source1: Source;
  source2: Source;
  team1Id: string | null;
  team2Id: string | null;
  score1: number | null;
  score2: number | null;
  winnerId: string | null;
  decidedBy: DecidedBy;
  refereeSource: RefereeSource;
  refereeTeamId: string | null;
};

export type TournamentSettings = {
  title: string;
  date: string;
  venueAName: string;
  venueBName: string;
  openingTime: string;
  openingVenue: Venue;
  closingTime: string;
  closingVenue: Venue;
  adminPasswordHash: string;
  sessionSecret: string;
};

export type Tournament = {
  settings: TournamentSettings;
  teams: Team[];
  matches: Match[];
  generatedAt: string | null;
};

export type PublicState = {
  settings: Omit<TournamentSettings, "adminPasswordHash" | "sessionSecret">;
  teams: Team[];
  matches: Match[];
  generatedAt: string | null;
  standings: Standings;
  warnings: string[];
  nowSlot: number | null;
};

export type Standings = {
  championId: string | null;
  runnerUpId: string | null;
  thirdId: string | null;
  fourthId: string | null;
};

export type GenerateOptions = {
  shuffle: boolean;
};
