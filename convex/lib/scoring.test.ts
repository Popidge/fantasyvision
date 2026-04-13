import { describe, it, expect } from "vitest";
import type { Doc, Id } from "../_generated/dataModel";
import {
  pointsForPlacementDifference,
  buildPredictionRows,
  calculatePredictionScore,
  calculateMaxPossibleScore,
  buildCombinedPredictionData,
} from "./scoring";

// ── Test helpers ──────────────────────────────────────────────────────────────

const FAKE_CONTEST_ID = "contest" as Id<"contests">;

function makeContestant(
  id: string,
  overrides: Partial<Doc<"contestants">> = {},
): Doc<"contestants"> {
  return {
    _id: id as Id<"contestants">,
    _creationTime: 0,
    contestId: FAKE_CONTEST_ID,
    entryId: id,
    sortOrder: 1,
    country: `Country ${id}`,
    countryCode: id.toUpperCase().slice(0, 2).padEnd(2, "X"),
    artist: `Artist ${id}`,
    song: `Song ${id}`,
    imageUrl: `/img/${id}.jpg`,
    ...overrides,
  };
}

function ids(contestants: Doc<"contestants">[]): Id<"contestants">[] {
  return contestants.map((c) => c._id);
}

// Build a full 35-contestant combined scenario.
// SF1: s1_01..s1_15  (s1_01..s1_10 qualify by default)
// SF2: s2_01..s2_15  (s2_01..s2_10 qualify by default)
// Auto: a_01..a_05   (always qualify)
//
// Default user ranking:
//   top 25: a_01..a_05, s1_01..s1_10, s2_01..s2_10
//   bottom 10: s1_11..s1_15, s2_11..s2_15
function buildScenario(overrides: {
  sf1Qualified?: Record<string, boolean>;
  sf1Placements?: Record<string, number>;
  sf2Qualified?: Record<string, boolean>;
  sf2Placements?: Record<string, number>;
  gfPlacements?: Record<string, number>;
  ranking?: Id<"contestants">[];
} = {}) {
  const sf1Combined = Array.from({ length: 15 }, (_, i) => {
    const id = `s1_${String(i + 1).padStart(2, "0")}`;
    return makeContestant(id, { semiGroup: "semi1" });
  });

  const sf2Combined = Array.from({ length: 15 }, (_, i) => {
    const id = `s2_${String(i + 1).padStart(2, "0")}`;
    return makeContestant(id, { semiGroup: "semi2" });
  });

  const autoCombined = Array.from({ length: 5 }, (_, i) => {
    const id = `a_${String(i + 1).padStart(2, "0")}`;
    return makeContestant(id, { semiGroup: "auto" });
  });

  const combinedContestants = [...sf1Combined, ...sf2Combined, ...autoCombined];

  // SF1 contestants (separate docs with qualified + placement)
  const sf1Contestants = Array.from({ length: 15 }, (_, i) => {
    const id = `s1_${String(i + 1).padStart(2, "0")}`;
    const qualifiedByDefault = i < 10; // first 10 qualify
    const qualifiedMap = overrides.sf1Qualified ?? {};
    const qualified = id in qualifiedMap ? qualifiedMap[id] : qualifiedByDefault;
    const defaultPlacement = i + 1;
    const placement = overrides.sf1Placements?.[id] ?? defaultPlacement;
    return makeContestant(id, {
      contestId: "sf1_contest" as Id<"contests">,
      placement,
      qualified,
    });
  });

  const sf2Contestants = Array.from({ length: 15 }, (_, i) => {
    const id = `s2_${String(i + 1).padStart(2, "0")}`;
    const qualifiedByDefault = i < 10;
    const qualifiedMap = overrides.sf2Qualified ?? {};
    const qualified = id in qualifiedMap ? qualifiedMap[id] : qualifiedByDefault;
    const defaultPlacement = i + 1;
    const placement = overrides.sf2Placements?.[id] ?? defaultPlacement;
    return makeContestant(id, {
      contestId: "sf2_contest" as Id<"contests">,
      placement,
      qualified,
    });
  });

  // GF contestants: auto_01..05 + s1_01..s1_10 + s2_01..s2_10
  const gfEntryIds = [
    ...autoCombined.map((c) => c.entryId),
    ...sf1Contestants.filter((c) => c.qualified).map((c) => c.entryId),
    ...sf2Contestants.filter((c) => c.qualified).map((c) => c.entryId),
  ];
  const gfContestants = gfEntryIds.map((entryId, i) => {
    const placement = overrides.gfPlacements?.[entryId] ?? i + 1;
    return makeContestant(entryId, {
      contestId: "gf_contest" as Id<"contests">,
      placement,
    });
  });

  // Default ranking: autos first, then sf1 top 10, then sf2 top 10, then bottom 10
  const defaultRanking: Id<"contestants">[] = [
    ...ids(autoCombined),
    ...ids(sf1Combined.slice(0, 10)),
    ...ids(sf2Combined.slice(0, 10)),
    ...ids(sf1Combined.slice(10)),
    ...ids(sf2Combined.slice(10)),
  ];

  return {
    combinedContestants,
    sf1Contestants,
    sf2Contestants,
    gfContestants,
    ranking: overrides.ranking ?? defaultRanking,
    // helpers
    sf1Combined,
    sf2Combined,
    autoCombined,
  };
}

