import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  appSettings: defineTable({
    key: v.string(),
    activeContestId: v.optional(v.id("contests")),
    activeContestIds: v.optional(v.array(v.id("contests"))),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),

  users: defineTable({
    tokenIdentifier: v.string(),
    clerkUserId: v.string(),
    name: v.string(),
    displayName: v.optional(v.string()),
    useDisplayName: v.optional(v.boolean()),
    email: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_tokenIdentifier", ["tokenIdentifier"]),

  contests: defineTable({
    slug: v.string(),
    season: v.number(),
    name: v.string(),
    shortName: v.string(),
    description: v.string(),
    heroBlurb: v.string(),
    status: v.union(
      v.literal("draft"),
      v.literal("open"),
      v.literal("results"),
      v.literal("archived"),
    ),
    predictionCutoff: v.optional(v.number()),
    contestType: v.optional(v.union(
      v.literal("semi1"),
      v.literal("semi2"),
      v.literal("final"),
      v.literal("combined"),
    )),
    updatedAt: v.number(),
  }).index("by_slug", ["slug"]),

  contestants: defineTable({
    contestId: v.id("contests"),
    entryId: v.string(),
    sortOrder: v.number(),
    country: v.string(),
    countryCode: v.string(),
    artist: v.string(),
    song: v.string(),
    imageUrl: v.string(),
    youtubeUrl: v.optional(v.string()),
    placement: v.optional(v.number()),
    points: v.optional(v.number()),
    semiGroup: v.optional(v.union(
      v.literal("semi1"),
      v.literal("semi2"),
      v.literal("auto"),
    )),
    qualified: v.optional(v.boolean()),
  })
    .index("by_contestId", ["contestId"])
    .index("by_contestId_and_sortOrder", ["contestId", "sortOrder"])
    .index("by_contestId_and_entryId", ["contestId", "entryId"]),

  predictions: defineTable({
    contestId: v.id("contests"),
    userId: v.id("users"),
    ranking: v.array(v.id("contestants")),
    updatedAt: v.number(),
  })
    .index("by_userId_and_contestId", ["userId", "contestId"])
    .index("by_contestId", ["contestId"]),

  leagues: defineTable({
    contestId: v.id("contests"),
    creatorUserId: v.id("users"),
    name: v.string(),
    visibility: v.union(v.literal("public"), v.literal("private")),
    joinCode: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_contestId", ["contestId"])
    .index("by_joinCode", ["joinCode"])
    .index("by_creatorUserId", ["creatorUserId"]),

  leagueMembers: defineTable({
    leagueId: v.id("leagues"),
    userId: v.id("users"),
    joinedAt: v.number(),
  })
    .index("by_leagueId", ["leagueId"])
    .index("by_userId", ["userId"])
    .index("by_userId_and_leagueId", ["userId", "leagueId"]),
});
