# Agent Notes — HDTracker

This file gives any AI assistant the context needed to work effectively on HDTracker. Read [OVERVIEW.md](./OVERVIEW.md) for the full product scope, and [supabase/README.md](./supabase/README.md) for the schema and migration workflow before writing code.

## What this app is

Internal-only inventory tracker for our service vehicles. Used primarily on mobile by traveling low-voltage electrical technicians; must also work on a desktop browser. Single company, single team — no multi-tenancy.

## Current state (read this before changing auth or RLS)

**Auth is on** — email + password, no confirmation email. The Supabase project must have **Authentication → Providers → Email → Confirm email = OFF**, otherwise sign-up sends a confirmation mail that the `@hdsecurity.systems` mailbox can't receive yet. The sign-in flow at `/signin` is two-stage:

1. Email field only. Submitting checks `public.known_emails` to decide whether this address has been registered before.
2. Password field appears below the (now disabled) email field. New addresses see a hint and a "Create account" button; existing addresses see a "Sign in" button with no hint.

`public.known_emails` is maintained by triggers on `auth.users` (migration 0008). Migration 0001's trigger enforces the `@hdsecurity.systems` domain server-side; migration 0008 reverted the temporary `mark.hacz@gmail.com` allowlist from 0002.

**RLS stays permissive** (`using (true)`) on every `public.*` table. Mark has explicitly said to leave it alone for now — the auth gate at the proxy is good enough until he asks to tighten. Don't restructure RLS without an explicit ask.

To tighten later: rewrite each table's policies to require `auth.uid() is not null` (or stricter) and migrate `vehicle_activity.user_id` joins to a real profiles table when one lands.

## Two principles that override everything else

1. **Mobile-first.** Every screen is designed for a phone held one-handed in a parking lot. Desktop is a fallback, not the primary surface.
2. **Easy to use.** If a common action takes more than two taps, it's too complex. Prefer autocomplete dropdowns over open text fields. Prefer pickers over keyboards. Touch targets ≥44×44px. Forgiving inputs (no required-field gauntlets when a sensible default exists).

When you face a design trade-off, these two principles win.

## Key product decisions to respect

- **Access is restricted to `@hdsecurity.systems` emails.** Enforced client-side in `src/lib/email.ts` and server-side by the trigger in migration 0001. Case-insensitive; display form is `HDSecurity.Systems`.
- **Vehicles are the top-level entity.** Inventory, tools, location, issues, last-job, notes, and photos all hang off a Vehicle.
- **Quantity is flexible, not strict.** The flexible `quantity_text` column holds whatever fits:
  - numeric counts (`50`)
  - unit-based descriptors (`1 roll`, `2 packs`, `1 box`)
  - the four canonical stock levels: `None`, `Low stock`, `Has some`, `Well stocked`
  - free-form user descriptors that get remembered
  - **Never force a user into a numeric quantity field.**
