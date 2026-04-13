import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import {
  buildPredictionRows,
  buildCombinedPredictionData,
  calculatePredictionScore,
} from "./lib/scoring";
import { effectiveName, getViewerByIdentity, requireViewerForMutation } from "./lib/viewer";

function createJoinCode(leagueId: string) {
  return leagueId.replace(/[^a-zA-Z0-9]/g, "").slice(-8).toUpperCase();
}

async function getActiveContestList(ctx: { db: any }): Promise<Doc<"contests">[]> {
  const settings = await ctx.db
    .query("appSettings")
    .withIndex("by_key", (q: any) => q.eq("key", "global"))
    .unique();

  if (!settings) return [];

  if (settings.activeContestIds && settings.activeContestIds.length > 0) {
    const contests = await Promise.all(
      settings.activeContestIds.map((id: Id<"contests">) => ctx.db.get("contests", id)),
    );
    return contests.filter((c: Doc<"contests"> | null): c is Doc<"contests"> => c !== null);
  }

  if (settings.activeContestId) {
    const contest = await ctx.db.get("contests", settings.activeContestId);
    return contest ? [contest] : [];
  }

  return [];
}


async function getMemberCount(ctx: { db: any }, leagueId: Id<"leagues">) {
  const members = await ctx.db
    .query("leagueMembers")
    .withIndex("by_leagueId", (q: any) => q.eq("leagueId", leagueId))
    .collect();
  return members.length;
}

function leagueSummary(league: Doc<"leagues">, memberCount: number, hasJoined: boolean) {
  return {
    _id: league._id,
    name: league.name,
    visibility: league.visibility,
    joinCode: league.joinCode ?? null,
    createdAt: league.createdAt,
    memberCount,
    hasJoined,
  };
}

async function addViewerToLeague(
  ctx: MutationCtx,
  leagueId: Id<"leagues">,
  joinCode: string | undefined,
) {
  const viewer = await requireViewerForMutation(ctx);
  const league = await ctx.db.get("leagues", leagueId);

  if (!league) {
    throw new ConvexError("That league no longer exists.");
  }

  const existingMembership = await ctx.db
    .query("leagueMembers")
    .withIndex("by_userId_and_leagueId", (q) =>
      q.eq("userId", viewer._id).eq("leagueId", leagueId),
    )
    .unique();

  if (existingMembership) {
    return leagueId;
  }

  if (league.visibility === "private" && league.joinCode !== joinCode?.trim().toUpperCase()) {
    throw new ConvexError("That invite code doesn't match.");
  }

  await ctx.db.insert("leagueMembers", {
    leagueId,
    userId: viewer._id,
    joinedAt: Date.now(),
  });

  return leagueId;
}

export const getLeaguesHub = query({
  args: {
    contestId: v.optional(v.id("contests")),
  },
  handler: async (ctx, args) => {
    let contest: Doc<"contests"> | null = null;

    if (args.contestId) {
      contest = await ctx.db.get("contests", args.contestId);
    } else {
      const active = await getActiveContestList(ctx);
      contest = active[0] ?? null;
    }

    if (!contest) {
      return null;
    }

    const identity = await ctx.auth.getUserIdentity();
    const viewer = await getViewerByIdentity(ctx, identity);
    const viewerMemberships = viewer
      ? await ctx.db
          .query("leagueMembers")
          .withIndex("by_userId", (q) => q.eq("userId", viewer._id))
          .collect()
      : [];
    const viewerLeagueIds = new Set(viewerMemberships.map((membership) => membership.leagueId));

    const leagues = await ctx.db
      .query("leagues")
      .withIndex("by_contestId", (q) => q.eq("contestId", contest._id))
      .collect();

    const enriched = await Promise.all(
      leagues.map(async (league) =>
        leagueSummary(
          league,
          await getMemberCount(ctx, league._id),
          viewerLeagueIds.has(league._id),
        ),
      ),
    );

    // Also surface all active contests so the UI can build a contest selector
    const allActive = await getActiveContestList(ctx);

    return {
      contest: {
        _id: contest._id,
        name: contest.name,
        shortName: contest.shortName,
        slug: contest.slug,
        contestType: contest.contestType ?? null,
      },
      activeContests: allActive.map((c) => ({
        _id: c._id,
        name: c.name,
        shortName: c.shortName,
        slug: c.slug,
        contestType: c.contestType ?? null,
      })),
      viewer: viewer
        ? {
            _id: viewer._id,
            name: effectiveName(viewer),
          }
        : null,
      viewerLeagues: enriched.filter((league) => league.hasJoined),
      publicLeagues: enriched.filter((league) => league.visibility === "public"),
    };
  },
});

