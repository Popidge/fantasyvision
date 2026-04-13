import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import {
  buildPredictionRows,
  buildCombinedPredictionData,
  calculateMaxPossibleScore,
  calculatePredictionScore,
} from "./lib/scoring";
import { effectiveName, getViewerByIdentity, requireViewerForMutation } from "./lib/viewer";

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
    contestType: contest.contestType ?? null,
  };
}

export const saveViewerPrediction = mutation({
  args: {
    contestId: v.id("contests"),
    ranking: v.array(v.id("contestants")),
  },
  handler: async (ctx, args) => {
    const viewer = await requireViewerForMutation(ctx);
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

    // For combined contests: validate auto-qualifiers are all in top 25
    if (contest.contestType === "combined") {
      const autoQualifierIds = new Set(
        contestants.filter((c) => c.semiGroup === "auto").map((c) => c._id),
      );
      const top25 = new Set(args.ranking.slice(0, 25));
      for (const autoId of autoQualifierIds) {
        if (!top25.has(autoId)) {
          throw new ConvexError("Auto-qualified countries must be in your top 25.");
        }
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
  args: {
    contestId: v.id("contests"),
  },
  handler: async (ctx, args) => {
    const contest = await ctx.db.get("contests", args.contestId);

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
          name: effectiveName(viewer),
          imageUrl: viewer.imageUrl ?? null,
        },
      },
    };
  },
});

export const getViewerCombinedPrediction = query({
  args: {
    contestId: v.id("contests"),
  },
  handler: async (ctx, args) => {
    const contest = await ctx.db.get("contests", args.contestId);
    if (!contest || contest.contestType !== "combined") return null;

    const identity = await ctx.auth.getUserIdentity();
    const viewer = await getViewerByIdentity(ctx, identity);

    if (!viewer) {
      return { contest: contestCard(contest), prediction: null };
    }

    const prediction = await ctx.db
      .query("predictions")
      .withIndex("by_userId_and_contestId", (q) =>
        q.eq("userId", viewer._id).eq("contestId", contest._id),
      )
      .unique();

    if (!prediction) {
      return { contest: contestCard(contest), prediction: null };
    }

    const combinedContestants = await getContestantsForContest(ctx, contest._id);

    // Find sibling contests by contestType and season
    const allContests = (await ctx.db.query("contests").collect()).filter(
      (c) => c.season === contest.season,
    );
    const sf1Contest = allContests.find((c) => c.contestType === "semi1") ?? null;
    const sf2Contest = allContests.find((c) => c.contestType === "semi2") ?? null;
    const gfContest = allContests.find((c) => c.contestType === "final") ?? null;

    const sf1Contestants = sf1Contest
      ? await getContestantsForContest(ctx, sf1Contest._id)
      : [];
    const sf2Contestants = sf2Contest
      ? await getContestantsForContest(ctx, sf2Contest._id)
      : [];
    const gfContestants = gfContest
      ? await getContestantsForContest(ctx, gfContest._id)
      : [];

    const combinedData = buildCombinedPredictionData(
      prediction.ranking,
      combinedContestants,
      sf1Contestants,
      sf2Contestants,
      gfContestants,
    );

    return {
      contest: contestCard(contest),
      prediction: {
        _id: prediction._id,
        updatedAt: prediction.updatedAt,
        user: {
          name: effectiveName(viewer),
          imageUrl: viewer.imageUrl ?? null,
        },
        ranking: prediction.ranking,
        combinedContestants,
        ...combinedData,
        // Sets are not serialisable — convert to array for the client
        backfilledContestants: Array.from(combinedData.backfilledContestants),
      },
    };
  },
});

