# HDTracker

A mobile-first inventory app for tracking what's actually in our service vehicles.

## The Problem

We're a low-voltage electrical company with service vehicles parked across multiple states and cities. Our hangar is stocked, but our vans aren't — and when a tech flies into a city and grabs the local van, they don't always know what's already on board. Missing hardware = wasted trip = unhappy customer.

HDTracker is our internal tool to fix this: a fast, easy way for technicians to check and update vehicle inventory from their phone before they leave for a job.

## Status

Deployed to Vercel and in active use. Password sign-in, the full vehicle / hardware / tools / issues / location / notes / photos workflow, per-vehicle and fleet quick views, history log, live multi-user updates, drag-to-reorder, depluralizing math on quantities, per-item photos — all in. PWA install support is still the biggest visible gap.

- [OVERVIEW.md](./OVERVIEW.md) — full scope, features, users, phasing
- [AGENTS.md](./AGENTS.md) — context for AI assistants picking up work here
- [supabase/README.md](./supabase/README.md) — schema migrations and how to apply them

## Tech Stack

- **Frontend:** Next.js 16 (App Router, Turbopack) + React 19 + TypeScript (strict) + Tailwind CSS 4
- **Backend / DB:** Supabase — Postgres + email/password auth (no confirmation mail) + Realtime + Storage for photos
- **Drag-to-reorder:** `@dnd-kit` for the hardware/tools list
- **Hosting:** Vercel — auto-deploys from `main`

## Who Uses This

Internal only. Access is gated at the sign-in form **and** at the database level to `@hdsecurity.systems` email addresses (case-insensitive). No public signup, no multi-tenancy, no customer-facing surfaces.

## What's Built

- **Sign-in** — two-stage email → password. Existing accounts get "Sign in"; new addresses get "Enter a password to create one". No confirmation email sent.
- **Vehicles** — list with most-recently-updated first, add / edit / delete, FAB at the bottom-right.
- **Per-vehicle detail page** — collapsible sections: Hardware, Tools, Location, Last job, Vehicle details, Issues, Notes, Photos. Sticky Save Changes bar at the bottom with Undo.
- **Hardware / Tools rows** — drag handle, name + quantity inputs with autocomplete, ••• menu opens an Edit Quantity modal (add/remove N, four canonical stock levels, freeform custom value, replace photo, remove item).
- **Quantity math** — depluralizes / pluralizes the unit when crossing 1 (`2 rolls` − 1 = `1 roll`, `1 roll` + 1 = `2 rolls`).
- **Location** — manual entry + "Use current location" via the Geolocation API.
- **Issues** — add inline, resolve / reopen, photo strip per issue.
- **Photos** — per-vehicle gallery + per-issue strip + one photo per hardware/tool item (with upload timestamp).
- **History** — `/vehicles/[id]/history` shows a per-day timeline of every change with the actor's name derived from their email.
- **Quick views** — `/quickview` for the whole fleet and `/vehicles/[id]/quickview` for a single vehicle, both read-only and dense.
- **Live updates** — Supabase Realtime keeps multiple techs on the same page in sync.

## Quick Start

Prerequisites: Node 20+ and npm.

```bash
# 1. Install dependencies
npm install

# 2. Set up local environment
cp .env.example .env.local
# then edit .env.local and paste in your Supabase project URL +
# publishable key (find them in the Supabase dashboard under
# Project Settings > API Keys)

# 3. Run the dev server
npm run dev
```

The app will be at http://localhost:3000.

You'll also need to **apply the SQL migrations** in `supabase/migrations/` in order via the Supabase dashboard's SQL Editor (the project doesn't have the Supabase CLI wired up yet). See [supabase/README.md](./supabase/README.md) for the per-migration purpose.

## Testing

```bash
npm test    # vitest, runs once and exits
```

48+ tests cover the quantity math, autocomplete suggestion ordering, vehicle-activity descriptor strings, relative time formatting, photo validation, and other pure helpers. UI is verified by running the dev server.

## Repository

https://github.com/3ggz/HDTracker
