import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createTeams, generateMatches } from "../shared/bracket.js";
import type { PublicState } from "../shared/types.js";
import { rowsForLab } from "../web/src/labSchedule.js";

function stateOf(n = 4): PublicState {
  const teams = createTeams(n);
  teams[0].lab = "高橋研";
  teams[1].lab = "岩田研";
  if (teams[2]) teams[2].lab = "高橋研";
  if (teams[3]) teams[3].lab = "布施研";
  const generated = generateMatches(teams, { shuffle: false });
  return {
    settings: {
      title: "test",
      date: "2026-10-13",
      venueAName: "A",
      venueBName: "B",
      openingTime: "09:00",
      openingVenue: "A",
      closingTime: "16:30",
      closingVenue: "A",
    },
    teams: generated.teams,
    matches: generated.matches,
    generatedAt: "now",
    standings: { championId: null, runnerUpId: null, thirdId: null, fourthId: null },
    warnings: [],
    nowSlot: null,
  };
}

describe("rowsForLab", () => {
  it("lists only confirmed games for every team in the lab", () => {
    const state = stateOf(4);
    const rows = rowsForLab(state, "高橋研").filter((row) => row.role === "試合");
    const names = rows.map((row) => row.teamName).sort();
    assert.deepEqual(names, ["チーム1", "チーム3"]);
    assert.equal(rows.every((row) => row.result === "未試合"), true);
    assert.equal(rows.some((row) => row.roundLabel === "優勝決定戦"), false);
  });

  it("shows the lab's own score and win after a result", () => {
    const state = stateOf(4);
    const match = state.matches.find((item) => item.team1Id === state.teams[0].id && item.team2Id === state.teams[1].id)!;
    match.score1 = 4;
    match.score2 = 1;
    match.winnerId = state.teams[0].id;
    match.decidedBy = "score";
    const row = rowsForLab(state, "高橋研").find((item) => item.teamName === "チーム1" && item.role === "試合")!;
    assert.equal(row.points, "4–1");
    assert.equal(row.result, "勝ち");
    assert.equal(row.opponent, "チーム2");
  });

  it("lists both teams when the lab plays itself", () => {
    const state = stateOf(4);
    const match = state.matches.find((item) => item.team1Id === state.teams[0].id)!;
    match.team2Id = state.teams[2].id;
    match.score1 = 1;
    match.score2 = 0;
    match.winnerId = state.teams[0].id;
    match.decidedBy = "score";
    const rows = rowsForLab(state, "高橋研").filter((row) => row.code === match.code && row.role === "試合");
    assert.deepEqual(
      rows.map((row) => [row.teamName, row.points, row.result]),
      [
        ["チーム1", "1–0", "勝ち"],
        ["チーム3", "0–1", "負け"],
      ],
    );
  });

  it("adds a referee row without treating it as a played game", () => {
    const state = stateOf(4);
    const match = state.matches.find((item) => item.venue === "B" && item.kind === "venue")!;
    match.refereeTeamId = state.teams[0].id;
    const rows = rowsForLab(state, "高橋研");
    const ref = rows.find((row) => row.role === "審判")!;
    assert.equal(ref.code, match.code);
    assert.equal(ref.points, "");
    assert.equal(ref.result, "審判");
    assert.match(ref.opponent, /対/);
  });
});
