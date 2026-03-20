import type { Doc, Id } from "../_generated/dataModel";

const SCORE_BY_DIFFERENCE = [12, 10, 8, 7, 6, 5, 4, 3, 2, 1] as const;

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
