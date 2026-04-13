/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

// ── Helpers ───────────────────────────────────────────────────────────────────

async function seedSemiContest(
  t: ReturnType<typeof convexTest>,
  type: "semi1" | "semi2",
  entryIds: string[],
) {
  return t.run(async (ctx) => {
    const contestId = await ctx.db.insert("contests", {
      slug: `${type}-test`,
      season: 2026,
      name: `Test ${type}`,
      shortName: `${type}`,
      description: "Test",
      heroBlurb: "Test",
      status: "open",
      contestType: type,
      updatedAt: Date.now(),
    });

    for (const [i, entryId] of entryIds.entries()) {
      await ctx.db.insert("contestants", {
        contestId,
        entryId,
        sortOrder: i + 1,
        country: `Country ${entryId}`,
        countryCode: entryId.slice(0, 2).toUpperCase(),
        artist: `Artist ${entryId}`,
        song: `Song ${entryId}`,
        imageUrl: `/img/${entryId}.jpg`,
      });
    }

    return contestId;
  });
}

async function seedGFContest(
  t: ReturnType<typeof convexTest>,
  autoEntryIds: string[],
) {
  return t.run(async (ctx) => {
    const contestId = await ctx.db.insert("contests", {
      slug: "gf-test",
      season: 2026,
      name: "Test GF",
      shortName: "GF",
      description: "Test",
      heroBlurb: "Test",
      status: "draft",
      contestType: "final",
      updatedAt: Date.now(),
    });

    for (const [i, entryId] of autoEntryIds.entries()) {
      await ctx.db.insert("contestants", {
        contestId,
        entryId,
        sortOrder: i + 1,
        country: `Country ${entryId}`,
        countryCode: entryId.slice(0, 2).toUpperCase(),
        artist: `Artist ${entryId}`,
        song: `Song ${entryId}`,
        imageUrl: `/img/${entryId}.jpg`,
        semiGroup: "auto" as const,
      });
    }

    return contestId;
  });
}

// ── setActiveContests ─────────────────────────────────────────────────────────

describe("admin.setActiveContests", () => {
  it("creates appSettings row with activeContestIds when none exists", async () => {
    const t = convexTest(schema, modules);

    const contestId = await t.run(async (ctx) => {
      return await ctx.db.insert("contests", {
        slug: "test",
        season: 2026,
        name: "Test",
        shortName: "T",
        description: "D",
        heroBlurb: "H",
        status: "open",
        updatedAt: Date.now(),
      });
    });

    await t.mutation(api.admin.setActiveContests, { contestIds: [contestId] });

    const settings = await t.run(async (ctx) =>
      ctx.db.query("appSettings").withIndex("by_key", (q) => q.eq("key", "global")).unique(),
    );

    expect(settings?.activeContestIds).toEqual([contestId]);
    expect(settings?.activeContestId).toEqual(contestId);
  });

  it("updates existing appSettings row", async () => {
    const t = convexTest(schema, modules);

    const [c1, c2] = await t.run(async (ctx) => {
      const now = Date.now();
      const id1 = await ctx.db.insert("contests", {
        slug: "c1", season: 2026, name: "C1", shortName: "C1",
        description: "D", heroBlurb: "H", status: "open", updatedAt: now,
      });
      const id2 = await ctx.db.insert("contests", {
        slug: "c2", season: 2026, name: "C2", shortName: "C2",
        description: "D", heroBlurb: "H", status: "open", updatedAt: now,
      });
      await ctx.db.insert("appSettings", {
        key: "global",
        activeContestId: id1,
        updatedAt: now,
      });
      return [id1, id2];
    });

    await t.mutation(api.admin.setActiveContests, { contestIds: [c1, c2] });

    const settings = await t.run(async (ctx) =>
      ctx.db.query("appSettings").withIndex("by_key", (q) => q.eq("key", "global")).unique(),
    );

    expect(settings?.activeContestIds).toEqual([c1, c2]);
  });
});

// ── publishSemiResults ────────────────────────────────────────────────────────

