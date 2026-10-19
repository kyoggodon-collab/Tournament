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

      const hasThird = n >= 4;
      assert.equal(matches.some((m) => m.kind === "thirdPlace"), hasThird);
      const consolationGames = matches.filter((m) => m.kind === "consolation" || m.kind === "thirdPlace");
      assert.equal(consolationGames.length, Math.max(0, n - 3));

      const championshipGames = venueGames.length + (hasGrand ? 1 : 0);
      assert.equal(championshipGames, n - 1);
      const loserRefs = matches.flatMap((m) => [m.source1, m.source2]).filter((s) => s.kind === "loser");
      assert.equal(loserRefs.length, n >= 4 ? venueGames.length : 0);
      assert.equal(new Set(loserRefs.map((s) => (s.kind === "loser" ? s.matchId : ""))).size, loserRefs.length);

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

  it("keeps the 10-team sheet inside the printed 8 slots", () => {
    const { matches } = generateMatches(teamsOf(10), { shuffle: false });
    const slots = new Set(matches.map((m) => m.slot));
    assert.equal(slots.size, 8);
    assert.equal(matches.filter((m) => m.kind === "venue").length, 8);
    assert.equal(matches.filter((m) => m.kind === "consolation" || m.kind === "thirdPlace").length, 7);
  });

  it("reproduces the printed 10-team championship and full losers bracket", () => {
    const teams = teamsOf(10);
    const { matches } = generateMatches(teams, { shuffle: false });
    const code = (mark: string) => matches.find((m) => m.code === mark)!;
    const team = (source: Match["source1"]) => {
      assert.equal(source.kind, "team");
      if (source.kind !== "team") return "";
      return source.teamId;
    };
    const loserOf = (source: Match["source1"]) => {
      assert.equal(source.kind, "loser");
      if (source.kind !== "loser") return "";
      return source.matchId;
    };
    const winnerOf = (source: Match["source1"]) => {
      assert.equal(source.kind, "winner");
      if (source.kind !== "winner") return "";
      return source.matchId;
    };

    assert.equal(team(code("①A").source1), teams[0].id);
    assert.equal(team(code("①A").source2), teams[1].id);
    assert.equal(team(code("②A").source1), teams[2].id);
    assert.equal(team(code("②A").source2), teams[3].id);
    assert.equal(winnerOf(code("③A").source1), code("②A").id);
    assert.equal(team(code("③A").source2), teams[4].id);
    assert.equal(winnerOf(code("④A").source1), code("①A").id);
    assert.equal(winnerOf(code("④A").source2), code("③A").id);

    assert.equal(team(code("①B").source1), teams[5].id);
    assert.equal(team(code("①B").source2), teams[6].id);
    assert.equal(team(code("②B").source1), teams[7].id);
    assert.equal(team(code("②B").source2), teams[8].id);
    assert.equal(winnerOf(code("③B").source1), code("②B").id);
    assert.equal(team(code("③B").source2), teams[9].id);
    assert.equal(winnerOf(code("④B").source1), code("①B").id);
    assert.equal(winnerOf(code("④B").source2), code("③B").id);

    assert.equal(winnerOf(code("⑧A").source1), code("④A").id);
    assert.equal(winnerOf(code("⑧A").source2), code("④B").id);
    assert.equal(code("⑧A").kind, "grandFinal");

    assert.equal(loserOf(code("⑤A").source1), code("①A").id);
    assert.equal(loserOf(code("⑤A").source2), code("①B").id);
    assert.equal(loserOf(code("⑤B").source1), code("②A").id);
    assert.equal(loserOf(code("⑤B").source2), code("②B").id);
    assert.equal(loserOf(code("⑥A").source1), code("③A").id);
    assert.equal(loserOf(code("⑥A").source2), code("③B").id);
    assert.equal(loserOf(code("⑥B").source1), code("④A").id);
    assert.equal(loserOf(code("⑥B").source2), code("④B").id);
    assert.equal(winnerOf(code("⑦A").source1), code("⑤A").id);
    assert.equal(winnerOf(code("⑦A").source2), code("⑤B").id);
    assert.equal(winnerOf(code("⑦B").source1), code("⑥A").id);
    assert.equal(winnerOf(code("⑦B").source2), code("⑥B").id);
    assert.equal(winnerOf(code("⑧B").source1), code("⑦A").id);
    assert.equal(winnerOf(code("⑧B").source2), code("⑦B").id);
    assert.equal(code("⑧B").kind, "thirdPlace");
    assert.equal(code("⑧B").venue, "B");

    const marks = matches
      .filter((m) => m.kind === "venue")
      .sort((a, b) => a.slot - b.slot || a.venue.localeCompare(b.venue))
      .map((m) => m.loserMark);
    assert.deepEqual(marks, ["イ", "ロ", "ハ", "ニ", "ホ", "ヘ", "ト", "チ"]);
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
