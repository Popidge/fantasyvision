import { mutation } from "./_generated/server";

import results2023 from "./data/results_2023.json";
import results2024 from "./data/results_2024.json";
import results2025 from "./data/results_2025.json";

type SeedContestant = {
  id: string;
  country: string;
  countryCode: string;
  artist: string;
  song: string;
  imageUrl: string;
  youtubeUrl?: string;
  placement: number;
  points: number;
};

const seasons = [
  {
    slug: "eurovision-2023",
    season: 2023,
    name: "Eurovision Song Contest 2023",
    shortName: "Eurovision 2023",
    description:
      "A fully scored archive contest for replaying the Liverpool final with modern FantasyVision tooling.",
    heroBlurb:
      "Replay the 2023 season, compare your instincts against the final scoreboard, and pressure-test your music taste with friends.",
    status: "archived" as const,
    data: results2023 as SeedContestant[],
  },
  {
    slug: "eurovision-2024",
    season: 2024,
    name: "Eurovision Song Contest 2024",
    shortName: "Eurovision 2024",
    description:
      "Archive season data from Malmo, ready for private leagues, shared picks, and retro scoring.",
    heroBlurb:
      "Re-rank the 2024 lineup, spin up a quick league, and see who was closest once the votes settled.",
    status: "archived" as const,
    data: results2024 as SeedContestant[],
  },
  {
    slug: "eurovision-2025",
    season: 2025,
    name: "Eurovision Song Contest 2025",
    shortName: "Eurovision 2025",
    description:
      "The current legacy season in this port. It is set as the active contest so the rebuilt app has real data on day one.",
    heroBlurb:
      "A polished retro season to stress-test the new stack before the 2026 entrants land.",
    status: "results" as const,
    data: results2025 as SeedContestant[],
  },
];

export const seedLegacyData = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const contestsBySlug = new Map(
      (await ctx.db.query("contests").collect()).map((contest) => [contest.slug, contest]),
    );

    let activeContestId = null;

    for (const season of seasons) {
      let contest = contestsBySlug.get(season.slug) ?? null;

      if (!contest) {
        const contestId = await ctx.db.insert("contests", {
          slug: season.slug,
          season: season.season,
          name: season.name,
          shortName: season.shortName,
          description: season.description,
          heroBlurb: season.heroBlurb,
          status: season.status,
          updatedAt: now,
        });

        contest = (await ctx.db.get("contests", contestId))!;
        contestsBySlug.set(season.slug, contest);
      } else {
        await ctx.db.patch("contests", contest._id, {
          season: season.season,
          name: season.name,
          shortName: season.shortName,
          description: season.description,
          heroBlurb: season.heroBlurb,
          status: season.status,
          updatedAt: now,
        });
      }

      const contestantDocs = await ctx.db
        .query("contestants")
        .withIndex("by_contestId", (q) => q.eq("contestId", contest._id))
        .collect();
      const contestantsByEntryId = new Map(
        contestantDocs.map((contestant) => [contestant.entryId, contestant]),
      );

      for (const [index, contestant] of season.data.entries()) {
        const payload = {
          contestId: contest._id,
          entryId: contestant.id,
          sortOrder: index + 1,
          country: contestant.country,
          countryCode: contestant.countryCode,
          artist: contestant.artist,
          song: contestant.song,
          imageUrl: `/images/contestants/${contestant.countryCode}_cardimage.jpg`,
          youtubeUrl: contestant.youtubeUrl,
          placement: contestant.placement,
          points: contestant.points,
        };

        const existingContestant = contestantsByEntryId.get(contestant.id);

        if (existingContestant) {
          await ctx.db.patch("contestants", existingContestant._id, payload);
        } else {
          await ctx.db.insert("contestants", payload);
        }
      }

      if (season.slug === "eurovision-2025") {
        activeContestId = contest._id;
      }
    }

    const existingSettings = await ctx.db
      .query("appSettings")
      .withIndex("by_key", (q) => q.eq("key", "global"))
      .unique();

    if (existingSettings) {
      await ctx.db.patch("appSettings", existingSettings._id, {
        activeContestId: activeContestId ?? existingSettings.activeContestId,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("appSettings", {
        key: "global",
        activeContestId: activeContestId ?? undefined,
        updatedAt: now,
      });
    }

    return {
      contests: seasons.length,
      activeContestSlug: "eurovision-2025",
    };
  },
});