// ── pointsForPlacementDifference ──────────────────────────────────────────────

describe("pointsForPlacementDifference", () => {
  it("awards 12 for exact match (diff 0)", () => {
    expect(pointsForPlacementDifference(0)).toBe(12);
  });

  it("awards 10 for diff 1", () => {
    expect(pointsForPlacementDifference(1)).toBe(10);
  });

  it("awards 8 for diff 2", () => {
    expect(pointsForPlacementDifference(2)).toBe(8);
  });

  it("awards 1 for diff 9", () => {
    expect(pointsForPlacementDifference(9)).toBe(1);
  });

  it("awards 0 for diff 10+", () => {
    expect(pointsForPlacementDifference(10)).toBe(0);
    expect(pointsForPlacementDifference(25)).toBe(0);
  });
});

// ── buildPredictionRows ───────────────────────────────────────────────────────

describe("buildPredictionRows", () => {
  it("returns rows in ranking order with null scores when no placements set", () => {
    const a = makeContestant("A");
    const b = makeContestant("B");
    const rows = buildPredictionRows([b._id, a._id], [a, b]);

    expect(rows).toHaveLength(2);
    expect(rows[0].contestantId).toBe(b._id);
    expect(rows[0].predictedRank).toBe(1);
    expect(rows[0].actualPlacement).toBeNull();
    expect(rows[0].entryScore).toBeNull();
    expect(rows[1].contestantId).toBe(a._id);
    expect(rows[1].predictedRank).toBe(2);
  });

  it("calculates entry scores when placements are set", () => {
    const a = makeContestant("A", { placement: 1 });
    const b = makeContestant("B", { placement: 3 });
    // Rank A at 1 (exact), B at 1 (but actual is 3 → diff 2 → 8 pts)
    const rows = buildPredictionRows([a._id, b._id], [a, b]);

    expect(rows[0].entryScore).toBe(12); // predicted 1, actual 1 → diff 0 → 12
    expect(rows[1].entryScore).toBe(10); // predicted 2, actual 3 → diff 1 → 10
  });

  it("skips contestants not in the ranking", () => {
    const a = makeContestant("A");
    const b = makeContestant("B");
    const rows = buildPredictionRows([a._id], [a, b]);
    expect(rows).toHaveLength(1);
    expect(rows[0].contestantId).toBe(a._id);
  });
});

// ── calculatePredictionScore ──────────────────────────────────────────────────