export const createLeague = mutation({
  args: {
    contestId: v.id("contests"),
    name: v.string(),
    visibility: v.union(v.literal("public"), v.literal("private")),
  },
  handler: async (ctx, args) => {
    const viewer = await requireViewerForMutation(ctx);
    const trimmedName = args.name.trim();

    if (!trimmedName) {
      throw new ConvexError("Give your league a name first.");
    }

    const leagueId = await ctx.db.insert("leagues", {
      contestId: args.contestId,
      creatorUserId: viewer._id,
      name: trimmedName,
      visibility: args.visibility,
      createdAt: Date.now(),
      joinCode: args.visibility === "private" ? "PENDING" : undefined,
    });

    await ctx.db.insert("leagueMembers", {
      leagueId,
      userId: viewer._id,
      joinedAt: Date.now(),
    });

    if (args.visibility === "private") {
      await ctx.db.patch("leagues", leagueId, {
        joinCode: createJoinCode(leagueId),
      });
    }

    return leagueId;
  },
});

export const joinLeague = mutation({
  args: {
    leagueId: v.id("leagues"),
    joinCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await addViewerToLeague(ctx, args.leagueId, args.joinCode);
  },
});

export const joinLeagueByCode = mutation({
  args: {
    joinCode: v.string(),
  },
  handler: async (ctx, args) => {
    const league = await ctx.db
      .query("leagues")
      .withIndex("by_joinCode", (q) => q.eq("joinCode", args.joinCode.trim().toUpperCase()))
      .unique();

    if (!league) {
      throw new ConvexError("That invite code doesn't match any league.");
    }

    return await addViewerToLeague(ctx, league._id, args.joinCode);
  },
});

export const leaveLeague = mutation({
  args: {
    leagueId: v.id("leagues"),
  },
  handler: async (ctx, args) => {
    const viewer = await requireViewerForMutation(ctx);
    const league = await ctx.db.get("leagues", args.leagueId);

    if (!league) {
      throw new ConvexError("That league no longer exists.");
    }

    const membership = await ctx.db
      .query("leagueMembers")
      .withIndex("by_userId_and_leagueId", (q) =>
        q.eq("userId", viewer._id).eq("leagueId", args.leagueId),
      )
      .unique();

    if (!membership) {
      return args.leagueId;
    }

    if (league.creatorUserId === viewer._id) {
      const members = await ctx.db
        .query("leagueMembers")
        .withIndex("by_leagueId", (q) => q.eq("leagueId", args.leagueId))
        .collect();

      if (members.length > 1) {
        throw new ConvexError(
          "The league creator can't leave while other members are still in the league.",
        );
      }

      await ctx.db.delete("leagueMembers", membership._id);
      await ctx.db.delete("leagues", league._id);
      return args.leagueId;
    }

    await ctx.db.delete("leagueMembers", membership._id);
    return args.leagueId;
  },
});

