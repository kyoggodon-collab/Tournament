import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyMatchResult,
  createTeams,
  generateMatches,
  resolveSourceTeamId,
  standingsOf,
} from "../shared/bracket.js";
import type { Tournament } from "../shared/types.js";

function setup(n = 4): Tournament {
  const teams = createTeams(n);
  const { matches, teams: ordered } = generateMatches(teams, { shuffle: false });
  return {
    version: 2,
    settings: {
      title: "test",
      date: "2026-10-13",
      venueAName: "A",
      venueBName: "B",
      openingTime: "09:00",
      openingVenue: "A",
      closingTime: "16:30",
      closingVenue: "A",
      adminPasswordHash: "x",
      sessionSecret: "y",
    },
    teams: ordered,
    matches,
    generatedAt: "now",
  };
}

describe("applyMatchResult", () => {
  it("advances winners into the final and records 3rd place", () => {
    let t = setup(4);
    const aFinal = t.matches.find((m) => m.kind === "venue" && m.venue === "A")!;
    const bFinal = t.matches.find((m) => m.kind === "venue" && m.venue === "B")!;
    t = applyMatchResult(t, aFinal.id, {
      score1: 7,
      score2: 1,
      winnerId: aFinal.team1Id,
      decidedBy: "score",
    });
    t = applyMatchResult(t, bFinal.id, {
      score1: 2,
      score2: 5,
      winnerId: bFinal.team2Id,
      decidedBy: "score",
    });
    const grand = t.matches.find((m) => m.kind === "grandFinal")!;
    const third = t.matches.find((m) => m.kind === "thirdPlace")!;
    assert.equal(grand.team1Id, aFinal.team1Id);
    assert.equal(grand.team2Id, bFinal.team2Id);
    assert.equal(third.team1Id, aFinal.team2Id);
    assert.equal(third.team2Id, bFinal.team1Id);

    t = applyMatchResult(t, grand.id, {
      score1: 3,
      score2: 4,
      winnerId: grand.team2Id,
      decidedBy: "score",
    });
    t = applyMatchResult(t, third.id, {
      score1: 1,
      score2: 1,
      winnerId: third.team1Id,
      decidedBy: "janken",
    });
    const standings = standingsOf(t);
    assert.equal(standings.championId, bFinal.team2Id);
    assert.equal(standings.runnerUpId, aFinal.team1Id);
    assert.equal(standings.thirdId, aFinal.team2Id);
    assert.equal(standings.fourthId, bFinal.team1Id);
  });

  it("clears dependent results when an earlier winner changes", () => {
    let t = setup(4);
    const aFinal = t.matches.find((m) => m.kind === "venue" && m.venue === "A")!;
    t = applyMatchResult(t, aFinal.id, {
      score1: 5,
      score2: 0,
      winnerId: aFinal.team1Id,
      decidedBy: "score",
    });
    const grand = t.matches.find((m) => m.kind === "grandFinal")!;
    assert.equal(resolveSourceTeamId(grand.source1, t.matches), aFinal.team1Id);
    t = applyMatchResult(t, aFinal.id, {
      score1: 0,
      score2: 6,
      winnerId: aFinal.team2Id,
      decidedBy: "score",
    });
    assert.equal(resolveSourceTeamId(grand.source1, t.matches), aFinal.team2Id);
  });

  it("records the 3rd-place final when derived team ids were not stored", () => {
    let t = setup(10);
    for (let guard = 0; guard < 40; guard++) {
      const next = t.matches
        .filter((m) => m.kind !== "thirdPlace" && !m.winnerId && m.team1Id && m.team2Id)
        .sort((a, b) => a.slot - b.slot)[0];
      if (!next) break;
      t = applyMatchResult(t, next.id, {
        score1: 2,
        score2: 0,
        winnerId: null,
        decidedBy: "score",
      });
    }
    const third = t.matches.find((m) => m.kind === "thirdPlace")!;
    const expectedWinner = third.team1Id;
    assert.ok(expectedWinner && third.team2Id);
    for (const match of t.matches) {
      if (match.source1.kind !== "team") match.team1Id = null;
      if (match.source2.kind !== "team") match.team2Id = null;
    }
    t = applyMatchResult(t, third.id, {
      score1: 3,
      score2: 1,
      winnerId: null,
      decidedBy: "score",
    });
    const saved = t.matches.find((m) => m.id === third.id)!;
    assert.equal(saved.score1, 3);
    assert.equal(saved.score2, 1);
    assert.equal(saved.winnerId, expectedWinner);
    assert.equal(saved.decidedBy, "score");
  });

  it("rejects a tie without a janken winner", () => {
    const t = setup(4);
    const aFinal = t.matches.find((m) => m.kind === "venue" && m.venue === "A")!;
    assert.throws(() =>
      applyMatchResult(t, aFinal.id, {
        score1: 2,
        score2: 2,
        winnerId: null,
        decidedBy: "score",
      }),
    );
  });
});