describe("calculatePredictionScore", () => {
  it("returns null when no placements are set", () => {
    const contestants = [makeContestant("A"), makeContestant("B")];
    expect(calculatePredictionScore(ids(contestants), contestants)).toBeNull();
  });

  it("returns the sum of entry scores when placements exist", () => {
    const a = makeContestant("A", { placement: 1 });
    const b = makeContestant("B", { placement: 2 });
    // Predict A=1 (diff 0 → 12), B=2 (diff 0 → 12) → total 24
    expect(calculatePredictionScore([a._id, b._id], [a, b])).toBe(24);
  });

  it("returns partial score when only some placements are set", () => {
    const a = makeContestant("A", { placement: 1 });
    const b = makeContestant("B"); // no placement
    // Only A is scored: 12 pts; B contributes 0
    const score = calculatePredictionScore([a._id, b._id], [a, b]);
    expect(score).toBe(12);
  });
});

// ── calculateMaxPossibleScore ─────────────────────────────────────────────────

describe("calculateMaxPossibleScore", () => {
  it("returns 0 when no contestants have placements", () => {
    const contestants = [makeContestant("A"), makeContestant("B")];
    expect(calculateMaxPossibleScore(contestants)).toBe(0);
  });

  it("returns 12 × number of finalised contestants", () => {
    const contestants = [
      makeContestant("A", { placement: 1 }),
      makeContestant("B", { placement: 2 }),
      makeContestant("C"),
    ];
    expect(calculateMaxPossibleScore(contestants)).toBe(24); // 2 × 12
  });
});

// ── buildCombinedPredictionData ───────────────────────────────────────────────

describe("buildCombinedPredictionData — no results yet", () => {
  it("returns all nulls when no SF or GF results exist", () => {
    const { combinedContestants, sf1Combined, sf2Combined, autoCombined: _autoCombined, ranking } =
      buildScenario();

    // Strip placements so there are no results
    const sf1NoResults = sf1Combined.map((c) => ({ ...c, placement: undefined, qualified: undefined }));
    const sf2NoResults = sf2Combined.map((c) => ({ ...c, placement: undefined, qualified: undefined }));
    const gfEmpty: Doc<"contestants">[] = [];

    const result = buildCombinedPredictionData(
      ranking,
      combinedContestants,
      sf1NoResults,
      sf2NoResults,
      gfEmpty,
    );

    expect(result.totalScore).toBeNull();
    expect(result.gfScore).toBeNull();
    expect(result.sf1BonusRows).toBeNull();
    expect(result.sf2BonusRows).toBeNull();
    expect(result.sf1BonusTotal).toBeNull();
    expect(result.sf2BonusTotal).toBeNull();
    expect(result.backfilledContestants.size).toBe(0);
  });
});

