# EDI — Campus Resource Booking Portal

A web portal for booking college labs and classrooms. Faculty request rooms,
Lab Assistants manage day-to-day schedules and inventory, and Admins approve,
deny, or pre-empt requests — with every decision written to an audit trail.

Built as a static multi-page frontend (vanilla JS ES modules, no build step)
on top of a Supabase / PostgreSQL backend.

---

## Tech stack

| Layer     | Choice |
|-----------|--------|
| Frontend  | Static HTML + vanilla JS ES modules, no bundler |
| Styling   | Hand-written CSS (`assets/css/style.css`, `t3-styles.css`) |
| Backend   | Supabase (PostgreSQL + PostgREST Data API) |
| Client    | `@supabase/supabase-js@2` loaded from esm.sh CDN |
| Tooling   | `supabase` CLI (dev dependency only) |

There is no server to run. Every page is static and talks to Supabase directly
from the browser.

---

## Running it

The pages use ES modules, so opening `login.html` with `file://` will fail on
CORS. Serve the folder over HTTP:

```bash
npx serve .
# or
python -m http.server 8000
```

Then open `http://localhost:8000/login.html`.

### Logging in

Authentication is powered by **Supabase Auth (GoTrue)** with secure bcrypt password hashing and JWT sessions. Use any of the configured accounts:

| Role | Email | Password |
|---|---|---|
| Faculty | `anjali.deshmukh@college.edu` | `Faculty@123` |
| Lab Assistant | `amit.patil@college.edu` | `Assistant@123` |
| Admin | `admin@college.edu` | `Admin@123` |

Upon successful login, you are authenticated via Supabase and redirected to the appropriate dashboard via `ROLE_DASHBOARDS`.

### Google Authentication (OAuth 2.0)

Users can sign in using **Google Single Sign-On (SSO)** via Supabase Auth.

- **Existing users**: If their Google email matches an existing account (e.g. `admin@college.edu`), they are automatically logged into their configured role (`Admin`, `Faculty`, etc.).
- **New users**: Automatically provisioned into `public.users` with the default role of **`Faculty`**.

