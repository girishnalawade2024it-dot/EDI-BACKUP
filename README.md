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

Login is **email-only** — password verification is deliberately skipped for the
demo (see `assets/js/auth.js:82`). Use any seeded address:

| Email | Role |
|---|---|
| `anjali.deshmukh@college.edu` | Faculty |
| `amit.patil@college.edu` | Lab Assistant |
| `admin@college.edu` | Admin |

You are redirected to the dashboard for your role via `ROLE_DASHBOARDS`.

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

## Automation (GitHub Actions)

Workflows live in `.github/workflows/` and start working as soon as the code is
pushed. Each backend module has its own workflow that runs only when that
module's files change, plus one full CI run on every push and pull request.

| Workflow | Runs when | What it does |
|---|---|---|
| `ci.yml` | every push to `main`, every PR | All tests on Python 3.11 / 3.12 / 3.13, and checks the server boots |
| `module-auth.yml` | `backend/api/auth.py` changes | `tests/modules/test_auth.py` |
| `module-resources.yml` | resources / slots API | `tests/modules/test_resources.py` |
| `module-bookings.yml` | bookings API, booking service, mutex | `test_bookings.py` + `tests/test_backend.py` |
| `module-approvals.yml` | approvals API / service | `tests/modules/test_approvals.py` |
| `module-notifications.yml` | notifications API / service | `tests/modules/test_notifications.py` |
| `module-audit.yml` | audit API / service | `tests/modules/test_audit.py` |
| `module-reports.yml` | reports API / service | `tests/modules/test_reports.py` |
| `module-admin.yml` | admin API | `tests/modules/test_admin.py` |
| `module-booking-logic.yml` | `booking_logic.py`, `api/logic.py` | `tests/modules/test_booking_logic.py` |
| `module-database.yml` | `backend/database/**` | `tests/modules/test_database.py` |
| `module-frontend.yml` | `admin/`, `faculty/`, `assistant/`, `assets/`, `*.html` | JS syntax check; every page per role loads and every local link resolves |
| `module-supabase.yml` | `supabase/**` | Applies all migrations to a throwaway Postgres; manual run with `deploy: true` pushes them to Supabase |
| `scheduled-jobs.yml` | every 30 min, college hours | Calls `/api/logic/expire` and `/api/logic/notifications/process` on the deployed backend |

All module workflows share `_module-tests.yml`. Any change to a shared file
(`backend/main.py`, `backend/database/**`, `requirements*.txt`) runs every
backend module workflow.

**Optional secrets** (Settings → Secrets and variables → Actions):

| Secret | Used by |
|---|---|
| `BACKEND_URL` | `scheduled-jobs.yml`. Without it the job skips |
| `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF` | `module-supabase.yml` deploy job. Also create a `production` environment so each deploy needs approval |

Run the same checks locally:

```bash
pip install -r requirements-dev.txt
python -m pytest                       # everything
python -m pytest tests/modules/test_bookings.py   # one module
python scripts/check_frontend.py       # frontend pages
```

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