describe("buildCombinedPredictionData — effective GF ranking / backfill", () => {
  it("preserves top 25 unchanged when all picks qualify", () => {
    const { combinedContestants, sf1Contestants, sf2Contestants, gfContestants, ranking } =
      buildScenario();

    const result = buildCombinedPredictionData(
      ranking,
      combinedContestants,
      sf1Contestants,
      sf2Contestants,
      gfContestants,
    );

    // Top 25: a_01..a_05, s1_01..s1_10, s2_01..s2_10
    const expectedTop25 = ranking.slice(0, 25);
    expect(result.effectiveGFRanking).toEqual(expectedTop25);
    expect(result.backfilledContestants.size).toBe(0);
  });

  it("replaces a non-qualifying top-25 pick with the highest-ranked bottom-10 qualifier", () => {
    // s1_10 does NOT qualify; s1_11 (first bottom-10 pick) does qualify (explicitly set)
    const { combinedContestants, sf1Contestants, sf2Contestants, gfContestants, ranking, sf1Combined } =
      buildScenario({ sf1Qualified: { s1_10: false, s1_11: true } });

    const result = buildCombinedPredictionData(
      ranking,
      combinedContestants,
      sf1Contestants,
      sf2Contestants,
      gfContestants,
    );

    const s1_10_id = sf1Combined[9]._id; // s1_10 (0-indexed: 9)
    const s1_11_id = sf1Combined[10]._id; // s1_11 (first bottom-10 qualifier)

    // s1_10 should not be in effective ranking
    expect(result.effectiveGFRanking).not.toContain(s1_10_id);
    // s1_11 should be in effective ranking at the same slot
    expect(result.effectiveGFRanking).toContain(s1_11_id);
    // backfilled set contains s1_11
    expect(result.backfilledContestants.has(s1_11_id)).toBe(true);
    expect(result.backfilledContestants.size).toBe(1);
    // length is still 25
    expect(result.effectiveGFRanking).toHaveLength(25);
  });

  it("backfills multiple non-qualifiers in order", () => {
    // s1_09 and s1_10 don't qualify; s1_11 and s1_12 do (explicitly set as qualified)
    const { combinedContestants, sf1Contestants, sf2Contestants, gfContestants, ranking, sf1Combined } =
      buildScenario({ sf1Qualified: { s1_09: false, s1_10: false, s1_11: true, s1_12: true } });

    const result = buildCombinedPredictionData(
      ranking,
      combinedContestants,
      sf1Contestants,
      sf2Contestants,
      gfContestants,
    );

    const s1_09_id = sf1Combined[8]._id;
    const s1_10_id = sf1Combined[9]._id;
    const s1_11_id = sf1Combined[10]._id;
    const s1_12_id = sf1Combined[11]._id;

    expect(result.effectiveGFRanking).not.toContain(s1_09_id);
    expect(result.effectiveGFRanking).not.toContain(s1_10_id);
    expect(result.effectiveGFRanking).toContain(s1_11_id);
    expect(result.effectiveGFRanking).toContain(s1_12_id);
    expect(result.backfilledContestants.size).toBe(2);
    expect(result.effectiveGFRanking).toHaveLength(25);
  });

  it("auto-qualifiers in top 25 are never removed", () => {
    // Even if we somehow mark an auto as not-qualified, they can't be in the SF lists
    // so isQualified(auto) always returns true
    const { combinedContestants, sf1Contestants, sf2Contestants, gfContestants, ranking, autoCombined } =
      buildScenario();

    const result = buildCombinedPredictionData(
      ranking,
      combinedContestants,
      sf1Contestants,
      sf2Contestants,
      gfContestants,
    );

    for (const auto of autoCombined) {
      expect(result.effectiveGFRanking).toContain(auto._id);
    }
  });

  it("skips bottom-10 picks that did not qualify when backfilling", () => {
    // s1_10 doesn't qualify (top-25 pick to backfill)
    // s1_11 also doesn't qualify (first bottom-10 pick, should be skipped)
    // s1_12 qualifies → should be the backfill
    const { combinedContestants, sf1Contestants, sf2Contestants, gfContestants, ranking, sf1Combined } =
      buildScenario({ sf1Qualified: { s1_10: false, s1_11: false, s1_12: true } });

    const result = buildCombinedPredictionData(
      ranking,
      combinedContestants,
      sf1Contestants,
      sf2Contestants,
      gfContestants,
    );

    const s1_11_id = sf1Combined[10]._id; // doesn't qualify
    const s1_12_id = sf1Combined[11]._id; // qualifies → used as backfill

    expect(result.effectiveGFRanking).not.toContain(s1_11_id);
    expect(result.effectiveGFRanking).toContain(s1_12_id);
    expect(result.backfilledContestants.has(s1_12_id)).toBe(true);
  });
});