export const getLeagueDetail = query({
  args: {
    leagueId: v.id("leagues"),
  },
  handler: async (ctx, args) => {
    const league = await ctx.db.get("leagues", args.leagueId);

    if (!league) {
      return null;
    }

    const contest = await ctx.db.get("contests", league.contestId);

    if (!contest) {
      return null;
    }

    const identity = await ctx.auth.getUserIdentity();
    const viewer = await getViewerByIdentity(ctx, identity);
    const membership = viewer
      ? await ctx.db
          .query("leagueMembers")
          .withIndex("by_userId_and_leagueId", (q) =>
            q.eq("userId", viewer._id).eq("leagueId", league._id),
          )
          .unique()
      : null;

    if (league.visibility === "private" && !membership) {
      return {
        access: "private",
        league: {
          _id: league._id,
          name: league.name,
          visibility: league.visibility,
        },
      };
    }

    const contestants = await ctx.db
      .query("contestants")
      .withIndex("by_contestId_and_sortOrder", (q) => q.eq("contestId", contest._id))
      .collect();
    const memberships = await ctx.db
      .query("leagueMembers")
      .withIndex("by_leagueId", (q) => q.eq("leagueId", league._id))
      .collect();

    // Pre-load sibling contests for combined scoring
    const isCombined = contest.contestType === "combined";
    let sf1Contestants: Doc<"contestants">[] = [];
    let sf2Contestants: Doc<"contestants">[] = [];
    let gfContestants: Doc<"contestants">[] = [];

    if (isCombined) {
      const allContests = (await ctx.db.query("contests").collect()).filter(
        (c) => c.season === contest.season,
      );
      const sf1 = allContests.find((c) => c.contestType === "semi1");
      const sf2 = allContests.find((c) => c.contestType === "semi2");
      const gf = allContests.find((c) => c.contestType === "final");

      if (sf1) sf1Contestants = await ctx.db.query("contestants").withIndex("by_contestId_and_sortOrder", (q) => q.eq("contestId", sf1._id)).collect();
      if (sf2) sf2Contestants = await ctx.db.query("contestants").withIndex("by_contestId_and_sortOrder", (q) => q.eq("contestId", sf2._id)).collect();
      if (gf) gfContestants = await ctx.db.query("contestants").withIndex("by_contestId_and_sortOrder", (q) => q.eq("contestId", gf._id)).collect();
    }

    const members = await Promise.all(
      memberships.map(async (member) => {
        const user = await ctx.db.get("users", member.userId);
        const prediction = await ctx.db
          .query("predictions")
          .withIndex("by_userId_and_contestId", (q) =>
            q.eq("userId", member.userId).eq("contestId", contest._id),
          )
          .unique();

        if (!user) {
          return null;
        }

        if (!prediction) {
          return {
            user: { _id: user._id, name: effectiveName(user), imageUrl: user.imageUrl ?? null },
            joinedAt: member.joinedAt,
            prediction: null,
          };
        }

        if (isCombined) {
          const combinedData = buildCombinedPredictionData(
            prediction.ranking,
            contestants,
            sf1Contestants,
            sf2Contestants,
            gfContestants,
          );
          return {
            user: { _id: user._id, name: effectiveName(user), imageUrl: user.imageUrl ?? null },
            joinedAt: member.joinedAt,
            prediction: {
              _id: prediction._id,
              updatedAt: prediction.updatedAt,
              totalScore: combinedData.totalScore,
              isCombined: true as const,
              gfScore: combinedData.gfScore,
              sf1BonusTotal: combinedData.sf1BonusTotal,
              sf2BonusTotal: combinedData.sf2BonusTotal,
              gfRows: combinedData.gfRows,
              sf1BonusRows: combinedData.sf1BonusRows,
              sf2BonusRows: combinedData.sf2BonusRows,
              backfilledContestants: Array.from(combinedData.backfilledContestants),
            },
          };
        }

        return {
          user: {
            _id: user._id,
            name: effectiveName(user),
            imageUrl: user.imageUrl ?? null,
          },
          joinedAt: member.joinedAt,
          prediction: {
            _id: prediction._id,
            updatedAt: prediction.updatedAt,
            totalScore: calculatePredictionScore(prediction.ranking, contestants),
            isCombined: false as const,
            rows: buildPredictionRows(prediction.ranking, contestants),
          },
        };
      }),
    );

    const hydratedMembers = members.filter((member) => member !== null);
    const leaderboard = [...hydratedMembers]
      .map((member) => ({
        userId: member.user._id,
        userName: member.user.name,
        imageUrl: member.user.imageUrl,
        totalScore: member.prediction?.totalScore ?? 0,
      }))
      .sort((left, right) => {
        return (
          right.totalScore - left.totalScore ||
          left.userName.localeCompare(right.userName)
        );
      })
      .map((entry, index) => ({
        ...entry,
        rank: index + 1,
      }));

    return {
      access: "full",
      contest: {
        _id: contest._id,
        name: contest.name,
        slug: contest.slug,
      },
      league: {
        _id: league._id,
        name: league.name,
        visibility: league.visibility,
        joinCode: league.joinCode ?? null,
        createdAt: league.createdAt,
        isCreator: viewer?._id === league.creatorUserId,
        hasJoined: Boolean(membership),
      },
      leaderboard,
      members: hydratedMembers,
    };
  },
});
