import { ConvexError } from "convex/values";
import type { UserIdentity } from "convex/server";

import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type AuthCtx = QueryCtx | MutationCtx;

export function effectiveName(user: Doc<"users">): string {
  if (user.displayName && user.useDisplayName !== false) {
    return user.displayName;
  }
  return user.name;
}

export function getIdentityName(identity: UserIdentity): string {
  return (
    identity.name ??
    identity.preferredUsername ??
    identity.nickname ??
    identity.givenName ??
    identity.email?.split("@")[0] ??
    "Fantasy fan"
  );
}

export async function getViewerByIdentity(
  ctx: AuthCtx,
  identity: UserIdentity | null,
): Promise<Doc<"users"> | null> {
  if (!identity) {
    return null;
  }

  return await ctx.db
    .query("users")
    .withIndex("by_tokenIdentifier", (query) =>
      query.eq("tokenIdentifier", identity.tokenIdentifier),
    )
    .unique();
}

export async function requireIdentity(ctx: AuthCtx): Promise<UserIdentity> {
  const identity = await ctx.auth.getUserIdentity();

  if (!identity) {
    throw new ConvexError("Please sign in to continue.");
  }

  return identity;
}

export async function upsertViewerFromIdentity(
  ctx: MutationCtx,
  identity: UserIdentity,
): Promise<Doc<"users">> {
  const existing = await getViewerByIdentity(ctx, identity);
  const patch = {
    clerkUserId: identity.subject,
    tokenIdentifier: identity.tokenIdentifier,
    name: getIdentityName(identity),
    email: identity.email,
    imageUrl: identity.pictureUrl,
    updatedAt: Date.now(),
  };

  if (existing) {
    await ctx.db.patch("users", existing._id, patch);
    const viewer = await ctx.db.get("users", existing._id);

    if (!viewer) {
      throw new ConvexError("Your profile could not be loaded. Please try again.");
    }

    return viewer;
  }

  const viewerId = await ctx.db.insert("users", patch);
  const viewer = await ctx.db.get("users", viewerId);

  if (!viewer) {
    throw new ConvexError("Your profile could not be created. Please try again.");
  }

  return viewer;
}

export async function requireViewer(ctx: QueryCtx | MutationCtx): Promise<Doc<"users">> {
  const identity = await requireIdentity(ctx);
  const viewer = await getViewerByIdentity(ctx, identity);

  if (!viewer) {
    throw new ConvexError(
      "Your profile has not synced yet. Sign in again or refresh the page.",
    );
  }

  return viewer;
}

export async function requireViewerForMutation(ctx: MutationCtx): Promise<Doc<"users">> {
  const identity = await requireIdentity(ctx);
  return await upsertViewerFromIdentity(ctx, identity);
}