describe("buildCombinedPredictionData — GF scoring", () => {
  it("returns null gfScore when GF contestants have no placements", () => {
    const { combinedContestants, sf1Contestants, sf2Contestants, gfContestants, ranking } =
      buildScenario();

    // Strip placements from GF
    const gfNoResults = gfContestants.map((c) => ({ ...c, placement: undefined }));

    const result = buildCombinedPredictionData(
      ranking,
      combinedContestants,
      sf1Contestants,
      sf2Contestants,
      gfNoResults,
    );

    expect(result.gfScore).toBeNull();
    expect(result.gfRows).toBeNull();
  });

  it("calculates GF score when placements exist", () => {
    const { combinedContestants, sf1Contestants, sf2Contestants, gfContestants, ranking } =
      buildScenario();

    const result = buildCombinedPredictionData(
      ranking,
      combinedContestants,
      sf1Contestants,
      sf2Contestants,
      gfContestants,
    );

    // With default scenario: ranking matches GF placements perfectly
    // a_01=rank1/placement1 (diff 0 → 12), ..., all 25 exact → 25 × 12 = 300
    expect(result.gfScore).toBe(300);
    expect(result.gfRows).toHaveLength(25);
  });

  it("uses the effective ranking (post-backfill) for GF scoring, not the original top 25", () => {
    // s1_10 doesn't qualify, replaced by s1_11 (explicitly set as qualified)
    const { combinedContestants, sf1Contestants, sf2Contestants, gfContestants, ranking } =
      buildScenario({ sf1Qualified: { s1_10: false, s1_11: true } });

    const result = buildCombinedPredictionData(
      ranking,
      combinedContestants,
      sf1Contestants,
      sf2Contestants,
      gfContestants,
    );

    // s1_10 should not appear in gfRows (it's not in the GF)
    expect(result.gfRows?.some((r) => r.contestantId === "s1_10" as Id<"contestants">)).toBe(false);
    // s1_11 should appear (it was backfilled in)
    expect(result.gfRows?.some((r) => r.contestantId === "s1_11" as Id<"contestants">)).toBe(true);
  });
});

