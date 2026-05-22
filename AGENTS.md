# Agent Notes — HDTracker

This file gives any AI assistant the context needed to work effectively on HDTracker. Read [OVERVIEW.md](./OVERVIEW.md) for the full product scope before writing code.

## What this app is

Internal-only inventory tracker for our service vehicles. Used primarily on mobile by traveling low-voltage electrical technicians; must also work on a desktop browser. Single company, single team — no multi-tenancy.

## Two principles that override everything else

1. **Mobile-first.** Every screen is designed for a phone held one-handed in a parking lot. Desktop is a fallback, not the primary surface.
2. **Easy to use.** If a common action takes more than two taps, it's too complex. Prefer autocomplete dropdowns over open text fields. Prefer pickers over keyboards. Touch targets ≥44×44px. Forgiving inputs (no required-field gauntlets when a sensible default exists).

When you face a design trade-off, these two principles win.

## Key product decisions to respect

- **Access is restricted to `@HDSecurity.Systems` emails.** Reject any other domain at sign-in. The check is case-insensitive; the display form is `HDSecurity.Systems`.
- **First-time onboarding is a name modal.** On a user's first sign-in, prompt for first + last name. **Pre-fill** the first-name field with the email's local-part (text before `@`), capitalized — e.g. `mark@HDSecurity.Systems` → `Mark`. User can correct it. Don't show this modal again after the profile is saved.
- **Vehicles are the top-level entity.** Inventory, tools, location, issues, and last-job all hang off a Vehicle.
- **Quantity is flexible, not strict.** Some items (zip ties, beanies, velcro) don't have meaningful integer counts. The data model supports:
  - numeric counts (`50`)
  - unit-based descriptors (`1 roll`, `2 packs`, `1 box`)
  - stock-level enum: `NONE`, `HAS_SOME`, `WELL_STOCKED`
  - free-form user descriptors that get remembered
  - blank → default to `HAS_SOME` (or similar sensible default)
  - **Never force a user into a numeric quantity field.**
- **The app learns.** Item names, tool names, and quantity descriptors entered by any user should be offered as autocomplete suggestions for the next user. This keeps naming consistent and gets faster over time.
- **Location is one tap.** "Use my current location" via browser Geolocation API is the primary path. Manual entry is the fallback, not the default.
- **Issues are free-form and resolvable.** A vehicle's issues list is plain text items the tech can add and mark resolved — no rigid maintenance schema.

## Suggested tech stack

- Next.js 14+ (App Router) + TypeScript (strict mode)
- Tailwind CSS, mobile-first breakpoints
- Supabase: Postgres + auth + realtime
- PWA support (next-pwa or hand-rolled service worker)
- Vercel for hosting

If you change the stack, document the reasoning in [OVERVIEW.md](./OVERVIEW.md) under "Phasing" or a new "Architecture decisions" section.

## Conventions

- TypeScript `strict: true`.
- No code comments unless explaining a non-obvious *why*. Well-named functions don't need narration.
- Components in PascalCase (`VehicleCard.tsx`). Utilities in kebab-case (`parse-quantity.ts`).
- `app/` for routes and server actions. `lib/` for pure logic. `components/` for reusable UI. `supabase/migrations/` for schema.
- One feature per PR. Don't bundle drive-by refactors.

## Testing

- Vitest for pure logic — quantity parsing, autocomplete ranking, location formatting.
- Playwright for the critical paths on a mobile viewport: add vehicle, add inventory item, update location, log an issue.
- Don't write tests for trivial UI rendering. Verify those by running the dev server.

## Ask before assuming

- **Schema changes** — propose a migration, don't apply silently.
- **Auth model** — don't pick a login flow without confirming (shared login? per-tech? PIN? magic link?).
- **Paid infrastructure** — flag before pushing us onto a paid Supabase / Vercel tier.
- **New dependencies** — keep the dep list lean; justify each one.

## Out of scope (for now)

- Native iOS/Android app. PWA covers it; React Native is a Phase-3 maybe.
- Multi-company / multi-tenant.
- Barcode scanning, supplier integration, automatic reordering.
- Customer-facing anything.

## When in doubt

Re-read the two principles. If your proposed solution makes the app harder to use on a phone, it's wrong even if it's technically elegant.
