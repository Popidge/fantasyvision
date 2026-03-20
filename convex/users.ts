import { mutation, query } from "./_generated/server";
import { getIdentityName, getViewerByIdentity, requireIdentity } from "./lib/viewer";

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
    const existing = await getViewerByIdentity(ctx, identity);
    const now = Date.now();

    const patch = {
      clerkUserId: identity.subject,
      tokenIdentifier: identity.tokenIdentifier,
      name: getIdentityName(identity),
      email: identity.email,
      imageUrl: identity.pictureUrl,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch("users", existing._id, patch);
      return existing._id;
    }

    return await ctx.db.insert("users", patch);
  },
});