describe("buildCombinedPredictionData — SF bonus scoring", () => {
  it("returns null SF bonus rows when no SF results exist", () => {
    const { combinedContestants, sf1Combined, sf2Combined, gfContestants, ranking } =
      buildScenario();

    const sf1NoResults = sf1Combined.map((c) => ({ ...c, placement: undefined }));
    const sf2NoResults = sf2Combined.map((c) => ({ ...c, placement: undefined }));

    const result = buildCombinedPredictionData(
      ranking,
      combinedContestants,
      sf1NoResults,
      sf2NoResults,
      gfContestants,
    );

    expect(result.sf1BonusRows).toBeNull();
    expect(result.sf2BonusRows).toBeNull();
    expect(result.sf1BonusTotal).toBeNull();
    expect(result.sf2BonusTotal).toBeNull();
  });

  it("only includes SF1 contestants from the original top 25 in bonus rows", () => {
    const { combinedContestants, sf1Contestants, sf2Contestants, gfContestants, ranking } =
      buildScenario();

    const result = buildCombinedPredictionData(
      ranking,
      combinedContestants,
      sf1Contestants,
      sf2Contestants,
      gfContestants,
    );

    // Top 25 contains s1_01..s1_10 (10 SF1 picks); s1_11..s1_15 are in bottom 10
    expect(result.sf1BonusRows).toHaveLength(10);
    // None of the bottom-10 SF1 picks should appear
    const bonusEntryIds = result.sf1BonusRows!.map((r) =>
      r.country.replace("Country ", ""),
    );
    for (let i = 11; i <= 15; i++) {
      const id = `s1_${String(i).padStart(2, "0")}`;
      expect(bonusEntryIds).not.toContain(id);
    }
  });

  it("assigns relative semi ranks based on order within the overall ranking", () => {
    // Reorder: put s1_05 before s1_01 in the overall ranking
    const { combinedContestants, sf1Contestants, sf2Contestants, gfContestants, sf1Combined, sf2Combined, autoCombined } =
      buildScenario();

    // Custom ranking: autos, then s1_05, s1_01..s1_04, s1_06..s1_10, sf2 top 10, bottom 10
    const customRanking: Id<"contestants">[] = [
      ...ids(autoCombined),
      sf1Combined[4]._id,  // s1_05 → relative SF1 rank 1
      sf1Combined[0]._id,  // s1_01 → relative SF1 rank 2
      sf1Combined[1]._id,  // s1_02 → relative SF1 rank 3
      sf1Combined[2]._id,  // s1_03 → relative SF1 rank 4
      sf1Combined[3]._id,  // s1_04 → relative SF1 rank 5
      ...ids(sf1Combined.slice(5, 10)), // s1_06..s1_10 → ranks 6..10
      ...ids(sf2Combined.slice(0, 10)),
      ...ids(sf1Combined.slice(10)),
      ...ids(sf2Combined.slice(10)),
    ];

    const result = buildCombinedPredictionData(
      customRanking,
      combinedContestants,
      sf1Contestants,
      sf2Contestants,
      gfContestants,
    );

    // s1_05 should have predictedSemiRank = 1 (it appears first among SF1 in top 25)
    const s1_05_row = result.sf1BonusRows!.find((r) => r.country === "Country s1_05");
    expect(s1_05_row?.predictedSemiRank).toBe(1);

    // s1_01 should have predictedSemiRank = 2
    const s1_01_row = result.sf1BonusRows!.find((r) => r.country === "Country s1_01");
    expect(s1_01_row?.predictedSemiRank).toBe(2);
  });

  it("awards 10 pts for exact semi rank match", () => {
    const { combinedContestants, sf1Contestants, sf2Contestants, gfContestants, ranking } =
      buildScenario();

    const result = buildCombinedPredictionData(
      ranking,
      combinedContestants,
      sf1Contestants,
      sf2Contestants,
      gfContestants,
    );

    // In default scenario: s1_01 is ranked 1st among SF1 in top 25, actual SF1 placement = 1
    const firstRow = result.sf1BonusRows![0];
    expect(firstRow.predictedSemiRank).toBe(1);
    expect(firstRow.actualSemiPlacement).toBe(1);
    expect(firstRow.bonusScore).toBe(10);
  });

  it("awards fewer points for semi rank misses", () => {
    // Set actual SF1 placement of s1_01 to 3 (predicted rank 1, diff 2 → 8 pts)
    const { combinedContestants, sf1Contestants, sf2Contestants, gfContestants, ranking } =
      buildScenario({ sf1Placements: { s1_01: 3 } });

    const result = buildCombinedPredictionData(
      ranking,
      combinedContestants,
      sf1Contestants,
      sf2Contestants,
      gfContestants,
    );

    const s1_01_row = result.sf1BonusRows!.find((r) => r.country === "Country s1_01");
    expect(s1_01_row?.bonusScore).toBe(8); // diff |1-3| = 2 → SF_BONUS[2] = 8
  });

  it("awards 0 pts for semi rank diff >= 10", () => {
    // Predicted rank 1, actual placement 11 → diff 10 → 0 pts
    const { combinedContestants, sf1Contestants, sf2Contestants, gfContestants, ranking } =
      buildScenario({ sf1Placements: { s1_01: 11 } });

    const result = buildCombinedPredictionData(
      ranking,
      combinedContestants,
      sf1Contestants,
      sf2Contestants,
      gfContestants,
    );

    const s1_01_row = result.sf1BonusRows!.find((r) => r.country === "Country s1_01");
    expect(s1_01_row?.bonusScore).toBe(0);
  });

  it("auto-qualifiers are not included in SF bonus rows", () => {
    const { combinedContestants, sf1Contestants, sf2Contestants, gfContestants, ranking } =
      buildScenario();

    const result = buildCombinedPredictionData(
      ranking,
      combinedContestants,
      sf1Contestants,
      sf2Contestants,
      gfContestants,
    );

    // Auto-qualifier countries start with "Country a_"
    const sf1AutoRows = result.sf1BonusRows!.filter((r) => r.country.includes("a_0"));
    const sf2AutoRows = result.sf2BonusRows!.filter((r) => r.country.includes("a_0"));
    expect(sf1AutoRows).toHaveLength(0);
    expect(sf2AutoRows).toHaveLength(0);
  });

  it("bottom-10 picks are not included in SF bonus rows even if they get backfilled", () => {
    // s1_10 doesn't qualify → s1_11 backfills in
    // s1_11 was originally in bottom 10, so it should NOT get SF bonus
    const { combinedContestants, sf1Contestants, sf2Contestants, gfContestants, ranking } =
      buildScenario({ sf1Qualified: { s1_10: false } });

    const result = buildCombinedPredictionData(
      ranking,
      combinedContestants,
      sf1Contestants,
      sf2Contestants,
      gfContestants,
    );

    // s1_11 backfilled into GF ranking but was not in original top 25
    const s1_11_bonus = result.sf1BonusRows!.find((r) => r.country === "Country s1_11");
    expect(s1_11_bonus).toBeUndefined();
    // Still only 10 SF1 bonus rows (the original top-25 SF1 picks, minus the one that didn't qualify)
    // Wait: s1_10 is still in originalTop25 (it's just replaced in effective GF ranking).
    // SF bonus is based on originalTop25, not effectiveGFRanking.
    // So s1_10 IS still in sf1BonusRows (they predicted its semi rank).
    const s1_10_bonus = result.sf1BonusRows!.find((r) => r.country === "Country s1_10");
    expect(s1_10_bonus).toBeDefined();
    expect(result.sf1BonusRows).toHaveLength(10);
  });
});

