import { ConvexError, v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { requireAdmin } from "./lib/viewer";

// ─── Queries ─────────────────────────────────────────────────────────────────

export const getAdminOverview = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const [contests, users, settings] = await Promise.all([
      ctx.db.query("contests").collect(),
      ctx.db.query("users").collect(),
      ctx.db
        .query("appSettings")
        .withIndex("by_key", (q) => q.eq("key", "global"))
        .unique(),
    ]);

    const activeContestIds: string[] =
      settings?.activeContestIds ??
      (settings?.activeContestId ? [settings.activeContestId] : []);

    return {
      contests: contests.sort((a, b) => b.season - a.season || a.name.localeCompare(b.name)),
      users: users
        .map((u) => ({
          _id: u._id,
          name: u.name,
          displayName: u.displayName ?? null,
          email: u.email ?? null,
          isAdmin: u.isAdmin ?? false,
          clerkUserId: u.clerkUserId,
        }))
        .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "")),
      activeContestIds,
    };
  },
});

// ─── Contest management ───────────────────────────────────────────────────────

export const setActiveContests = mutation({
  args: {
    contestIds: v.array(v.id("contests")),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const now = Date.now();
    const settings = await ctx.db
      .query("appSettings")
      .withIndex("by_key", (q) => q.eq("key", "global"))
      .unique();

    const patch = {
      activeContestIds: args.contestIds,
      activeContestId: args.contestIds[0],
      updatedAt: now,
    };

    if (settings) {
      await ctx.db.patch("appSettings", settings._id, patch);
    } else {
      await ctx.db.insert("appSettings", { key: "global", ...patch });
    }

    return args.contestIds;
  },
});

export const setContestStatus = mutation({
  args: {
    contestId: v.id("contests"),
    status: v.union(
      v.literal("draft"),
      v.literal("open"),
      v.literal("results"),
      v.literal("archived"),
    ),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const contest = await ctx.db.get("contests", args.contestId);
    if (!contest) throw new ConvexError("Contest not found.");
    await ctx.db.patch("contests", args.contestId, {
      status: args.status,
      updatedAt: Date.now(),
    });
  },
});

// ─── Results publishing ───────────────────────────────────────────────────────

export const publishSemiResults = mutation({
  args: {
    contestId: v.id("contests"),
    results: v.array(
      v.object({
        entryId: v.string(),
        placement: v.number(),
        qualified: v.boolean(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const contest = await ctx.db.get("contests", args.contestId);
    if (!contest) throw new ConvexError("Contest not found.");
    if (contest.contestType !== "semi1" && contest.contestType !== "semi2") {
      throw new ConvexError("This mutation is only for semi-final contests.");
    }

    const contestants = await ctx.db
      .query("contestants")
      .withIndex("by_contestId", (q) => q.eq("contestId", args.contestId))
      .collect();

    const contestantByEntryId = new Map(contestants.map((c) => [c.entryId, c]));

    for (const result of args.results) {
      const contestant = contestantByEntryId.get(result.entryId);
      if (!contestant) continue;
      await ctx.db.patch("contestants", contestant._id, {
        placement: result.placement,
        qualified: result.qualified,
      });
    }

    await ctx.db.patch("contests", args.contestId, {
      status: "results",
      updatedAt: Date.now(),
    });

    return { updated: args.results.length };
  },
});

export const finalizeGFLineup = mutation({
  args: {
    sf1ContestId: v.id("contests"),
    sf2ContestId: v.id("contests"),
    gfContestId: v.id("contests"),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const gfContest = await ctx.db.get("contests", args.gfContestId);
    if (!gfContest) throw new ConvexError("GF contest not found.");
    if (gfContest.contestType !== "final") {
      throw new ConvexError("Target contest is not a grand final.");
    }

    const sf1Qualified = (
      await ctx.db
        .query("contestants")
        .withIndex("by_contestId", (q) => q.eq("contestId", args.sf1ContestId))
        .collect()
    ).filter((c) => c.qualified === true);

    const sf2Qualified = (
      await ctx.db
        .query("contestants")
        .withIndex("by_contestId", (q) => q.eq("contestId", args.sf2ContestId))
        .collect()
    ).filter((c) => c.qualified === true);

    const allQualified = [...sf1Qualified, ...sf2Qualified];

    const existingGFContestants = await ctx.db
      .query("contestants")
      .withIndex("by_contestId", (q) => q.eq("contestId", args.gfContestId))
      .collect();
    const existingEntryIds = new Set(existingGFContestants.map((c) => c.entryId));

    const maxExistingSortOrder = existingGFContestants.reduce(
      (max, c) => Math.max(max, c.sortOrder),
      0,
    );

    const sorted = [...allQualified].sort((a, b) => a.country.localeCompare(b.country));
    let sortOrder = maxExistingSortOrder + 1;

    for (const contestant of sorted) {
      if (existingEntryIds.has(contestant.entryId)) continue;
      await ctx.db.insert("contestants", {
        contestId: args.gfContestId,
        entryId: contestant.entryId,
        sortOrder: sortOrder++,
        country: contestant.country,
        countryCode: contestant.countryCode,
        artist: contestant.artist,
        song: contestant.song,
        imageUrl: contestant.imageUrl,
        youtubeUrl: contestant.youtubeUrl,
        semiGroup: contestant.semiGroup,
      });
    }

    await ctx.db.patch("contests", args.gfContestId, {
      status: "open",
      updatedAt: Date.now(),
    });

    return {
      added: sorted.filter((c) => !existingEntryIds.has(c.entryId)).length,
    };
  },
});

export const publishGFResults = mutation({
  args: {
    contestId: v.id("contests"),
    results: v.array(
      v.object({
        entryId: v.string(),
        placement: v.number(),
        points: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const contest = await ctx.db.get("contests", args.contestId);
    if (!contest) throw new ConvexError("Contest not found.");
    if (contest.contestType !== "final") {
      throw new ConvexError("This mutation is only for the grand final contest.");
    }

    const contestants = await ctx.db
      .query("contestants")
      .withIndex("by_contestId", (q) => q.eq("contestId", args.contestId))
      .collect();

    const contestantByEntryId = new Map(contestants.map((c) => [c.entryId, c]));

    for (const result of args.results) {
      const contestant = contestantByEntryId.get(result.entryId);
      if (!contestant) continue;
      await ctx.db.patch("contestants", contestant._id, {
        placement: result.placement,
        points: result.points,
      });
    }

    await ctx.db.patch("contests", args.contestId, {
      status: "results",
      updatedAt: Date.now(),
    });

    return { updated: args.results.length };
  },
});

// ─── User management ──────────────────────────────────────────────────────────

export const setUserAdmin = mutation({
  args: {
    userId: v.id("users"),
    isAdmin: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const user = await ctx.db.get("users", args.userId);
    if (!user) throw new ConvexError("User not found.");
    await ctx.db.patch("users", args.userId, {
      isAdmin: args.isAdmin,
      updatedAt: Date.now(),
    });
  },
});
