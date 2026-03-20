# FantasyVision

FantasyVision has been rebuilt from the old Firebase Studio era project into a React + Convex + Clerk app.

The old `fantasyeurovision/` directory is now reference material only. The live app code is in [`src/`](./src) and [`convex/`](./convex).

## What’s Ported

- Active contest homepage
- Prediction composer with one saved pick per user per contest
- Eurovision-style scoring against published placements
- League creation, joins, leave flow, and leaderboard views
- Shareable prediction routes
- Legacy seed data for 2023, 2024, and 2025

## Stack

- React 19 + Vite
- Convex for schema, queries, mutations, and cloud data
- Clerk for auth
- Tailwind 4 available, with custom CSS-driven UI styling

## Local Dev

```bash
pnpm install
pnpm exec convex dev
pnpm dev
```

## Seed Data

The port uses the old project’s results JSON files plus contestant artwork copied into:

- `convex/data/results_2023.json`
- `convex/data/results_2024.json`
- `convex/data/results_2025.json`
- `public/images/contestants/*`

To reseed:

```bash
pnpm exec convex run seed:seedLegacyData
```

That seeds three contests and sets `eurovision-2025` as the active contest.

## Clerk / Convex Auth

Convex needs the Clerk issuer URL in its deployment env:

```bash
pnpm exec convex env set CLERK_JWT_ISSUER_DOMAIN https://amusing-beetle-17.clerk.accounts.dev
```

The frontend publishable key stays in `.env.local` as `VITE_CLERK_PUBLISHABLE_KEY`.

For Vercel later, mirror the same frontend env vars there and keep the Convex deployment env configured with the Clerk issuer domain.

## Verification

The current port passes:

- `pnpm lint`
- `pnpm build`
