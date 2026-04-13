/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

// ── Helpers ───────────────────────────────────────────────────────────────────

async function insertContest(
  t: ReturnType<typeof convexTest>,
  overrides: { slug?: string; contestType?: "semi1" | "semi2" | "final" | "combined" } = {},
) {
  return t.run(async (ctx) => {
    return ctx.db.insert("contests", {
      slug: overrides.slug ?? "test-contest",
      season: 2026,
      name: "Test Contest",
      shortName: "TC",
      description: "D",
      heroBlurb: "H",
      status: "open",
      contestType: overrides.contestType,
      updatedAt: Date.now(),
    });
  });
}

async function insertContestants(
  t: ReturnType<typeof convexTest>,
  contestId: Awaited<ReturnType<typeof insertContest>>,
  count: number,
  extra: (i: number) => object = () => ({}),
) {
  return t.run(async (ctx) => {
    const ids = [];
    for (let i = 0; i < count; i++) {
      const id = await ctx.db.insert("contestants", {
        contestId,
        entryId: `entry_${i}`,
        sortOrder: i + 1,
        country: `Country ${i}`,
        countryCode: `C${i}`,
        artist: `Artist ${i}`,
        song: `Song ${i}`,
        imageUrl: `/img/${i}.jpg`,
        ...extra(i),
      });
      ids.push(id);
    }
    return ids;
  });
}

// ── saveViewerPrediction ──────────────────────────────────────────────────────

describe("predictions.saveViewerPrediction", () => {
  it("saves a new prediction for an authenticated user", async () => {
    const t = convexTest(schema, modules);
    const contestId = await insertContest(t);
    const contestantIds = await insertContestants(t, contestId, 3);

    const asSarah = t.withIdentity({ name: "Sarah", email: "sarah@test.com" });

    // Must upsert viewer first (mirrors ViewerBootstrap)
    await asSarah.mutation(api.users.upsertViewer, {});

    const predictionId = await asSarah.mutation(api.predictions.saveViewerPrediction, {
      contestId,
      ranking: contestantIds,
    });

    expect(predictionId).toBeDefined();

    const prediction = await t.run((ctx) => ctx.db.get("predictions", predictionId));
    expect(prediction?.ranking).toEqual(contestantIds);
  });

  it("updates an existing prediction on second save", async () => {
    const t = convexTest(schema, modules);
    const contestId = await insertContest(t);
    const [a, b, c] = await insertContestants(t, contestId, 3);

    const asUser = t.withIdentity({ name: "User" });
    await asUser.mutation(api.users.upsertViewer, {});

    const id1 = await asUser.mutation(api.predictions.saveViewerPrediction, {
      contestId,
      ranking: [a, b, c],
    });

    const id2 = await asUser.mutation(api.predictions.saveViewerPrediction, {
      contestId,
      ranking: [c, b, a],
    });

    // Same prediction doc updated, not a new one
    expect(id1).toEqual(id2);

    const prediction = await t.run((ctx) => ctx.db.get("predictions", id1));
    expect(prediction?.ranking).toEqual([c, b, a]);
  });

  it("throws when ranking length doesn't match contestant count", async () => {
    const t = convexTest(schema, modules);
    const contestId = await insertContest(t);
    const [a, b] = await insertContestants(t, contestId, 3); // 3 contestants, only 2 in ranking

    const asUser = t.withIdentity({ name: "User" });
    await asUser.mutation(api.users.upsertViewer, {});

    await expect(
      asUser.mutation(api.predictions.saveViewerPrediction, {
        contestId,
        ranking: [a, b],
      }),
    ).rejects.toThrowError("rank every contestant");
  });

  it("throws when ranking contains duplicates", async () => {
    const t = convexTest(schema, modules);
    const contestId = await insertContest(t);
    const [a] = await insertContestants(t, contestId, 2);

    const asUser = t.withIdentity({ name: "User" });
    await asUser.mutation(api.users.upsertViewer, {});

    await expect(
      asUser.mutation(api.predictions.saveViewerPrediction, {
        contestId,
        ranking: [a, a], // duplicate
      }),
    ).rejects.toThrowError("duplicate");
  });

  it("throws when an auto-qualifier is in the bottom 10 of a combined contest", async () => {
    const t = convexTest(schema, modules);
    const contestId = await insertContest(t, { contestType: "combined" });

    // 35 contestants: 30 semis + 5 autos (autos at end)
    const semiIds = await insertContestants(t, contestId, 30, (i) => ({
      entryId: `semi_${i}`,
      semiGroup: i < 15 ? "semi1" : "semi2",
    }));
    const autoIds = await insertContestants(t, contestId, 5, (i) => ({
      entryId: `auto_${i}`,
      semiGroup: "auto",
    }));

    const asUser = t.withIdentity({ name: "User" });
    await asUser.mutation(api.users.upsertViewer, {});

    // Put an auto-qualifier at position 26 (bottom 10)
    const rankingWithAutoInBottom = [
      ...semiIds.slice(0, 24),  // 24 semis in top 25
      autoIds[0],                // auto at position 25 ✓
      ...semiIds.slice(24),      // remaining semis
      ...autoIds.slice(1),       // rest of autos in bottom 10 ✗
    ];

    await expect(
      asUser.mutation(api.predictions.saveViewerPrediction, {
        contestId,
        ranking: rankingWithAutoInBottom,
      }),
    ).rejects.toThrowError("top 25");
  });

  it("accepts a combined ranking where all auto-qualifiers are in top 25", async () => {
    const t = convexTest(schema, modules);
    const contestId = await insertContest(t, { contestType: "combined" });

    const semiIds = await insertContestants(t, contestId, 30, (i) => ({
      entryId: `semi_${i}`,
      semiGroup: i < 15 ? "semi1" : "semi2",
    }));
    const autoIds = await insertContestants(t, contestId, 5, (i) => ({
      entryId: `auto_${i}`,
      semiGroup: "auto",
    }));

    const asUser = t.withIdentity({ name: "User" });
    await asUser.mutation(api.users.upsertViewer, {});

    // All 5 autos in positions 1–5, semis fill the rest
    const validRanking = [...autoIds, ...semiIds];

    await expect(
      asUser.mutation(api.predictions.saveViewerPrediction, {
        contestId,
        ranking: validRanking,
      }),
    ).resolves.toBeDefined();
  });

  it("throws when unauthenticated", async () => {
    const t = convexTest(schema, modules);
    const contestId = await insertContest(t);
    const ids = await insertContestants(t, contestId, 2);

    await expect(
      t.mutation(api.predictions.saveViewerPrediction, {
        contestId,
        ranking: ids,
      }),
    ).rejects.toThrow();
  });
});

