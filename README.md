# HDTracker

A mobile-first inventory app for tracking what's actually in our service vehicles.

## The Problem

We're a low-voltage electrical company with service vehicles parked across multiple states and cities. Our hangar is stocked, but our vans aren't — and when a tech flies into a city and grabs the local van, they don't always know what's already on board. Missing hardware = wasted trip = unhappy customer.

HDTracker is our internal tool to fix this: a fast, easy way for technicians to check and update vehicle inventory from their phone before they leave for a job.

## Status

Just getting started. Documents-first; code to follow.

- [OVERVIEW.md](./OVERVIEW.md) — full scope, features, users, phasing
- [AGENTS.md](./AGENTS.md) — context for AI assistants picking up work here

## Proposed Tech Stack

- **Frontend:** Next.js (App Router) + TypeScript + Tailwind CSS
- **Backend / DB:** Supabase (Postgres + auth + realtime), TBD
- **Delivery:** PWA, installable on iOS / Android home screens
- **Hosting:** Vercel

Tech choices are starting recommendations, not commitments. See [OVERVIEW.md](./OVERVIEW.md) for the reasoning and [AGENTS.md](./AGENTS.md) for what to ask before changing them.

## Who Uses This

Internal only. Our company, our techs. No multi-tenancy, no customer-facing surfaces, no public signup.

## Quick Start

To be filled in once the project is scaffolded.

## Repository

https://github.com/3ggz/HDTracker