export const getViewerAllActivePredictions = query({
  args: {},
  handler: async (ctx) => {
    const settings = await ctx.db
      .query("appSettings")
      .withIndex("by_key", (q) => q.eq("key", "global"))
      .unique();

    if (!settings) return [];

    const activeIds: Id<"contests">[] =
      settings.activeContestIds && settings.activeContestIds.length > 0
        ? settings.activeContestIds
        : settings.activeContestId
          ? [settings.activeContestId]
          : [];

    if (activeIds.length === 0) return [];

    const identity = await ctx.auth.getUserIdentity();
    const viewer = await getViewerByIdentity(ctx, identity);

    // Pre-load sibling contests once (for combined scoring)
    const allContests = await ctx.db.query("contests").collect();

    const results = await Promise.all(
      activeIds.map(async (contestId) => {
        const contest = await ctx.db.get("contests", contestId);
        if (!contest) return null;

        if (!viewer) {
          return { contest: contestCard(contest), prediction: null };
        }

        const prediction = await ctx.db
          .query("predictions")
          .withIndex("by_userId_and_contestId", (q) =>
            q.eq("userId", viewer._id).eq("contestId", contestId),
          )
          .unique();

        if (!prediction) {
          return { contest: contestCard(contest), prediction: null };
        }

        const contestants = await getContestantsForContest(ctx, contestId);

        if (contest.contestType === "combined") {
          const sf1 = allContests.find((c) => c.season === contest.season && c.contestType === "semi1");
          const sf2 = allContests.find((c) => c.season === contest.season && c.contestType === "semi2");
          const gf = allContests.find((c) => c.season === contest.season && c.contestType === "final");

          const sf1C = sf1 ? await getContestantsForContest(ctx, sf1._id) : [];
          const sf2C = sf2 ? await getContestantsForContest(ctx, sf2._id) : [];
          const gfC = gf ? await getContestantsForContest(ctx, gf._id) : [];

          const combinedData = buildCombinedPredictionData(prediction.ranking, contestants, sf1C, sf2C, gfC);

          return {
            contest: contestCard(contest),
            prediction: {
              _id: prediction._id,
              updatedAt: prediction.updatedAt,
              isCombined: true as const,
              user: { name: effectiveName(viewer), imageUrl: viewer.imageUrl ?? null },
              ranking: prediction.ranking,
              combinedContestants: contestants,
              ...combinedData,
              backfilledContestants: Array.from(combinedData.backfilledContestants),
            },
          };
        }

        const rows = buildPredictionRows(prediction.ranking, contestants);
        const totalScore = calculatePredictionScore(prediction.ranking, contestants);

        return {
          contest: contestCard(contest),
          prediction: {
            _id: prediction._id,
            updatedAt: prediction.updatedAt,
            isCombined: false as const,
            totalScore,
            maxPossibleScore: calculateMaxPossibleScore(contestants),
            rows,
            user: { name: effectiveName(viewer), imageUrl: viewer.imageUrl ?? null },
          },
        };
      }),
    );

    return results.filter((r): r is NonNullable<typeof r> => r !== null);
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

    if (contest.contestType === "combined") {
      const allContests = (await ctx.db.query("contests").collect()).filter(
        (c) => c.season === contest.season,
      );
      const sf1Contest = allContests.find((c) => c.contestType === "semi1") ?? null;
      const sf2Contest = allContests.find((c) => c.contestType === "semi2") ?? null;
      const gfContest = allContests.find((c) => c.contestType === "final") ?? null;

      const sf1Contestants = sf1Contest
        ? await getContestantsForContest(ctx, sf1Contest._id)
        : [];
      const sf2Contestants = sf2Contest
        ? await getContestantsForContest(ctx, sf2Contest._id)
        : [];
      const gfContestants = gfContest
        ? await getContestantsForContest(ctx, gfContest._id)
        : [];

      const combinedData = buildCombinedPredictionData(
        prediction.ranking,
        contestants,
        sf1Contestants,
        sf2Contestants,
        gfContestants,
      );

      return {
        contest: contestCard(contest),
        prediction: {
          _id: prediction._id,
          updatedAt: prediction.updatedAt,
          ranking: prediction.ranking,
          combinedContestants: contestants,
          ...combinedData,
          backfilledContestants: Array.from(combinedData.backfilledContestants),
        },
        user: { name: effectiveName(user), imageUrl: user.imageUrl ?? null },
      };
    }

    return {
      contest: contestCard(contest),
      prediction: {
        _id: prediction._id,
        updatedAt: prediction.updatedAt,
        totalScore: calculatePredictionScore(prediction.ranking, contestants),
        maxPossibleScore: calculateMaxPossibleScore(contestants),
        rows: buildPredictionRows(prediction.ranking, contestants),
      },
      user: { name: effectiveName(user), imageUrl: user.imageUrl ?? null },
    };
  },
});