// ── getViewerPrediction ───────────────────────────────────────────────────────

describe("predictions.getViewerPrediction", () => {
  it("returns null prediction when user has not saved one", async () => {
    const t = convexTest(schema, modules);
    const contestId = await insertContest(t);
    await insertContestants(t, contestId, 3);

    const asUser = t.withIdentity({ name: "User" });
    await asUser.mutation(api.users.upsertViewer, {});

    const result = await asUser.query(api.predictions.getViewerPrediction, { contestId });
    expect(result?.contest._id).toBe(contestId);
    expect(result?.prediction).toBeNull();
  });

  it("returns score as null when no placements set", async () => {
    const t = convexTest(schema, modules);
    const contestId = await insertContest(t);
    const contestantIds = await insertContestants(t, contestId, 3);

    const asUser = t.withIdentity({ name: "User" });
    await asUser.mutation(api.users.upsertViewer, {});
    await asUser.mutation(api.predictions.saveViewerPrediction, {
      contestId,
      ranking: contestantIds,
    });

    const result = await asUser.query(api.predictions.getViewerPrediction, { contestId });
    expect(result?.prediction?.totalScore).toBeNull();
  });

  it("returns calculated score when placements are set", async () => {
    const t = convexTest(schema, modules);
    const contestId = await insertContest(t);

    // Insert contestants with placements
    const contestantIds = await t.run(async (ctx) => {
      const ids = [];
      for (let i = 0; i < 3; i++) {
        ids.push(
          await ctx.db.insert("contestants", {
            contestId,
            entryId: `e${i}`,
            sortOrder: i + 1,
            country: `C${i}`,
            countryCode: `C${i}`,
            artist: `A${i}`,
            song: `S${i}`,
            imageUrl: `/img/${i}.jpg`,
            placement: i + 1, // placement matches index
          }),
        );
      }
      return ids;
    });

    const asUser = t.withIdentity({ name: "User" });
    await asUser.mutation(api.users.upsertViewer, {});
    await asUser.mutation(api.predictions.saveViewerPrediction, {
      contestId,
      ranking: contestantIds, // predicted 1,2,3 — actual 1,2,3 → all exact
    });

    const result = await asUser.query(api.predictions.getViewerPrediction, { contestId });
    expect(result?.prediction?.totalScore).toBe(36); // 3 × 12
  });
});

// ── getViewerAllActivePredictions ─────────────────────────────────────────────

