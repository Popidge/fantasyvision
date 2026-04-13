import { ConvexError } from "convex/values";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getViewerByIdentity, requireIdentity, requireViewer, upsertViewerFromIdentity } from "./lib/viewer";

export const getViewer = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    const viewer = await getViewerByIdentity(ctx, identity);

    if (!identity || !viewer) {
      return null;
    }

    return viewer;
  },
});

export const upsertViewer = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx);
    const viewer = await upsertViewerFromIdentity(ctx, identity);
    return viewer._id;
  },
});

export const updateDisplayName = mutation({
  args: { displayName: v.string() },
  handler: async (ctx, { displayName }) => {
    const trimmed = displayName.trim();
    if (trimmed.length === 0) {
      throw new ConvexError("Display name cannot be empty.");
    }
    if (trimmed.length > 50) {
      throw new ConvexError("Display name must be 50 characters or fewer.");
    }
    const viewer = await requireViewer(ctx);
    await ctx.db.patch("users", viewer._id, { displayName: trimmed, updatedAt: Date.now() });
  },
});

export const updatePublicNamePreference = mutation({
  args: { useDisplayName: v.boolean() },
  handler: async (ctx, { useDisplayName }) => {
    const viewer = await requireViewer(ctx);
    if (!viewer.displayName) {
      throw new ConvexError("Set a display name before changing this preference.");
    }
    await ctx.db.patch("users", viewer._id, { useDisplayName, updatedAt: Date.now() });
  },
});
