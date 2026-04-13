import { mutation } from "./_generated/server";

import results2023 from "./data/results_2023.json";
import results2024 from "./data/results_2024.json";
import results2025 from "./data/results_2025.json";

// Timestamps: 12 May 2026 20:00 CEST = 18:00 UTC, etc.
const SF1_CUTOFF = Date.UTC(2026, 4, 12, 18, 0, 0); // 12 May 2026 18:00 UTC
const SF2_CUTOFF = Date.UTC(2026, 4, 14, 18, 0, 0); // 14 May 2026 18:00 UTC
const GF_CUTOFF = Date.UTC(2026, 4, 16, 18, 0, 0); // 16 May 2026 18:00 UTC

type Contestant2026 = {
  entryId: string;
  country: string;
  countryCode: string;
  artist: string;
  song: string;
  semiGroup?: "semi1" | "semi2" | "auto";
};

const SF1_2026: Contestant2026[] = [
  { entryId: "MD", country: "Moldova", countryCode: "MD", artist: "Satoshi", song: "Viva, Moldova!" },
  { entryId: "SE", country: "Sweden", countryCode: "SE", artist: "Felicia", song: "My System" },
  { entryId: "HR", country: "Croatia", countryCode: "HR", artist: "Lelek", song: "Andromeda" },
  { entryId: "GR", country: "Greece", countryCode: "GR", artist: "Akylas", song: "Ferto" },
  { entryId: "PT", country: "Portugal", countryCode: "PT", artist: "Bandidos do Cante", song: "Rosa" },
  { entryId: "GE", country: "Georgia", countryCode: "GE", artist: "Bzikebi", song: "On Replay" },
  { entryId: "FI", country: "Finland", countryCode: "FI", artist: "Linda Lampenius and Pete Parkkonen", song: "Liekinheitin" },
  { entryId: "ME", country: "Montenegro", countryCode: "ME", artist: "Tamara Živković", song: "Nova zora" },
  { entryId: "EE", country: "Estonia", countryCode: "EE", artist: "Vanilla Ninja", song: "Too Epic to Be True" },
  { entryId: "IL", country: "Israel", countryCode: "IL", artist: "Noam Bettan", song: "Michelle" },
  { entryId: "BE", country: "Belgium", countryCode: "BE", artist: "Essyla", song: "Dancing on the Ice" },
  { entryId: "LT", country: "Lithuania", countryCode: "LT", artist: "Lion Ceccah", song: "Sólo quiero más" },
  { entryId: "SM", country: "San Marino", countryCode: "SM", artist: "Senhit", song: "Superstar" },
  { entryId: "PL", country: "Poland", countryCode: "PL", artist: "Alicja", song: "Pray" },
  { entryId: "RS", country: "Serbia", countryCode: "RS", artist: "Lavina", song: "Kraj mene" },
];

const SF2_2026: Contestant2026[] = [
  { entryId: "BG", country: "Bulgaria", countryCode: "BG", artist: "Dara", song: "Bangaranga" },
  { entryId: "AZ", country: "Azerbaijan", countryCode: "AZ", artist: "Jiva", song: "Just Go" },
  { entryId: "RO", country: "Romania", countryCode: "RO", artist: "Alexandra Căpitănescu", song: "Choke Me" },
  { entryId: "LU", country: "Luxembourg", countryCode: "LU", artist: "Eva Marija", song: "Mother Nature" },
  { entryId: "CZ", country: "Czechia", countryCode: "CZ", artist: "Daniel Zizka", song: "Crossroads" },
  { entryId: "AM", country: "Armenia", countryCode: "AM", artist: "Simón", song: "Paloma rumba" },
  { entryId: "CH", country: "Switzerland", countryCode: "CH", artist: "Veronica Fusaro", song: "Alice" },
  { entryId: "CY", country: "Cyprus", countryCode: "CY", artist: "Antigoni", song: "Jalla" },
  { entryId: "LV", country: "Latvia", countryCode: "LV", artist: "Atvara", song: "Ēnā" },
  { entryId: "DK", country: "Denmark", countryCode: "DK", artist: "Søren Torpegaard Lund", song: "Før vi går hjem" },
  { entryId: "AU", country: "Australia", countryCode: "AU", artist: "Delta Goodrem", song: "Eclipse" },
  { entryId: "UA", country: "Ukraine", countryCode: "UA", artist: "Leléka", song: "Ridnym" },
  { entryId: "AL", country: "Albania", countryCode: "AL", artist: "Alis", song: "Nân" },
  { entryId: "MT", country: "Malta", countryCode: "MT", artist: "Aidan", song: "Bella" },
  { entryId: "NO", country: "Norway", countryCode: "NO", artist: "Jonas Lovv", song: "Ya Ya Ya" },
];