describe("predictions.getViewerAllActivePredictions", () => {
  it("returns an empty array when no active contests are configured", async () => {
    const t = convexTest(schema, modules);
    const result = await t.query(api.predictions.getViewerAllActivePredictions, {});
    expect(result).toEqual([]);
  });

  it("returns one entry per active contest", async () => {
    const t = convexTest(schema, modules);

    const [c1, c2] = await t.run(async (ctx) => {
      const now = Date.now();
      const id1 = await ctx.db.insert("contests", {
        slug: "sf1", season: 2026, name: "SF1", shortName: "SF1",
        description: "D", heroBlurb: "H", status: "open", contestType: "semi1", updatedAt: now,
      });
      const id2 = await ctx.db.insert("contests", {
        slug: "sf2", season: 2026, name: "SF2", shortName: "SF2",
        description: "D", heroBlurb: "H", status: "open", contestType: "semi2", updatedAt: now,
      });
      await ctx.db.insert("appSettings", {
        key: "global",
        activeContestIds: [id1, id2],
        updatedAt: now,
      });
      return [id1, id2];
    });

    await insertContestants(t, c1, 2);
    await insertContestants(t, c2, 2);

    const result = await t.query(api.predictions.getViewerAllActivePredictions, {});
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.contest._id)).toContain(c1);
    expect(result.map((r) => r.contest._id)).toContain(c2);
  });

  it("returns null prediction for contests where user has not saved", async () => {
    const t = convexTest(schema, modules);

    const contestId = await t.run(async (ctx) => {
      const now = Date.now();
      const id = await ctx.db.insert("contests", {
        slug: "sf1", season: 2026, name: "SF1", shortName: "SF1",
        description: "D", heroBlurb: "H", status: "open", updatedAt: now,
      });
      await ctx.db.insert("appSettings", { key: "global", activeContestIds: [id], updatedAt: now });
      return id;
    });
    await insertContestants(t, contestId, 3);

    const asUser = t.withIdentity({ name: "User" });
    await asUser.mutation(api.users.upsertViewer, {});

    const result = await asUser.query(api.predictions.getViewerAllActivePredictions, {});
    expect(result[0].prediction).toBeNull();
  });

  it("returns prediction with isCombined=false for standard contests", async () => {
    const t = convexTest(schema, modules);

    const contestId = await t.run(async (ctx) => {
      const now = Date.now();
      const id = await ctx.db.insert("contests", {
        slug: "sf1", season: 2026, name: "SF1", shortName: "SF1",
        description: "D", heroBlurb: "H", status: "open", contestType: "semi1", updatedAt: now,
      });
      await ctx.db.insert("appSettings", { key: "global", activeContestIds: [id], updatedAt: now });
      return id;
    });

    const contestantIds = await insertContestants(t, contestId, 2);

    const asUser = t.withIdentity({ name: "User" });
    await asUser.mutation(api.users.upsertViewer, {});
    await asUser.mutation(api.predictions.saveViewerPrediction, {
      contestId,
      ranking: contestantIds,
    });

    const result = await asUser.query(api.predictions.getViewerAllActivePredictions, {});
    expect(result[0].prediction?.isCombined).toBe(false);
  });
});

// ── getSharedPrediction ───────────────────────────────────────────────────────

describe("predictions.getSharedPrediction", () => {
  it("returns null for a non-existent prediction ID", async () => {
    const t = convexTest(schema, modules);
    const contestId = await insertContest(t);
    const contestantIds = await insertContestants(t, contestId, 2);

    const asUser = t.withIdentity({ name: "User" });
    await asUser.mutation(api.users.upsertViewer, {});
    const predictionId = await asUser.mutation(api.predictions.saveViewerPrediction, {
      contestId,
      ranking: contestantIds,
    });

    // Delete the prediction so the ID no longer exists in the table
    await t.run(async (ctx) => ctx.db.delete("predictions", predictionId));

    const result = await t.query(api.predictions.getSharedPrediction, { predictionId });
    expect(result).toBeNull();
  });

  it("returns prediction data with rows for a standard contest", async () => {
    const t = convexTest(schema, modules);
    const contestId = await insertContest(t);
    const contestantIds = await insertContestants(t, contestId, 3);

    const asUser = t.withIdentity({ name: "Shared User" });
    await asUser.mutation(api.users.upsertViewer, {});
    const predictionId = await asUser.mutation(api.predictions.saveViewerPrediction, {
      contestId,
      ranking: contestantIds,
    });

    const result = await t.query(api.predictions.getSharedPrediction, { predictionId });
    expect(result).not.toBeNull();
    expect(result?.user.name).toBe("Shared User");
    expect("rows" in result!.prediction).toBe(true);
  });
});