describe("admin.publishSemiResults", () => {
  it("sets placement and qualified on each contestant", async () => {
    const t = convexTest(schema, modules);

    const entryIds = ["AA", "BB", "CC"];
    const contestId = await seedSemiContest(t, "semi1", entryIds);

    await t.mutation(api.admin.publishSemiResults, {
      contestId,
      results: [
        { entryId: "AA", placement: 1, qualified: true },
        { entryId: "BB", placement: 2, qualified: true },
        { entryId: "CC", placement: 3, qualified: false },
      ],
    });

    const contestants = await t.run(async (ctx) =>
      ctx.db
        .query("contestants")
        .withIndex("by_contestId", (q) => q.eq("contestId", contestId))
        .collect(),
    );

    const aa = contestants.find((c) => c.entryId === "AA")!;
    const cc = contestants.find((c) => c.entryId === "CC")!;

    expect(aa.placement).toBe(1);
    expect(aa.qualified).toBe(true);
    expect(cc.placement).toBe(3);
    expect(cc.qualified).toBe(false);
  });

  it("sets contest status to results", async () => {
    const t = convexTest(schema, modules);
    const contestId = await seedSemiContest(t, "semi1", ["AA"]);

    await t.mutation(api.admin.publishSemiResults, {
      contestId,
      results: [{ entryId: "AA", placement: 1, qualified: true }],
    });

    const contest = await t.run((ctx) => ctx.db.get("contests", contestId));
    expect(contest?.status).toBe("results");
  });

  it("throws when called on a non-semi contest", async () => {
    const t = convexTest(schema, modules);

    const contestId = await t.run(async (ctx) => {
      return ctx.db.insert("contests", {
        slug: "gf",
        season: 2026,
        name: "GF",
        shortName: "GF",
        description: "D",
        heroBlurb: "H",
        status: "open",
        contestType: "final",
        updatedAt: Date.now(),
      });
    });

    await expect(
      t.mutation(api.admin.publishSemiResults, {
        contestId,
        results: [{ entryId: "AA", placement: 1, qualified: true }],
      }),
    ).rejects.toThrowError("semi-final");
  });

  it("silently ignores entryIds not found in the contest", async () => {
    const t = convexTest(schema, modules);
    const contestId = await seedSemiContest(t, "semi2", ["AA"]);

    // "ZZZZ" doesn't exist in the contest — should not throw
    await expect(
      t.mutation(api.admin.publishSemiResults, {
        contestId,
        results: [
          { entryId: "AA", placement: 1, qualified: true },
          { entryId: "ZZZZ", placement: 2, qualified: false },
        ],
      }),
    ).resolves.not.toThrow();
  });
});

// ── finalizeGFLineup ──────────────────────────────────────────────────────────

