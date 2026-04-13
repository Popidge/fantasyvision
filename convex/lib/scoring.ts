import type { Doc, Id } from "../_generated/dataModel";

const SCORE_BY_DIFFERENCE = [12, 10, 8, 7, 6, 5, 4, 3, 2, 1] as const;
const SF_BONUS_BY_DIFFERENCE = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1] as const;

export type RankedRow = {
  contestantId: Id<"contestants">;
  predictedRank: number;
  actualPlacement: number | null;
  entryScore: number | null;
  country: string;
  countryCode: string;
  artist: string;
  song: string;
  imageUrl: string;
  youtubeUrl?: string;
  points?: number;
};

export function pointsForPlacementDifference(difference: number): number {
  return SCORE_BY_DIFFERENCE[difference] ?? 0;
}

export function buildPredictionRows(
  ranking: Id<"contestants">[],
  contestants: Doc<"contestants">[],
): RankedRow[] {
  const contestantsById = new Map(contestants.map((contestant) => [contestant._id, contestant]));
  const rows: RankedRow[] = [];

  for (const [index, contestantId] of ranking.entries()) {
    const contestant = contestantsById.get(contestantId);
    if (!contestant) {
      continue;
    }

    const predictedRank = index + 1;
    const actualPlacement =
      typeof contestant.placement === "number" ? contestant.placement : null;

    rows.push({
      contestantId,
      predictedRank,
      actualPlacement,
      entryScore:
        actualPlacement === null
          ? null
          : pointsForPlacementDifference(Math.abs(predictedRank - actualPlacement)),
      country: contestant.country,
      countryCode: contestant.countryCode,
      artist: contestant.artist,
      song: contestant.song,
      imageUrl: contestant.imageUrl,
      youtubeUrl: contestant.youtubeUrl,
      points: contestant.points,
    });
  }

  return rows;
}

export function calculatePredictionScore(
  ranking: Id<"contestants">[],
  contestants: Doc<"contestants">[],
): number | null {
  const rows = buildPredictionRows(ranking, contestants);
  const hasPublishedResults = rows.some((row) => row.actualPlacement !== null);

  if (!hasPublishedResults) {
    return null;
  }

  return rows.reduce((total, row) => total + (row.entryScore ?? 0), 0);
}

export function calculateMaxPossibleScore(contestants: Doc<"contestants">[]): number {
  const finalisedCount = contestants.filter(
    (contestant) => typeof contestant.placement === "number",
  ).length;
  return finalisedCount * SCORE_BY_DIFFERENCE[0];
}

export function alphabeticalContestants(contestants: Doc<"contestants">[]) {
  return [...contestants].sort((left, right) => {
    return (
      left.country.localeCompare(right.country) ||
      left.artist.localeCompare(right.artist) ||
      left.song.localeCompare(right.song)
    );
  });
}

export type SFBonusRow = {
  contestantId: Id<"contestants">;
  country: string;
  countryCode: string;
  artist: string;
  song: string;
  imageUrl: string;
  predictedSemiRank: number;
  actualSemiPlacement: number | null;
  bonusScore: number | null;
};

export type CombinedPredictionData = {
  originalTop25: Id<"contestants">[];
  effectiveGFRanking: Id<"contestants">[];
  backfilledContestants: Set<Id<"contestants">>;
  gfRows: RankedRow[] | null;
  gfScore: number | null;
  sf1BonusRows: SFBonusRow[] | null;
  sf1BonusTotal: number | null;
  sf2BonusRows: SFBonusRow[] | null;
  sf2BonusTotal: number | null;
  totalScore: number | null;
};

