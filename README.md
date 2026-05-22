# HDTracker

A mobile-first inventory app for tracking what's actually in our service vehicles.

## The Problem

We're a low-voltage electrical company with service vehicles parked across multiple states and cities. Our hangar is stocked, but our vans aren't — and when a tech flies into a city and grabs the local van, they don't always know what's already on board. Missing hardware = wasted trip = unhappy customer.

HDTracker is our internal tool to fix this: a fast, easy way for technicians to check and update vehicle inventory from their phone before they leave for a job.

## Status

Scaffold landed (Next.js 16 + TypeScript + Tailwind 4). Auth and database wiring in progress.

- [OVERVIEW.md](./OVERVIEW.md) — full scope, features, users, phasing
- [AGENTS.md](./AGENTS.md) — context for AI assistants picking up work here

## Tech Stack

- **Frontend:** Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS 4
- **Backend / DB:** Supabase (Postgres + magic-link auth + realtime)
- **Delivery:** PWA, installable on iOS / Android home screens
- **Hosting:** Vercel (once we have a domain)

## Who Uses This

Internal only. Access is restricted to `@HDSecurity.Systems` email addresses — no public signup, no multi-tenancy, no customer-facing surfaces.

## Quick Start

Prerequisites: Node 20+ and npm.

```bash
# 1. Install dependencies
npm install

# 2. Set up local environment
cp .env.example .env.local
# then edit .env.local and paste in your Supabase project URL + anon key
# (find them in the Supabase dashboard under Project Settings > API)

# 3. Run the dev server
npm run dev
```

The app will be at http://localhost:3000. Sign-in flow and database wiring land in subsequent commits — see [OVERVIEW.md](./OVERVIEW.md) for current status.

## Repository

https://github.com/3ggz/HDTracker
