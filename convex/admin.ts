import { ConvexError, v } from "convex/values";

import { mutation } from "./_generated/server";

export const setActiveContests = mutation({
  args: {
    contestIds: v.array(v.id("contests")),
  },
  handler: async (ctx, args) => {
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
    const gfContest = await ctx.db.get("contests", args.gfContestId);
    if (!gfContest) throw new ConvexError("GF contest not found.");
    if (gfContest.contestType !== "final") {
      throw new ConvexError("Target contest is not a grand final.");
    }

    // Collect qualifiers from both semis
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

    // Get existing GF contestant entryIds (auto-qualifiers already seeded)
    const existingGFContestants = await ctx.db
      .query("contestants")
      .withIndex("by_contestId", (q) => q.eq("contestId", args.gfContestId))
      .collect();
    const existingEntryIds = new Set(existingGFContestants.map((c) => c.entryId));

    // Determine next sortOrder (auto-qualifiers already have their sortOrders set)
    const maxExistingSortOrder = existingGFContestants.reduce(
      (max, c) => Math.max(max, c.sortOrder),
      0,
    );

    // Insert qualified semi-finalists in alphabetical order
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

    return { added: sorted.length - (sorted.filter((c) => existingEntryIds.has(c.entryId)).length) };
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