- **The app learns.** Item names, tool names, and quantity descriptors are surfaced fleet-wide as autocomplete suggestions via a custom `<Combobox>` component (native `<datalist>` is unreliable on mobile — don't switch back).
- **Quantity math depluralizes.** `subtractFromQuantity` and `addToQuantity` (in `src/lib/vehicle-detail-fields.ts`) handle the singular/plural transition when crossing 1 — keep that working when changing them.
- **Location is one tap.** "Use current location" via the browser Geolocation API is the primary path; manual textarea is the fallback.
- **Issues are free-form and resolvable.** Plain text items the tech can add and mark resolved. Each issue can attach photos.
- **Photos: three scopes.** Per-vehicle gallery, per-issue strip, and at-most-one per hardware/tool item (replace-on-upload, with timestamp). All live in the same `vehicle-photos` Storage bucket, distinguished by DB row.
- **History via DB triggers.** AFTER triggers on `vehicles`, `vehicle_items`, `vehicle_issues`, and `vehicle_photos` populate `vehicle_activity`. The history page at `/vehicles/[id]/history` reads from there. Actor display name is derived from the email's local-part (split on `. _ -`, title-cased).

## Built (don't re-architect without asking)

- **Sign-in** at `/signin` — two-stage email → password, no confirmation mail.
- **Home** `/` — vehicles list (most-recently-updated first), Add Vehicle FAB, sticky header with Quick view link + Sign out + build-version stamp.
- **`/vehicles/new`** — add form (name required, make / model / year / plate optional).
- **`/vehicles/[id]`** — `VehicleDetailClient` (large client component) with collapsible sections in this order: Hardware, Tools, Location, Last job, Vehicle details, Issues, Notes, Photos. Sticky bottom bar with Undo + Save Changes. View history link + Delete vehicle section at the very bottom.
- **`/vehicles/[id]/history`** — per-day timeline of activity rows.
- **`/quickview`** + **`/vehicles/[id]/quickview`** — read-only summaries (fleet-wide and per-vehicle).
- **`<Combobox>`** at `src/components/Combobox.tsx` — touch-friendly autocomplete with outside-tap dismiss.
- **Drag-to-reorder** hardware and tool items via `@dnd-kit` (long-press on touch, press-and-drag on mouse).
- **Live updates** via Supabase Realtime — `<LiveUpdater>` component on read-only pages, direct issues subscription inside the editor.
- **Per-item photos** — one photo per hardware/tool row with upload timestamp; replace-on-upload (new file uploaded, DB row updated, old storage file cleaned up).
- **Edit Quantity modal** (the `•••` menu) — numeric add / remove, four stock-level quick picks, freeform "Or set quantity to" textbox, photo section, "Remove {item}" destructive footer action.

## TBD (open questions / not yet built)

- **First-time onboarding modal** — was scoped (pre-fill first name from email local-part, prompt for first + last) but never built. Activity log currently derives a display name from email on the fly instead. No `profiles` table yet.
- **PWA install support** — manifest + service worker not yet added.
- **Offline write queueing.**
- **Cross-fleet resupply view** — one shopping list view across all vans.
- **Variants** — toggle bolt sizes (1/8, 3/16, 1/4) as separate items vs sub-quantities. Currently separate items.
- **Editor live updates for items/photos/metadata** — currently only issues are live in the editor (the rest conflict with local draft state).
- **Resend SMTP for `@hdsecurity.systems`** — needs DNS access. Until then, `Confirm email` must stay OFF in Supabase or signups will hang waiting for a confirmation mail the company mailbox can't receive.

## Tech stack

- **Next.js 16** (App Router, Turbopack) + **React 19** + **TypeScript** (strict mode)
- **Tailwind CSS 4** (PostCSS plugin form), mobile-first breakpoints
- **Supabase** for Postgres + email/password auth + Realtime + Storage
- **@dnd-kit/core**, **@dnd-kit/sortable**, **@dnd-kit/utilities** for the item drag handles
- **Vitest** for unit tests
- **Vercel** for hosting — auto-deploys from `main`

If you change the stack, document the reasoning in [OVERVIEW.md](./OVERVIEW.md).

## Conventions

- TypeScript `strict: true`.
- No code comments unless explaining a non-obvious *why*. Well-named functions don't need narration.
- Components in PascalCase (`VehicleCard.tsx`). Utilities in kebab-case (`vehicle-detail-fields.ts`).
- `src/app/` for routes and server actions. `src/lib/` for pure logic and Supabase clients. `src/components/` for reusable UI. `supabase/migrations/` for schema.
- One feature per commit. Don't bundle drive-by refactors.
- Don't rename `src/lib/supabase/middleware.ts` — that filename matches Supabase's own docs naming for the session-refresh helper, even though Next.js 16 calls the file convention `proxy.ts`.

## Testing

- **Vitest** for pure logic — quantity parsing / depluralization, autocomplete ranking, GPS validation, photo file validation, activity descriptors, relative time formatting.
- Trivial UI rendering isn't unit-tested — verify by running the dev server.

## Ask before assuming

- **Schema changes** — propose a migration, don't apply silently. Then paste the SQL contents (not the file path) in chat so Mark can run it via the Supabase SQL Editor.
- **Paid infrastructure** — flag before pushing us onto a paid Supabase / Vercel tier.
- **New dependencies** — keep the dep list lean; justify each one.
- **RLS tightening** — Mark wants permissive RLS until he says otherwise.

## Mobile apps

Native iOS/Android shells exist via Capacitor in **remote mode** (`ios/`, `android/`, `capacitor.config.ts`): thin WebViews loading the production Vercel deployment, so web deploys update both apps instantly. See [MOBILE.md](./MOBILE.md) for build + distribution steps. A store re-release is only needed for native-layer changes (server URL, icons, plugins). Don't edit generated native project internals by hand — change `capacitor.config.ts` and run `npm run cap:sync`.

## Out of scope (for now)

- Multi-company / multi-tenant.
- Barcode scanning, supplier integration, automatic reordering.
- Customer-facing anything.

## When in doubt

Re-read the two principles. If your proposed solution makes the app harder to use on a phone, it's wrong even if it's technically elegant.

---

<!-- BEGIN:nextjs-agent-rules -->
## This is NOT the Next.js you know

This version (Next.js 16) has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->
