import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import {
  buildPredictionRows,
  calculateMaxPossibleScore,
  calculatePredictionScore,
} from "./lib/scoring";
import { getViewerByIdentity, requireViewer } from "./lib/viewer";

async function getActiveContest(ctx: { db: any }) {
  const settings = await ctx.db
    .query("appSettings")
    .withIndex("by_key", (q: any) => q.eq("key", "global"))
    .unique();

  if (!settings?.activeContestId) {
    return null;
  }

  return await ctx.db.get("contests", settings.activeContestId);
}

async function getContestantsForContest(ctx: { db: any }, contestId: Id<"contests">) {
  return (await ctx.db
    .query("contestants")
    .withIndex("by_contestId_and_sortOrder", (q: any) => q.eq("contestId", contestId))
    .collect()) as Doc<"contestants">[];
}

function contestCard(contest: Doc<"contests">) {
  return {
    _id: contest._id,
    slug: contest.slug,
    season: contest.season,
    name: contest.name,
    shortName: contest.shortName,
    status: contest.status,
  };
}

export const saveViewerPrediction = mutation({
  args: {
    contestId: v.id("contests"),
    ranking: v.array(v.id("contestants")),
  },
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    const contest = await ctx.db.get("contests", args.contestId);

    if (!contest) {
      throw new ConvexError("That contest no longer exists.");
    }

    const contestants = await getContestantsForContest(ctx, args.contestId);
    const contestantIds = new Set(contestants.map((contestant) => contestant._id));

    if (args.ranking.length !== contestants.length) {
      throw new ConvexError("Please rank every contestant before saving.");
    }

    if (new Set(args.ranking).size !== args.ranking.length) {
      throw new ConvexError("Your ranking contains duplicate contestants.");
    }

    for (const contestantId of args.ranking) {
      if (!contestantIds.has(contestantId)) {
        throw new ConvexError("Your ranking does not match this contest.");
      }
    }

    const existing = await ctx.db
      .query("predictions")
      .withIndex("by_userId_and_contestId", (q) =>
        q.eq("userId", viewer._id).eq("contestId", args.contestId),
      )
      .unique();

    if (existing) {
      await ctx.db.patch("predictions", existing._id, {
        ranking: args.ranking,
        updatedAt: Date.now(),
      });
      return existing._id;
    }

    return await ctx.db.insert("predictions", {
      contestId: args.contestId,
      userId: viewer._id,
      ranking: args.ranking,
      updatedAt: Date.now(),
    });
  },
});

export const getViewerPrediction = query({
  args: {},
  handler: async (ctx) => {
    const contest = await getActiveContest(ctx);

    if (!contest) {
      return null;
    }

    const identity = await ctx.auth.getUserIdentity();
    const viewer = await getViewerByIdentity(ctx, identity);

    if (!viewer) {
      return {
        contest: contestCard(contest),
        prediction: null,
      };
    }

    const prediction = await ctx.db
      .query("predictions")
      .withIndex("by_userId_and_contestId", (q) =>
        q.eq("userId", viewer._id).eq("contestId", contest._id),
      )
      .unique();

    if (!prediction) {
      return {
        contest: contestCard(contest),
        prediction: null,
      };
    }

    const contestants = await getContestantsForContest(ctx, contest._id);
    const rows = buildPredictionRows(prediction.ranking, contestants);
    const totalScore = calculatePredictionScore(prediction.ranking, contestants);

    return {
      contest: contestCard(contest),
      prediction: {
        _id: prediction._id,
        updatedAt: prediction.updatedAt,
        totalScore,
        maxPossibleScore: calculateMaxPossibleScore(contestants),
        rows,
        user: {
          name: viewer.name,
          imageUrl: viewer.imageUrl ?? null,
        },
      },
    };
  },
});

export const getSharedPrediction = query({
  args: {
    predictionId: v.id("predictions"),
  },
  handler: async (ctx, args) => {
    const prediction = await ctx.db.get("predictions", args.predictionId);

    if (!prediction) {
      return null;
    }

    const contest = await ctx.db.get("contests", prediction.contestId);
    const user = await ctx.db.get("users", prediction.userId);

    if (!contest || !user) {
      return null;
    }

    const contestants = await getContestantsForContest(ctx, contest._id);

    return {
      contest: contestCard(contest),
      prediction: {
        _id: prediction._id,
        updatedAt: prediction.updatedAt,
        totalScore: calculatePredictionScore(prediction.ranking, contestants),
        maxPossibleScore: calculateMaxPossibleScore(contestants),
        rows: buildPredictionRows(prediction.ranking, contestants),
      },
      user: {
        name: user.name,
        imageUrl: user.imageUrl ?? null,
      },
    };
  },
});