describe("buildCombinedPredictionData — total score aggregation", () => {
  it("sums GF + SF1 + SF2 bonus when all results are in", () => {
    const { combinedContestants, sf1Contestants, sf2Contestants, gfContestants, ranking } =
      buildScenario();

    const result = buildCombinedPredictionData(
      ranking,
      combinedContestants,
      sf1Contestants,
      sf2Contestants,
      gfContestants,
    );

    // Perfect default scenario:
    // GF: 25 picks × 12 (all exact) = 300
    // SF1 bonus: 10 picks × 10 (all exact) = 100
    // SF2 bonus: 10 picks × 10 (all exact) = 100
    expect(result.gfScore).toBe(300);
    expect(result.sf1BonusTotal).toBe(100);
    expect(result.sf2BonusTotal).toBe(100);
    expect(result.totalScore).toBe(500);
  });

  it("returns non-null totalScore as soon as any semi result is in", () => {
    const { combinedContestants, sf1Contestants, sf2Combined, gfContestants, ranking } =
      buildScenario();

    // Only SF1 results; SF2 has no placements
    const sf2NoResults = sf2Combined.map((c) => ({ ...c, placement: undefined }));
    // GF also has no placements
    const gfNoResults = gfContestants.map((c) => ({ ...c, placement: undefined }));

    const result = buildCombinedPredictionData(
      ranking,
      combinedContestants,
      sf1Contestants,
      sf2NoResults,
      gfNoResults,
    );

    expect(result.sf1BonusTotal).toBe(100);
    expect(result.sf2BonusTotal).toBeNull();
    expect(result.gfScore).toBeNull();
    // totalScore = 100 (SF1) + 0 (null SF2 treated as 0) + 0 (null GF treated as 0)
    expect(result.totalScore).toBe(100);
  });

  it("includes GF in total once GF results are in even if SF bonus is null", () => {
    const { combinedContestants, sf1Contestants, sf2Contestants, gfContestants, ranking } =
      buildScenario();

    // No SF results (strip placements but keep qualified flags), only GF results
    const sf1NoResults = sf1Contestants.map((c) => ({ ...c, placement: undefined }));
    const sf2NoResults = sf2Contestants.map((c) => ({ ...c, placement: undefined }));

    const result = buildCombinedPredictionData(
      ranking,
      combinedContestants,
      sf1NoResults,
      sf2NoResults,
      gfContestants,
    );

    expect(result.gfScore).toBe(300);
    expect(result.sf1BonusTotal).toBeNull();
    expect(result.sf2BonusTotal).toBeNull();
    expect(result.totalScore).toBe(300);
  });
});
