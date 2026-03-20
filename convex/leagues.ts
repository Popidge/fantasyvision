import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import {
  buildPredictionRows,
  calculatePredictionScore,
} from "./lib/scoring";
import { getViewerByIdentity, requireViewer } from "./lib/viewer";

function createJoinCode(leagueId: string) {
  return leagueId.replace(/[^a-zA-Z0-9]/g, "").slice(-8).toUpperCase();
}

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
  const viewer = await requireViewer(ctx);
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
  args: {},
  handler: async (ctx) => {
    const contest = await getActiveContest(ctx);

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

    return {
      contest: {
        _id: contest._id,
        name: contest.name,
        shortName: contest.shortName,
        slug: contest.slug,
      },
      viewer: viewer
        ? {
            _id: viewer._id,
            name: viewer.name,
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
    const viewer = await requireViewer(ctx);
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
    const viewer = await requireViewer(ctx);
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

        return {
          user: {
            _id: user._id,
            name: user.name,
            imageUrl: user.imageUrl ?? null,
          },
          joinedAt: member.joinedAt,
          prediction: prediction
            ? {
                _id: prediction._id,
                updatedAt: prediction.updatedAt,
                totalScore: calculatePredictionScore(prediction.ranking, contestants),
                rows: buildPredictionRows(prediction.ranking, contestants),
              }
            : null,
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