#### 2-Step Google OAuth Setup:
1. **Google Cloud Console** ([console.cloud.google.com](https://console.cloud.google.com/apis/credentials)):
   - Create an **OAuth 2.0 Client ID** (Application type: **Web application**).
   - Under **Authorized redirect URIs**, add:
     ```text
     https://vzrevunlustmcssdqqnw.supabase.co/auth/v1/callback
     ```
   - Copy the generated **Client ID** and **Client Secret**.
2. **Supabase Dashboard** ([supabase.com/dashboard](https://supabase.com/dashboard)):
   - Go to **Authentication** &rarr; **Providers** &rarr; **Google**.
   - Toggle **Enable Google provider** to ON.
   - Paste your **Client ID** and **Client Secret**, and click **Save**.

---

## Project layout

```
login.html                 Entry point / role-based redirect
admin/                     Admin module
  dashboard  resources  labs  classrooms  users  conflicts  reports  profile
faculty/                   Faculty module
  dashboard  booking  timeslots  confirmation  history  resources  profile
assistant/                 Lab Assistant module
  dashboard  requests  schedule  inventory  profile
assets/js/
  config.js                All tunable rules — hours, slot size, enums (NFR-M3)
  supabase-client.js       Supabase client + localStorage fallback engine
  auth.js                  Session handling, login, role redirects
  booking-engine.js        Core domain logic (see below)
  admin-approval.js        Admin approval queue rendering
  calendar-widget.js       Date/slot picker
  app.js                   Shared nav/UI glue
  t3-dashboard.js          Team 3: admin stat cards
  t3-reports.js            Team 3: reports + CSV export
  t3-notifications.js      Team 3: notification bell & read state
  t3-auditlog.js           Team 3: audit log viewer
supabase/migrations/       001–008, applied in order
docs/                      SRS, DB schema doc, functional design
```

### Configuration

All business rules live in `assets/js/config.js`, never hardcoded in logic:

- Operating hours `08:00`–`18:00`, 30-minute slots
- Max booking length 4 hours; cancellation cutoff 2 hours before start
- Status model: `PENDING · APPROVED · DENIED · CANCELLED · PREEMPTED · COMPLETED`
- Enumerated denial reasons and audit event types

### Booking engine

`assets/js/booking-engine.js` holds the domain logic — each function writes its
own audit log entry and notification:

`submitBooking` · `approveBooking` · `denyBooking` · `cancelBooking` ·
`preemptBooking` · `checkOverlap` · `suggestAlternatives`

---

## Database

Supabase project ref `vzrevunlustmcssdqqnw`. URL and anon key are in
`assets/js/supabase-client.js`. **Seven tables:**

| Table | Purpose |
|---|---|
| `roles` | Faculty / Lab Assistant / Admin, with `can_override` |
| `users` | Accounts, FK to `roles` |
| `resources` | Labs and classrooms — block, capacity, `has_machines`, status |
| `bookings` | The central table; requester, approver, slot, status |
| `audit_logs` | Append-only trail of every state change |
| `notifications` | Per-user messages, linked to a booking |
| `app_meta` | Internal migration ledger — not exposed to the portal |

### Relationships (9 foreign keys)

```
roles     1──N users
users     1──N bookings      (requested_by, NOT NULL)
users     1──N bookings      (approved_by,  nullable)   ← two edges
resources 1──N bookings
users     1──N audit_logs    (actor_user_id)
bookings  1──N audit_logs    (nullable)
resources 1──N audit_logs    (nullable)
users     1──N notifications
bookings  1──N notifications (nullable)
```

`app_meta` stands alone. Two soft links carry no FK constraint:
`bookings.series_id` (groups recurring bookings) and
`audit_logs.target_entity_type` + `target_entity_id` (polymorphic pointer).

### Migrations

| File | What it does |
|---|---|
| `001_create_database.sql` | Base schema, 6 tables |
| `002_remove_unused_columns.sql` | Drops `priority_rank`, `is_active`, `requires_machines`, `actor_role` |
| `003_insert_test_data.sql` | Seed roles, users, resources, bookings |
| `004_rls_and_sequences.sql` | RLS policies, sequence resync, column-level grants |
| `005_normalize_booking_type.sql` | Uppercase enum + CHECK constraint |
| `006_backfill_resource_capacity.sql` | Fills missing capacities |
| `007_normalize_timestamp_convention.sql` | One timestamp convention; creates `app_meta` |
| `008_prevent_double_booking.sql` | GiST EXCLUDE constraint against overlapping approvals |

Apply with `npx supabase db push`.

### Security model

The anon key ships in client-side JS, so **RLS is the entire security
boundary.** Two deliberate hardening steps:

- `users` — table-wide `SELECT` is revoked and re-granted column by column, so
  `password_hash` can never leave through the Data API. A `select=*` on `users`
  returns `42501`; naming the safe columns works. This is expected, not a bug.
- `app_meta` — RLS enabled with no policies plus `REVOKE ALL`, unreachable by
  `anon` and `authenticated`.

Current policies on `bookings` are `USING (true)`, meaning anyone holding the
anon key can write. Acceptable for coursework; see Known gaps before any real
deployment.

### Offline fallback

If Supabase credentials are absent or contain `YOUR_` placeholders,
`supabase-client.js` transparently serves every table from `localStorage`,
seeded from `003_insert_test_data.sql`. The whole portal — joins, filters,
writes — runs with no backend. Credentials are currently present, so the live
database is in use.

---

## Known gaps

- **No password verification.** `login()` matches on email alone. Move to
  Supabase Auth before this is exposed to real users.
- **Schema drift.** `resources.has_machines` exists in the live database but is
  missing from `001_create_database.sql`; it only appears in the 003 seed
  insert. A from-scratch migration replay will not reproduce production.
- **Constraints in 005 and 008 are unverified against the live database.** The
  nine foreign keys, the RLS grants, and `app_meta`'s lockdown are all
  confirmed live. The `bookings_booking_type_check` CHECK and the
  `bookings_no_approved_overlap` EXCLUDE could not be checked through the anon
  API. Confirm in the SQL editor:
  ```sql
  SELECT conname, contype, pg_get_constraintdef(oid)
  FROM pg_constraint WHERE conrelid = 'bookings'::regclass;
  SELECT extname FROM pg_extension WHERE extname = 'btree_gist';
  ```
- **Duplicate seed ID.** `SEED_USERS` in `assets/js/auth.js` assigns
  `user_id: 4` to both Sneha Joshi and Rahul Verma. Affects the offline
  fallback only.
- **Write permissions are wide open** to the anon role on `bookings`.
- No automated tests.
