import { query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { alphabeticalContestants } from "./lib/scoring";
import { getViewerByIdentity } from "./lib/viewer";

async function getGlobalSettings(ctx: { db: typeof query extends never ? never : any }) {
  return await ctx.db
    .query("appSettings")
    .withIndex("by_key", (q: any) => q.eq("key", "global"))
    .unique();
}

async function getActiveContest(ctx: { db: any }) {
  const settings = await getGlobalSettings(ctx);

  if (!settings?.activeContestId) {
    return null;
  }

  return await ctx.db.get("contests", settings.activeContestId);
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
    const contest = await getActiveContest(ctx);

    if (!contest) {
      return {
        activeContest: null,
        archivedContests: [],
        spotlightLeagues: [],
        stats: null,
      };
    }

    const contestants = await getContestantsForContest(ctx, contest._id);
    const allPredictions = await ctx.db
      .query("predictions")
      .withIndex("by_contestId", (q) => q.eq("contestId", contest._id))
      .collect();
    const allLeagues = await ctx.db
      .query("leagues")
      .withIndex("by_contestId", (q) => q.eq("contestId", contest._id))
      .collect();

    const publicLeagues = await Promise.all(
      allLeagues
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

    const archivedContests = (
      await ctx.db.query("contests").collect()
    )
      .filter((entry) => entry._id !== contest._id)
      .sort((left, right) => right.season - left.season)
      .map(contestSummary);

    return {
      activeContest: contestSummary(contest),
      archivedContests,
      spotlightLeagues: publicLeagues,
      stats: {
        contestants: contestants.length,
        predictions: allPredictions.length,
        publicLeagues: allLeagues.filter((league) => league.visibility === "public").length,
      },
    };
  },
});

export const getPredictPageData = query({
  args: {},
  handler: async (ctx) => {
    const contest = await getActiveContest(ctx);

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
            name: viewer.name,
            imageUrl: viewer.imageUrl ?? null,
          }
        : null,
    };
  },
});
