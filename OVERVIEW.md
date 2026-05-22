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

### Access & Onboarding

- **Email domain whitelist.** Only `@HDSecurity.Systems` email addresses can access the app. Any other address is rejected at sign-in. The check is case-insensitive but the display form is `HDSecurity.Systems`.
- **First-time onboarding.** When an allowed email signs in for the first time:
  - Show a modal asking for **first name** and **last name**.
  - Pre-fill the first name with the local-part of the email (the text before the `@`). Example: `mark@HDSecurity.Systems` → first name autofills as `Mark` (capitalize the first letter).
  - User can accept or correct, then enter their last name.
  - Profile is saved; modal does not appear again for that user.
- **Auth mechanism (sub-question still open):** magic link vs OAuth (Google Workspace, if the company runs on Google) vs email + password. Magic link is the lowest-friction default for a phone-first internal tool, but if the company already has Google Workspace, "Sign in with Google" + domain check is even smoother.

### Vehicles

- Add a vehicle (name + optional details such as make/model/plate).
- View list of all vehicles in the fleet.
- Select a vehicle to drill into its current state.
- Per-vehicle data:
  - **Location.** Editable. Two entry methods:
    - "Use my current location" button — browser Geolocation API.
    - Manual entry — typed address or free-form description ("Marriott parking lot, Tampa").
  - **Last worked job.** Short text describing the most recent job this van was used on. Useful context for predicting what got consumed.
  - **Issues / maintenance log.** Free-form list of known issues ("needs oil change", "AC compressor making noise"). Items can be added, edited, and marked resolved.

### Inventory (Hardware / Consumables)

- Per-vehicle list of items.
- Add via a single **`+`** button. Tap it, get a typing/dropdown autocomplete for item name.
- The autocomplete:
  - Suggests previously entered item names (across all vehicles in our fleet).
  - Accepts free entry if the item isn't in the list yet.
  - **Learns**: new entries become suggestions for next time.
- **Quantity is flexible.** Each item can be tracked with any of these:
  - **Numeric count** — `50 tap-cons`, `12 door contacts`.
  - **Unit-based descriptor** — `1 roll of velcro`, `2 packs of beanies`, `1 box of zip ties`. Unit names ("roll", "pack", "box") are also learned and offered as suggestions.
  - **Stock level enum** — `NONE`, `HAS SOME`, `WELL STOCKED`. The simplest possible signal — use when even units don't fit.
  - **Free-form custom descriptor** — user types whatever fits ("3/4 of a spool"). Remembered for next time.
  - **Blank** — falls back to a sensible default, probably `HAS SOME`.
- **Never force a numeric quantity.** The whole point is that real hardware doesn't always quantize.
- Example items (not exhaustive): zip ties, toggle bolts (1/8", 3/16", 1/4"), squeeze connectors, tap-cons, velcro, beanies (wire nuts), door contacts, resistors, low-voltage cable.
- **Variants matter.** Toggle bolts come in three sizes; resistors come in many values. Open question (below): one entry with variants, or separate entries per variant?

### Tools

- Per-vehicle list of tools.
- Same autocomplete-with-learning pattern as inventory.
- Examples: drill, impact drill, hammer drill, Sawzall, ladder, fish tape, multimeter, label printer.
- Tools are mostly presence/absence (count = 1), but the same flexible quantity model applies — a van might carry "2 drills".

### Cross-cutting Behaviors

- **Mobile-first design.** Every screen built for a phone, one-handed. Big touch targets, no tiny text, minimal typing.
- **Desktop-compatible.** Layouts scale up cleanly for office use; nothing breaks at desktop widths.
- **Learning.** Item names, tool names, and quantity descriptors entered by any user appear as autocomplete options for everyone after the first entry. This makes the app faster over time and keeps the team's naming consistent.
- **Offline tolerance (stretch).** Should not crash on poor signal; ideally queues writes when offline and syncs when back online.

## Non-Goals (right now)

- Native iOS/Android app. A PWA installable to the home screen covers the mobile experience for now.
- Multi-company / multi-tenant SaaS. Internal only.
- Barcode scanning, supplier integration, automatic reordering.
- Customer-facing portals or public access.

## Open Questions

Things to decide before or during implementation:

1. **Auth mechanism.** Domain restriction and onboarding flow are decided (see Access & Onboarding). Still open: magic link vs Google Workspace SSO vs email + password.
2. **Variants.** Should toggle bolt sizes (1/8, 3/16, 1/4) be three separate items, or one item with size sub-quantities? Same question for resistor values.
3. **History / change log.** Do we want a per-vehicle activity log (who added/removed what, when)?
4. **Photos.** Useful to attach a photo when noting a vehicle issue (a dent, a leak)? Probably yes — mobile makes it easy.
5. **Resupply view.** When multiple vans are low on the same item, is there a consolidated "shopping list" view for office/dispatch?
6. **Geolocation precision.** Store full lat/lon, or just a human-readable label? Both?

## Phasing

### Phase 1 — MVP

- Vehicles list, vehicle detail view.
- Add / edit location (manual + geolocation).
- Inventory list with autocomplete + flexible quantity model.
- Tools list with same pattern.
- Issues log per vehicle.
- "Last worked job" field per vehicle.
- Single shared login (simplest auth).
- PWA installable on phones.
- Hosted on Vercel.

### Phase 2 — Polish

- Per-user accounts and a per-vehicle change history.
- Offline write queueing + background sync.
- Photos on issues (and maybe on inventory entries).
- Resupply / shopping list view across the fleet.

### Phase 3 — Mobile push

- Decide between staying PWA or wrapping with React Native, based on Phase 1 usage feedback.
- Push notifications for low-stock alerts (only if Phase 1 surfaces a real need).

## Repository

https://github.com/3ggz/HDTracker