const AUTO_QUALIFIERS_2026: Contestant2026[] = [
  { entryId: "FR", country: "France", countryCode: "FR", artist: "Monroe", song: "Regarde !", semiGroup: "auto" },
  { entryId: "DE", country: "Germany", countryCode: "DE", artist: "Sarah Engels", song: "Fire", semiGroup: "auto" },
  { entryId: "IT", country: "Italy", countryCode: "IT", artist: "Sal Da Vinci", song: "Per sempre sì", semiGroup: "auto" },
  { entryId: "GB", country: "United Kingdom", countryCode: "GB", artist: "Look Mum No Computer", song: "Eins, Zwei, Drei", semiGroup: "auto" },
  { entryId: "AT", country: "Austria", countryCode: "AT", artist: "Cosmó", song: "Tanzschein", semiGroup: "auto" },
];

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

export const seed2026 = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    async function upsertContest(data: {
      slug: string;
      season: number;
      name: string;
      shortName: string;
      description: string;
      heroBlurb: string;
      status: "draft" | "open" | "results" | "archived";
      predictionCutoff?: number;
      contestType: "semi1" | "semi2" | "final" | "combined";
    }) {
      const existing = await ctx.db
        .query("contests")
        .withIndex("by_slug", (q) => q.eq("slug", data.slug))
        .unique();

      if (existing) {
        await ctx.db.patch("contests", existing._id, { ...data, updatedAt: now });
        return (await ctx.db.get("contests", existing._id))!;
      }

      const id = await ctx.db.insert("contests", { ...data, updatedAt: now });
      return (await ctx.db.get("contests", id))!;
    }

    async function upsertContestants(
      contestId: string & { __tableName: "contests" },
      contestants: Contestant2026[],
      extraFields?: { semiGroup?: "semi1" | "semi2" | "auto" },
    ) {
      const existing = await ctx.db
        .query("contestants")
        .withIndex("by_contestId", (q) => q.eq("contestId", contestId))
        .collect();
      const byEntryId = new Map(existing.map((c) => [c.entryId, c]));

      for (const [index, c] of contestants.entries()) {
        const payload = {
          contestId,
          entryId: c.entryId,
          sortOrder: index + 1,
          country: c.country,
          countryCode: c.countryCode,
          artist: c.artist,
          song: c.song,
          imageUrl: `/images/contestants/${c.countryCode}_cardimage.jpg`,
          semiGroup: c.semiGroup ?? extraFields?.semiGroup,
        };

        const existingC = byEntryId.get(c.entryId);
        if (existingC) {
          await ctx.db.patch("contestants", existingC._id, payload);
        } else {
          await ctx.db.insert("contestants", payload);
        }
      }
    }

    // SF1
    const sf1 = await upsertContest({
      slug: "sf1-2026",
      season: 2026,
      name: "Eurovision 2026 — Semi Final 1",
      shortName: "SF1 2026",
      description: "Predict the running order and results of the first semi-final.",
      heroBlurb: "15 countries, 10 spots. Who makes it through from Semi Final 1?",
      status: "open",
      predictionCutoff: SF1_CUTOFF,
      contestType: "semi1",
    });
    await upsertContestants(sf1._id, SF1_2026);

    // SF2
    const sf2 = await upsertContest({
      slug: "sf2-2026",
      season: 2026,
      name: "Eurovision 2026 — Semi Final 2",
      shortName: "SF2 2026",
      description: "Predict the running order and results of the second semi-final.",
      heroBlurb: "15 countries, 10 spots. Who makes it through from Semi Final 2?",
      status: "open",
      predictionCutoff: SF2_CUTOFF,
      contestType: "semi2",
    });
    await upsertContestants(sf2._id, SF2_2026);

    // Combined — all 35, semiGroup set per contestant
    const combined = await upsertContest({
      slug: "combined-2026",
      season: 2026,
      name: "Eurovision 2026 — Combined",
      shortName: "Combined 2026",
      description:
        "Rank all 35 entrants. Your top 25 become your Grand Final picks, with backfills if any don't qualify. Earn bonus points for predicting the semi-final rankings too.",
      heroBlurb:
        "The full challenge. Rank all 35 countries — semi-finalists and all. Your top 25 are your Grand Final picks, and you'll earn bonus points for calling the semis right.",
      status: "open",
      predictionCutoff: SF1_CUTOFF,
      contestType: "combined",
    });

    const combinedContestants: Contestant2026[] = [
      // SF1 group (running order 1–15)
      ...SF1_2026.map((c) => ({ ...c, semiGroup: "semi1" as const })),
      // SF2 group (running order 16–30)
      ...SF2_2026.map((c) => ({ ...c, semiGroup: "semi2" as const })),
      // Auto-qualifiers (31–35, alphabetical)
      ...AUTO_QUALIFIERS_2026.sort((a, b) => a.country.localeCompare(b.country)),
    ];
    await upsertContestants(combined._id, combinedContestants);

    // GF (draft — only auto-qualifiers seeded now; semi-qualifiers added via finalizeGFLineup)
    // Austria is draw position 25; others TBD (sortOrder 0 = position to be announced)
    const gf = await upsertContest({
      slug: "gf-2026",
      season: 2026,
      name: "Eurovision 2026 — Grand Final",
      shortName: "Grand Final 2026",
      description: "Predict the final ranking of all 25 Grand Final acts.",
      heroBlurb: "25 countries, one winner. Predict the Grand Final from start to finish.",
      status: "draft",
      predictionCutoff: GF_CUTOFF,
      contestType: "final",
    });

    const gfAutoContestants = AUTO_QUALIFIERS_2026.map((c) => ({
      ...c,
      // Austria has confirmed draw position 25; others TBD
      sortOrder: c.countryCode === "AT" ? 25 : 0,
    }));

    const existingGF = await ctx.db
      .query("contestants")
      .withIndex("by_contestId", (q) => q.eq("contestId", gf._id))
      .collect();
    const gfByEntryId = new Map(existingGF.map((c) => [c.entryId, c]));

    for (const c of gfAutoContestants) {
      const payload = {
        contestId: gf._id,
        entryId: c.entryId,
        sortOrder: c.sortOrder,
        country: c.country,
        countryCode: c.countryCode,
        artist: c.artist,
        song: c.song,
        imageUrl: `/images/contestants/${c.countryCode}_cardimage.jpg`,
        semiGroup: "auto" as const,
      };
      const existing = gfByEntryId.get(c.entryId);
      if (existing) {
        await ctx.db.patch("contestants", existing._id, payload);
      } else {
        await ctx.db.insert("contestants", payload);
      }
    }

    // Set active contest IDs
    const settingsRecord = await ctx.db
      .query("appSettings")
      .withIndex("by_key", (q) => q.eq("key", "global"))
      .unique();

    const activeContestIds = [sf1._id, sf2._id, combined._id];

    if (settingsRecord) {
      await ctx.db.patch("appSettings", settingsRecord._id, {
        activeContestIds,
        activeContestId: combined._id,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("appSettings", {
        key: "global",
        activeContestIds,
        activeContestId: combined._id,
        updatedAt: now,
      });
    }

    return {
      sf1: sf1.slug,
      sf2: sf2.slug,
      combined: combined.slug,
      gf: gf.slug,
      activeContestIds: activeContestIds.length,
    };
  },
});
