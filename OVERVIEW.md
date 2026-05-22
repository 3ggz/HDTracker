# HDTracker — Project Overview

## Background

We are a low-voltage electrical contracting company. Our technicians travel between job sites across multiple states and cities. We maintain a hangar that's fully stocked with tools and hardware, but our service vehicles are scattered — parked near current or recent job sites — and they don't always hold what we need.

The current pain: a technician flies into a city, picks up the local van, drives to the job, and discovers the van is missing critical hardware. Time lost, trip to a hardware store, customer waiting.

## Goal

Build a simple, mobile-first inventory app — used only by our company — so any technician can:

1. Pull up the app on their phone.
2. Pick the van they're using.
3. See exactly what's in it (and what isn't) before they leave.
4. Update inventory after the job so the next person has accurate data.

## Users

- **Technicians (primary).** Use the app from a phone, often in transit. May have only one hand free. May be in poor signal areas.
- **Office / dispatch (secondary).** May review fleet inventory from a desktop browser to plan jobs or resupply runs.

No customer-facing users. No external integrations. One company, one team.

## Feature Scope

### Access

- **Email domain whitelist.** Only `@hdsecurity.systems` email addresses can access the app. The check is case-insensitive (display form: `HDSecurity.Systems`). Enforced client-side at the sign-in form and server-side by a Postgres trigger on `auth.users`.
- **Auth: email + password**, no confirmation mail. The Supabase project has `Confirm email = OFF` because the company-domain mailbox isn't reachable yet (no Resend/SMTP wired up). Two-stage sign-in: enter email, then enter password — new addresses get a "Create account" button, existing ones get "Sign in".

### Vehicles

- Add, edit, or delete a vehicle (name + optional make / model / year / plate).
- View list of all vehicles, sorted most-recently-updated first.
- Tap a vehicle to drill into its full detail.
- Per-vehicle data:
  - **Location.** Manual textarea + "Use current location" via the Geolocation API.
  - **Last worked job.** Short text describing the most recent job this van was used on.
  - **Notes.** Free-form general notes about the vehicle.
  - **Issues / maintenance log.** Free-form items, addable inline and resolvable. Each issue can attach photos.

### Inventory (Hardware) and Tools

- Per-vehicle lists, separately collapsible.
- Drag-to-reorder within each list (long-press on touch, press-and-drag on mouse).
- Each row: name + flexible quantity_text + ••• Edit Quantity menu + one optional photo with timestamp.
- The autocomplete dropdown (custom `<Combobox>`, not native `<datalist>`) suggests names from across the fleet and **learns** as new names are typed.
- **Quantity is flexible**:
  - Numeric: `50 tap-cons`, `12 door contacts`. Add / subtract math is exposed in the Edit Quantity modal, and the unit depluralizes when crossing 1 (`2 rolls` − 1 = `1 roll`).
  - Unit-based: `1 roll of velcro`, `2 packs of beanies`.
  - Stock-level quick picks: `None`, `Low stock`, `Has some`, `Well stocked`.
  - Freeform: anything typed.
  - Default (blank) falls back to `Has some` on save.

### Photos

Three scopes, all stored in one `vehicle-photos` Supabase Storage bucket:

- **Per-vehicle** gallery (full grid, lazy-loaded thumbnails, tap to view full size).
- **Per-issue** strip rendered inline under each issue.
- **Per-item** single photo on each hardware/tool row, replace-on-upload, with upload timestamp. Surfaced in the row's Edit Quantity modal.

### History

- DB triggers on `vehicles`, `vehicle_items`, `vehicle_issues`, and `vehicle_photos` populate `public.vehicle_activity` for every meaningful change.
- `/vehicles/[id]/history` renders a per-day timeline; each row shows relative time, the actor's display name (derived from email local-part), and a human description.

### Quick views (read-only)

- `/quickview` — fleet-wide: every vehicle with its full hardware + tools + open issues.
- `/vehicles/[id]/quickview` — one vehicle, same content + photo grid.
- Skim everything without tapping into each card.

### Cross-cutting

- **Mobile-first design.** Big touch targets, minimal typing, sticky bottom bars for primary actions.
- **Desktop-compatible.** Layouts scale up cleanly for office use.
- **Live updates** via Supabase Realtime — read-only pages re-render automatically when data changes; the editor live-updates the issues list while preserving local draft state on items / metadata.
- **Undo + Save Changes** at the editor bottom — Save persists everything in one shot; Undo reverts all unsaved drafts to the last-saved state without a network round-trip.

## Non-Goals (right now)

- Native iOS/Android app. A PWA installable to the home screen is the eventual mobile delivery; full Phase-3 React Native wrap depends on usage feedback.
- Multi-company / multi-tenant SaaS. Internal only.
- Barcode scanning, supplier integration, automatic reordering.
- Customer-facing portals or public access.

## Open Questions

1. **Variants.** Toggle bolt sizes (1/8, 3/16, 1/4) are currently separate items. Worth changing to one item with size sub-quantities? Same question for resistor values.
2. **Resupply view.** When multiple vans are low on the same item, is there a consolidated "shopping list" view for office/dispatch?
3. **Geolocation precision.** We store lat/lon and a human-readable label — is the lat/lon ever surfaced (e.g. tap to open Maps)?
4. **First-time onboarding modal.** Originally scoped to capture first + last name on first sign-in and populate a profiles table. Currently activity rows derive a display name from the email's local-part instead — works without a profiles table. Build the modal anyway?
5. **Resend SMTP for `@hdsecurity.systems`.** Needed before we can turn `Confirm email` back on, do magic links, or send password resets. Blocked on DNS access from Mark's boss.

## Phasing

### Phase 1 — built

- Sign-in (email + password) with domain whitelist
- Vehicles: list / add / edit / delete
- Hardware, tools, location (manual + GPS), last job, notes, issues
- Flexible quantity model with add/subtract math + depluralization
- Per-vehicle, per-issue, and per-item photos
- Fleet and per-vehicle quick views
- Per-vehicle history timeline (DB-trigger backed)
- Live updates via Supabase Realtime
- Drag-to-reorder hardware/tools
- Undo + Save Changes batched edits
- Deployed on Vercel

### Phase 2 — next up

- PWA manifest + service worker (mobile install)
- First-time onboarding modal + profiles table (currently using email-derived display name)
- Editor live updates for items / metadata / photos (currently only issues)
- Offline write queueing + background sync
- Resupply / shopping list view across the fleet
- Resend SMTP wired to `@hdsecurity.systems` so we can turn confirmation emails back on

### Phase 3 — maybe

- Push notifications for low-stock alerts (only if Phase 1 + 2 usage surfaces a real need)
- React Native wrap if PWA falls short
- Tightened RLS (`auth.uid() is not null` minimum) when we're ready to harden

## Repository

https://github.com/3ggz/HDTracker