export function buildCombinedPredictionData(
  ranking: Id<"contestants">[],
  combinedContestants: Doc<"contestants">[],
  sf1Contestants: Doc<"contestants">[],
  sf2Contestants: Doc<"contestants">[],
  gfContestants: Doc<"contestants">[],
): CombinedPredictionData {
  const combinedById = new Map(combinedContestants.map((c) => [c._id, c]));

  // Build lookup maps from entryId to SF contestant (for qualification status)
  const sf1ByEntryId = new Map(sf1Contestants.map((c) => [c.entryId, c]));
  const sf2ByEntryId = new Map(sf2Contestants.map((c) => [c.entryId, c]));
  const gfByEntryId = new Map(gfContestants.map((c) => [c.entryId, c]));

  const hasAnyGFResults = gfContestants.some((c) => typeof c.placement === "number");
  const hasAnyS1Results = sf1Contestants.some((c) => typeof c.placement === "number");
  const hasAnyS2Results = sf2Contestants.some((c) => typeof c.placement === "number");

  // Determine qualification for each combined contestant
  function isQualified(combinedContestant: Doc<"contestants">): boolean {
    if (combinedContestant.semiGroup === "auto") return true;
    if (combinedContestant.semiGroup === "semi1") {
      return sf1ByEntryId.get(combinedContestant.entryId)?.qualified === true;
    }
    if (combinedContestant.semiGroup === "semi2") {
      return sf2ByEntryId.get(combinedContestant.entryId)?.qualified === true;
    }
    return false;
  }

  const originalTop25 = ranking.slice(0, 25);
  const bottom10 = ranking.slice(25, 35);

  // Build effective GF ranking with backfill
  const effectiveGFRanking: Id<"contestants">[] = [];
  const backfilledContestants = new Set<Id<"contestants">>();

  // Bottom-10 picks that qualified, in the order the user ranked them
  const qualifiedBottom10 = bottom10.filter((id) => {
    const c = combinedById.get(id);
    return c ? isQualified(c) : false;
  });
  let backfillIndex = 0;

  for (const id of originalTop25) {
    const c = combinedById.get(id);
    if (!c || isQualified(c)) {
      effectiveGFRanking.push(id);
    } else {
      // This pick didn't qualify — replace with next qualified bottom-10 pick
      if (backfillIndex < qualifiedBottom10.length) {
        const backfillId = qualifiedBottom10[backfillIndex++];
        effectiveGFRanking.push(backfillId);
        backfilledContestants.add(backfillId);
      }
    }
  }

  // GF scoring — map effective ranking IDs back to GF contestant docs via entryId
  let gfRows: RankedRow[] | null = null;
  let gfScore: number | null = null;

  if (hasAnyGFResults) {
    // Build a synthetic contestant list from GF docs, in effective ranking order
    const effectiveGFContestants: Doc<"contestants">[] = [];
    for (const id of effectiveGFRanking) {
      const combined = combinedById.get(id);
      if (!combined) continue;
      const gfDoc = gfByEntryId.get(combined.entryId);
      if (gfDoc) effectiveGFContestants.push(gfDoc);
    }
    const gfDocIds = effectiveGFContestants.map((c) => c._id);
    gfRows = buildPredictionRows(gfDocIds, effectiveGFContestants);
    gfScore = gfRows.reduce((total, row) => total + (row.entryScore ?? 0), 0);
  }

  // SF bonus scoring
  function buildSFBonusRows(
    sfContestantsByEntryId: Map<string, Doc<"contestants">>,
    hasResults: boolean,
  ): SFBonusRow[] | null {
    if (!hasResults) return null;

    // Extract combined contestant IDs that belong to this semi, preserving overall ranking order
    const semiCombinedInTop25 = originalTop25
      .map((id) => combinedById.get(id))
      .filter((c): c is Doc<"contestants"> => {
        if (!c) return false;
        const sfDoc = sfContestantsByEntryId.get(c.entryId);
        return sfDoc !== undefined;
      });

    return semiCombinedInTop25.map((c, index) => {
      const sfDoc = sfContestantsByEntryId.get(c.entryId)!;
      const predictedSemiRank = index + 1;
      const actualSemiPlacement = typeof sfDoc.placement === "number" ? sfDoc.placement : null;
      const bonusScore =
        actualSemiPlacement === null
          ? null
          : (SF_BONUS_BY_DIFFERENCE[Math.abs(predictedSemiRank - actualSemiPlacement)] ?? 0);

      return {
        contestantId: c._id,
        country: c.country,
        countryCode: c.countryCode,
        artist: c.artist,
        song: c.song,
        imageUrl: c.imageUrl,
        predictedSemiRank,
        actualSemiPlacement,
        bonusScore,
      };
    });
  }

  const sf1BonusRows = buildSFBonusRows(sf1ByEntryId, hasAnyS1Results);
  const sf2BonusRows = buildSFBonusRows(sf2ByEntryId, hasAnyS2Results);

  const sf1BonusTotal =
    sf1BonusRows === null
      ? null
      : sf1BonusRows.reduce((total, row) => total + (row.bonusScore ?? 0), 0);
  const sf2BonusTotal =
    sf2BonusRows === null
      ? null
      : sf2BonusRows.reduce((total, row) => total + (row.bonusScore ?? 0), 0);

  const hasAnyScore = sf1BonusTotal !== null || sf2BonusTotal !== null || gfScore !== null;
  const totalScore = hasAnyScore
    ? (gfScore ?? 0) + (sf1BonusTotal ?? 0) + (sf2BonusTotal ?? 0)
    : null;

  return {
    originalTop25,
    effectiveGFRanking,
    backfilledContestants,
    gfRows,
    gfScore,
    sf1BonusRows,
    sf1BonusTotal,
    sf2BonusRows,
    sf2BonusTotal,
    totalScore,
  };
}
