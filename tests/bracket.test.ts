import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createTeams,
  generateMatches,
  possibleTeamsForMatch,
  splitVenueGroups,
} from "../shared/bracket.js";
import type { Match, Team } from "../shared/types.js";

function teamsOf(n: number): Team[] {
  return createTeams(n);
}

function matchesInSlot(matches: Match[], slot: number): Match[] {
  return matches.filter((m) => m.slot === slot);
}

describe("generateMatches", () => {
  for (const n of [2, 3, 4, 5, 6, 7, 8, 9, 12, 13, 14, 16, 20]) {
    it(`builds a valid two-venue draw for ${n} teams`, () => {
      const teams = teamsOf(n);
      const { matches, teams: ordered } = generateMatches(teams, { shuffle: false });
      const groups = splitVenueGroups(ordered);
      const venueGames = matches.filter((m) => m.kind === "venue");
      const expectedVenueGames =
        Math.max(0, groups.A.length - 1) + Math.max(0, groups.B.length - 1);
      assert.equal(venueGames.length, expectedVenueGames);

      const hasGrand = groups.A.length >= 1 && groups.B.length >= 1 && n >= 2;
      assert.equal(matches.some((m) => m.kind === "grandFinal"), hasGrand);

      const hasThird = groups.A.length >= 2 && groups.B.length >= 2;
      assert.equal(matches.some((m) => m.kind === "thirdPlace"), hasThird);

      const championshipGames = venueGames.length + (hasGrand ? 1 : 0);
      assert.equal(championshipGames, n - 1);

      for (const match of matches.filter((m) => m.kind === "venue")) {
        for (const teamId of possibleTeamsForMatch(match, matches)) {
          const home = groups.A.some((t) => t.id === teamId) ? "A" : "B";
          assert.equal(match.venue, home, `${teamId} left home venue before finals`);
        }
      }

      const grand = matches.find((m) => m.kind === "grandFinal");
      if (grand) assert.equal(grand.venue, "A");
      const third = matches.find((m) => m.kind === "thirdPlace");
      if (third) assert.equal(third.venue, "B");

      const maxSlot = Math.max(...matches.map((m) => m.slot));
      for (let slot = 0; slot <= maxSlot; slot++) {
        const here = matchesInSlot(matches, slot);
        const venues = here.map((m) => m.venue);
        assert.equal(new Set(venues).size, venues.length, `slot ${slot} doubles a venue`);
      }

      assert.ok(matches.every((m) => m.code.length >= 2));
      assert.ok(matches.every((m) => m.startTime < m.endTime || m.endTime < "06:00"));
    });
  }

  it("keeps 14 teams within a single-day 8-slot envelope", () => {
    const { matches } = generateMatches(teamsOf(14), { shuffle: false });
    const slots = new Set(matches.map((m) => m.slot));
    assert.ok(slots.size <= 8, `used ${slots.size} slots`);
    assert.equal(matches.length, 14);
  });

  it("gives byes without creating extra games", () => {
    const { matches } = generateMatches(teamsOf(7), { shuffle: false });
    const groups = splitVenueGroups(teamsOf(7));
    assert.equal(groups.A.length, 4);
    assert.equal(groups.B.length, 3);
    assert.equal(matches.filter((m) => m.kind === "venue" && m.venue === "A").length, 3);
    assert.equal(matches.filter((m) => m.kind === "venue" && m.venue === "B").length, 2);
  });

  it("does not ask a team to referee a match in the same slot they play", () => {
    const { matches } = generateMatches(teamsOf(14), { shuffle: false });
    for (const match of matches) {
      const referee = match.refereeSource;
      if (referee.kind !== "loser") continue;
      const sameSlot = matches.filter((m) => m.slot === match.slot);
      const conflict = sameSlot.some(
        (m) =>
          (m.source1.kind === "loser" && m.source1.matchId === referee.matchId) ||
          (m.source2.kind === "loser" && m.source2.matchId === referee.matchId),
      );
      assert.equal(conflict, false, `${match.code} referee still plays that slot`);
    }
  });
});
