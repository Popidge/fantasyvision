# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Package manager

Use **pnpm** in preference to npm for all install and script commands.

## Commands

```bash
# Start both frontend (Vite) and backend (Convex) in parallel
pnpm run dev

# First-time setup: sync Convex schema and open dashboard before dev
npm run predev  # runs automatically before dev

# Build for production
npm run build

# Lint (TypeScript check + ESLint, zero warnings)
npm run lint

# Frontend only
npm run dev:frontend

# Backend only
npm run dev:backend
```

There are no automated tests in this project.

## Architecture

This is **FantasyVision** — a Fantasy Eurovision Song Contest app. Users predict the final ranking of Eurovision contestants, earn points based on prediction accuracy, and compete in leagues.

### Stack

- **Frontend**: React 19 + React Router v7 + Tailwind CSS v4, served by Vite
- **Backend**: [Convex](https://convex.dev) (real-time database + serverless functions)
- **Auth**: Clerk (JWT-based, integrated with Convex via `convex/auth.config.ts`)

### Key concepts

**Contest lifecycle**: Contests have a `status` of `draft → open → results → archived`. The active contest is stored in `appSettings` (a single row keyed `"global"` with `activeContestId`). All queries resolve the active contest via this settings row.

**Scoring** (`convex/lib/scoring.ts`): Points are awarded based on how close a user's predicted rank is to the actual placement. The lookup table is `[12, 10, 8, 7, 6, 5, 4, 3, 2, 1]` indexed by absolute difference. Scores are `null` until `contestant.placement` is set (results published).

**Predictions**: Stored as an ordered array of `contestant._id`s (`ranking`). One prediction per user per contest. The `saveViewerPrediction` mutation upserts. Unauthenticated users can draft a local prediction (stored in `localStorage` under the key prefix `fantasyvision_prediction`).

**Leagues**: Users create leagues (public or private). Private leagues have a join code derived from the last 8 alphanumeric characters of the league's Convex ID, uppercased. The creator can't leave while others are still members.

**Viewer pattern**: Convex functions resolve "the current user" via `convex/lib/viewer.ts`. Queries use `getViewerByIdentity` (returns null if unauthenticated). Mutations use `requireViewerForMutation` which also upserts the user from Clerk identity (so the Convex `users` table is always kept in sync with Clerk). The `ViewerBootstrap` component in `App.tsx` triggers this upsert on sign-in.

### File layout

```
convex/           Convex backend (schema, queries, mutations)
  schema.ts       — single source of truth for all tables
  auth.config.ts  — Clerk JWT provider config
  contests.ts     — home page & predict page queries
  predictions.ts  — save/get/share prediction mutations & queries
  leagues.ts      — league CRUD and leaderboard queries
  users.ts        — getViewer / upsertViewer
  lib/
    scoring.ts    — pure scoring logic (buildPredictionRows, calculatePredictionScore)
    viewer.ts     — auth helpers used across all Convex functions
  seed.ts         — data seeding helpers
src/
  App.tsx         — entire React app: all routes, components, and pages in one file
  main.tsx        — app entry point with Clerk + Convex providers
```

### Environment variables

Required in `.env.local`:
- `VITE_CONVEX_URL` — Convex deployment URL
- `VITE_CLERK_PUBLISHABLE_KEY` — Clerk publishable key
- `CLERK_JWT_ISSUER_DOMAIN` — used by `convex/auth.config.ts` (Convex environment, not Vite)

### Note on the `fantasyeurovision/` subdirectory

There is a separate Next.js + Firebase app at `fantasyeurovision/`. This is an older/alternate implementation and is not part of the active Convex-based app described above.
