import { v } from "convex/values";

import { query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { alphabeticalContestants } from "./lib/scoring";
import { effectiveName, getViewerByIdentity } from "./lib/viewer";

async function getGlobalSettings(ctx: { db: typeof query extends never ? never : any }) {
  return await ctx.db
    .query("appSettings")
    .withIndex("by_key", (q: any) => q.eq("key", "global"))
    .unique();
}

async function getActiveContestList(ctx: { db: any }): Promise<Doc<"contests">[]> {
  const settings = await getGlobalSettings(ctx);
  if (!settings) return [];

  if (settings.activeContestIds && settings.activeContestIds.length > 0) {
    const contests = await Promise.all(
      settings.activeContestIds.map((id: Id<"contests">) => ctx.db.get("contests", id)),
    );
    return contests.filter((c: Doc<"contests"> | null): c is Doc<"contests"> => c !== null);
  }

  // Legacy fallback
  if (settings.activeContestId) {
    const contest = await ctx.db.get("contests", settings.activeContestId);
    return contest ? [contest] : [];
  }

  return [];
}

async function getContestantsForContest(ctx: { db: any }, contestId: Id<"contests">) {
  return await ctx.db
    .query("contestants")
    .withIndex("by_contestId_and_sortOrder", (q: any) => q.eq("contestId", contestId))
    .collect();
}

function contestSummary(contest: Doc<"contests">) {
  return {
    _id: contest._id,
    slug: contest.slug,
    season: contest.season,
    name: contest.name,
    shortName: contest.shortName,
    description: contest.description,
    heroBlurb: contest.heroBlurb,
    status: contest.status,
    contestType: contest.contestType ?? null,
    predictionCutoff: contest.predictionCutoff ?? null,
  };
}

function publicLeagueCard(league: Doc<"leagues">, memberCount: number) {
  return {
    _id: league._id,
    name: league.name,
    visibility: league.visibility,
    joinCode: league.joinCode ?? null,
    memberCount,
  };
}

export const getHomeData = query({
  args: {},
  handler: async (ctx) => {
    const activeContests = await getActiveContestList(ctx);

    if (activeContests.length === 0) {
      return {
        activeContests: [],
        archivedContests: [],
        spotlightLeagues: [],
        stats: null,
      };
    }

    // Stats summed across all active contests
    let totalPredictions = 0;
    let totalPublicLeagues = 0;

    for (const contest of activeContests) {
      const predictions = await ctx.db
        .query("predictions")
        .withIndex("by_contestId", (q) => q.eq("contestId", contest._id))
        .collect();
      const leagues = await ctx.db
        .query("leagues")
        .withIndex("by_contestId", (q) => q.eq("contestId", contest._id))
        .collect();

      totalPredictions += predictions.length;
      totalPublicLeagues += leagues.filter((l) => l.visibility === "public").length;
    }

    const totalUsers = await ctx.db.query("users").collect().then((rows) => rows.length);

    // Spotlight leagues from the first active contest
    const primaryContest = activeContests[0];
    const primaryLeagues = await ctx.db
      .query("leagues")
      .withIndex("by_contestId", (q) => q.eq("contestId", primaryContest._id))
      .collect();

    const spotlightLeagues = await Promise.all(
      primaryLeagues
        .filter((league) => league.visibility === "public")
        .slice(0, 3)
        .map(async (league) => {
          const members = await ctx.db
            .query("leagueMembers")
            .withIndex("by_leagueId", (q) => q.eq("leagueId", league._id))
            .collect();
          return publicLeagueCard(league, members.length);
        }),
    );

    const archivedContests = (await ctx.db.query("contests").collect())
      .filter((entry) => !activeContests.some((a) => a._id === entry._id) && entry.status !== "draft")
      .sort((left, right) => right.season - left.season)
      .map(contestSummary);

    return {
      activeContests: activeContests.map(contestSummary),
      archivedContests,
      spotlightLeagues,
      stats: {
        users: totalUsers,
        predictions: totalPredictions,
        publicLeagues: totalPublicLeagues,
      },
    };
  },
});

export const getActiveContests = query({
  args: {},
  handler: async (ctx) => {
    const contests = await getActiveContestList(ctx);
    return contests.map(contestSummary);
  },
});

export const getPredictPageData = query({
  args: {
    contestSlug: v.string(),
  },
  handler: async (ctx, args) => {
    const contest = await ctx.db
      .query("contests")
      .withIndex("by_slug", (q) => q.eq("slug", args.contestSlug))
      .unique();

    if (!contest) {
      return null;
    }

    const identity = await ctx.auth.getUserIdentity();
    const viewer = await getViewerByIdentity(ctx, identity);
    const contestants = await getContestantsForContest(ctx, contest._id);
    const existingPrediction = viewer
      ? await ctx.db
          .query("predictions")
          .withIndex("by_userId_and_contestId", (q) =>
            q.eq("userId", viewer._id).eq("contestId", contest._id),
          )
          .unique()
      : null;

    return {
      contest: contestSummary(contest),
      contestants: alphabeticalContestants(contestants),
      existingRanking: existingPrediction?.ranking ?? null,
      viewer: viewer
        ? {
            _id: viewer._id,
            name: effectiveName(viewer),
            imageUrl: viewer.imageUrl ?? null,
          }
        : null,
    };
  },
});
