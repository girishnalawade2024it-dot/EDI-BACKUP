# Progress

Status of the EDI Campus Resource Booking Portal.
Last updated: 2026-09-21.

---

## Where things stand

The portal is **feature-complete for the demo** and running against the live
Supabase project. All three role modules (Admin, Faculty, Lab Assistant) are
built out, the booking engine enforces the SRS rules, and the audit trail and
notification system are wired end to end.

What remains is hardening, not building: real authentication, tighter write
policies, verifying two database constraints, and fixing schema drift between
the migrations and production.

---

## Completed

### Database
- [x] Base schema — 6 tables, 9 foreign keys (`001`)
- [x] Unused columns dropped (`002`)
- [x] Seed data: 3 roles, 6 users, 11 resources, 6 bookings (`003`)
- [x] RLS enabled on all tables; sequences resynced past seed IDs (`004`)
- [x] `password_hash` sealed off via column-level grants (`004`)
- [x] `booking_type` normalized to the uppercase enum (`005`)
- [x] Resource capacities backfilled (`006`)
- [x] Single timestamp convention (Asia/Kolkata local wall-clock); `app_meta`
      migration ledger added and locked down (`007`)
- [x] GiST EXCLUDE constraint written to prevent overlapping approvals (`008`)

### Frontend — shared
- [x] Config layer — all rules externalized to `config.js` (NFR-M3)
- [x] Session management + role-based dashboard routing
- [x] Supabase client with full localStorage fallback engine
- [x] Calendar / time-slot picker widget

### Booking engine
- [x] `submitBooking` with overlap detection and alternative suggestions
- [x] `approveBooking` / `denyBooking` with enumerated denial reasons
- [x] `cancelBooking` honouring the 2-hour cutoff
- [x] `preemptBooking` for `can_override` roles
- [x] Audit log entry + notification emitted on every state change

### Modules
- [x] **Faculty** — dashboard, booking form, timeslots, confirmation, history,
      resources, profile
- [x] **Lab Assistant** — dashboard, requests, schedule, inventory, profile
- [x] **Admin** — dashboard, resources, labs, classrooms, users, conflicts,
      reports, profile
- [x] **Team 3 (Girish)** — admin stat cards, reports with CSV export,
      notification bell with read state, audit log viewer

### Verified live (2026-09-21)
- [x] All 9 foreign keys resolve through PostgREST embeds
- [x] RLS active — `users` column grants enforced, `app_meta` returns 401
- [x] Row counts: roles 3 · resources 11 · bookings 6 · audit_logs 7 ·
      notifications 5

---

## Open items

### Blocking real use
- [x] **Replace email-only login with Supabase Auth.** Integrated `supabase.auth.signInWithPassword` in `assets/js/auth.js`, created migration `009_create_auth_users.sql` to link `auth.users` with `public.users(auth_id)`, and enforced password verification in `login.html`.
- [ ] **Tighten write policies.** `bookings` inserts and updates are
      `USING (true)` for `anon`; the anon key is public in client JS, so anyone
      can write. Scope policies to the authenticated user.

### Correctness
- [ ] **Verify the constraints from 005 and 008 landed.** Could not be checked
      through the anon API — the OpenAPI spec is service-role only. Run in the
      SQL editor:
      ```sql
      SELECT conname, contype, pg_get_constraintdef(oid)
      FROM pg_constraint WHERE conrelid = 'bookings'::regclass;
      SELECT extname FROM pg_extension WHERE extname = 'btree_gist';
      ```
      Expect `bookings_booking_type_check` (type `c`),
      `bookings_no_approved_overlap` (type `x`), and `btree_gist`.
      Circumstantial evidence says 005 ran — live `booking_type` values are
      uppercase, which only 005 does. Nothing equivalent confirms 008.
- [ ] **Fix schema drift:** add a `009` migration creating
      `resources.has_machines`. It exists in production but not in `001`, so
      a clean replay of the migrations does not reproduce the live schema.
- [x] **Duplicate `user_id: 4`** in `SEED_USERS` (`assets/js/auth.js`) — resolved by updating Rahul Verma to `user_id: 6`.

### Nice to have
- [ ] Automated tests — none exist
- [ ] Recurring bookings: `bookings.series_id` is stored but no UI creates or
      manages a series
- [ ] `audit_logs.target_entity_type` / `target_entity_id` are polymorphic with
      no FK; the log viewer does not resolve them to entity names
- [ ] Email or push delivery for notifications (currently in-app only)

---

## Timeline

| Milestone | Commit |
|---|---|
| Project documentation added | `3ce94e8` |
| Supabase schema set up | `41ae389` |
| Seed data + migration ordering fixes | `a49d1d4` → `5b2449d` |
| Team 3: reports, notifications, audit log | `41a1884` |
| Full portal across all three modules | `6b10e2e` |
| Login fixes (fallback, export, handler) | `652f83b` → `60e3d8b` |
| localStorage database engine | `6554917` |
| Latest | `88a8cac` |