describe("admin.finalizeGFLineup", () => {
  it("inserts qualified semi-finalists into the GF contest", async () => {
    const t = convexTest(schema, modules);

    const sf1Id = await seedSemiContest(t, "semi1", ["AA", "BB", "CC"]);
    const sf2Id = await seedSemiContest(t, "semi2", ["DD", "EE"]);
    const gfId = await seedGFContest(t, ["AUTO1"]);

    // Mark AA and BB as qualified from SF1, DD as qualified from SF2
    await t.mutation(api.admin.publishSemiResults, {
      contestId: sf1Id,
      results: [
        { entryId: "AA", placement: 1, qualified: true },
        { entryId: "BB", placement: 2, qualified: true },
        { entryId: "CC", placement: 3, qualified: false },
      ],
    });
    await t.mutation(api.admin.publishSemiResults, {
      contestId: sf2Id,
      results: [
        { entryId: "DD", placement: 1, qualified: true },
        { entryId: "EE", placement: 2, qualified: false },
      ],
    });

    await t.mutation(api.admin.finalizeGFLineup, {
      sf1ContestId: sf1Id,
      sf2ContestId: sf2Id,
      gfContestId: gfId,
    });

    const gfContestants = await t.run(async (ctx) =>
      ctx.db
        .query("contestants")
        .withIndex("by_contestId", (q) => q.eq("contestId", gfId))
        .collect(),
    );

    const gfEntryIds = gfContestants.map((c) => c.entryId);
    // AUTO1 was pre-seeded, AA+BB from SF1, DD from SF2
    expect(gfEntryIds).toContain("AUTO1");
    expect(gfEntryIds).toContain("AA");
    expect(gfEntryIds).toContain("BB");
    expect(gfEntryIds).toContain("DD");
    // CC and EE didn't qualify
    expect(gfEntryIds).not.toContain("CC");
    expect(gfEntryIds).not.toContain("EE");
    expect(gfContestants).toHaveLength(4); // AUTO1 + AA + BB + DD
  });

  it("opens the GF contest after finalizing", async () => {
    const t = convexTest(schema, modules);
    const sf1Id = await seedSemiContest(t, "semi1", ["AA"]);
    const sf2Id = await seedSemiContest(t, "semi2", ["DD"]);
    const gfId = await seedGFContest(t, []);

    await t.mutation(api.admin.publishSemiResults, {
      contestId: sf1Id,
      results: [{ entryId: "AA", placement: 1, qualified: true }],
    });
    await t.mutation(api.admin.publishSemiResults, {
      contestId: sf2Id,
      results: [{ entryId: "DD", placement: 1, qualified: true }],
    });

    await t.mutation(api.admin.finalizeGFLineup, {
      sf1ContestId: sf1Id,
      sf2ContestId: sf2Id,
      gfContestId: gfId,
    });

    const gfContest = await t.run((ctx) => ctx.db.get("contests", gfId));
    expect(gfContest?.status).toBe("open");
  });

  it("is idempotent — running twice does not duplicate contestants", async () => {
    const t = convexTest(schema, modules);
    const sf1Id = await seedSemiContest(t, "semi1", ["AA"]);
    const sf2Id = await seedSemiContest(t, "semi2", []);
    const gfId = await seedGFContest(t, []);

    await t.mutation(api.admin.publishSemiResults, {
      contestId: sf1Id,
      results: [{ entryId: "AA", placement: 1, qualified: true }],
    });

    const args = { sf1ContestId: sf1Id, sf2ContestId: sf2Id, gfContestId: gfId };
    await t.mutation(api.admin.finalizeGFLineup, args);
    await t.mutation(api.admin.finalizeGFLineup, args);

    const gfContestants = await t.run(async (ctx) =>
      ctx.db
        .query("contestants")
        .withIndex("by_contestId", (q) => q.eq("contestId", gfId))
        .collect(),
    );

    const entryIds = gfContestants.map((c) => c.entryId);
    // AA should only appear once
    expect(entryIds.filter((id) => id === "AA")).toHaveLength(1);
  });
});

// ── publishGFResults ──────────────────────────────────────────────────────────

describe("admin.publishGFResults", () => {
  it("sets placement and points on GF contestants", async () => {
    const t = convexTest(schema, modules);
    const gfId = await seedGFContest(t, ["FR", "DE"]);

    await t.mutation(api.admin.publishGFResults, {
      contestId: gfId,
      results: [
        { entryId: "FR", placement: 1, points: 365 },
        { entryId: "DE", placement: 2, points: 280 },
      ],
    });

    const contestants = await t.run(async (ctx) =>
      ctx.db
        .query("contestants")
        .withIndex("by_contestId", (q) => q.eq("contestId", gfId))
        .collect(),
    );

    const fr = contestants.find((c) => c.entryId === "FR")!;
    expect(fr.placement).toBe(1);
    expect(fr.points).toBe(365);
  });

  it("sets contest status to results", async () => {
    const t = convexTest(schema, modules);
    const gfId = await seedGFContest(t, ["FR"]);

    await t.mutation(api.admin.publishGFResults, {
      contestId: gfId,
      results: [{ entryId: "FR", placement: 1, points: 365 }],
    });

    const contest = await t.run((ctx) => ctx.db.get("contests", gfId));
    expect(contest?.status).toBe("results");
  });

  it("throws when called on a non-final contest", async () => {
    const t = convexTest(schema, modules);
    const sf1Id = await seedSemiContest(t, "semi1", ["AA"]);

    await expect(
      t.mutation(api.admin.publishGFResults, {
        contestId: sf1Id,
        results: [{ entryId: "AA", placement: 1, points: 100 }],
      }),
    ).rejects.toThrowError("grand final");
  });
});
