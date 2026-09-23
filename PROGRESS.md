# Project Progress Tracker

## Phase 1 — Real Authentication + Role-Based Access
**Implemented:**
- Replaced the mock login dropdown in `login.html` with an email/password form that queries the `users` table in Supabase to verify credentials (using the plaintext password hash from test data).
- Enforced role-based route access by querying the database on every page load (in `app.js`) to verify the user's role matches the requested module path (`/faculty`, `/assistant`, `/admin`).
- Managed user sessions using `localStorage` (storing user_id and role_id) and added automatic redirect/logout logic.

**Files Changed:**
- `login.html`: Added Supabase JS, replaced mock JS with Supabase auth query, updated input fields.
- `assets/js/app.js`: Added Supabase client init, `enforceAuth()` function for server-side role validation, and `logout()` handler.
- All 21 HTML files (`**/*.html`): Injected `<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>` before the closing `</head>` tags to ensure the Supabase client is available globally.

**KPIs / Concepts Demonstrated:**
- **KPI:** Role-based access (100% enforced server-side against Supabase on every route).
- **CN (Computer Networks):** Client-server request model used for authentication instead of trusting local static state.
- **DBMS:** Direct querying of the PostgreSQL `users` table for session validation.

## Phase 2 — Resource Browsing Flow
**Implemented:**
- Built dynamic rendering functions `fetchResources`, `renderResourceCards`, and `renderResourceTable` in `app.js` to pull live Data from the Supabase `resources` table.
- Removed hardcoded laboratory and classroom HTML entries in the Faculty and Admin pages, replacing them with empty containers that are automatically populated by JS on page load.
- Excluded Equipment inventory from this phase as the database seed only models Labs and Classrooms currently.

**Files Changed:**
- `assets/js/app.js`: Added DB fetching and rendering routines, bound to specific routes on `DOMContentLoaded`.
- `faculty/resources.html`: Replaced hardcoded cards with dynamic `#resourceCardsContainer`.
- `admin/labs.html`: Replaced hardcoded table rows with dynamic `#labsTableBody`.
- `admin/classrooms.html`: Replaced hardcoded table rows with dynamic `#classroomsTableBody`.

**KPIs / Concepts Demonstrated:**
- **KPI:** Dynamic Data Retrieval from a central database.
- **DBMS:** Simple `SELECT` queries across tables and rendering rows into the UI asynchronously.
- **Web Technology:** DOM manipulation using native Vanilla JavaScript based on asynchronous network responses.

## Phase 3 — Atomic Booking Core
**Implemented:**
- Bound the Resource Booking form (`faculty/booking.html`) to live database operations.
- Dynamically populates the "Resource" dropdown with available resources fetched directly from the database.
- Engineered an atomic conflict-checking system that queries PostgreSQL for overlapping `APPROVED` or `PENDING` bookings for the specific resource and timeslot.
- Inserts new bookings with a default `PENDING` status, mapping the logged-in user via `localStorage`.

**Files Changed:**
- `assets/js/app.js`: Added `populateBookingForm()` and `handleBookingSubmit()` logic to manage form state and Supabase queries.
- `faculty/booking.html`: Assigned unique HTML IDs to inputs, removed hardcoded placeholder options, and added a Headcount field.

**KPIs / Concepts Demonstrated:**
- **KPI:** Safe Atomic Insertions & Overlap Prevention.
- **DBMS:** Advanced `SELECT` with multiple condition operators (`neq`, `lt`, `gt`) to resolve time range overlaps before executing `INSERT`.
- **Web Technology:** Handling form submission lifecycles, extracting data via the DOM, and preventing default synchronous requests in favor of async Database transactions.

## Phase 4 — Booking Approval Workflow (Assistant/Admin)
**Implemented:**
- Configured dynamic rendering of pending booking requests on the Lab Assistant's Requests page (`assistant/requests.html`).
- Integrated a SQL join equivalent in Supabase by querying `bookings` and selecting related data from `resources` (room_code) and `users` (faculty name) to populate the requests table.
- Added interactive "Approve" and "Reject" buttons that trigger atomic database updates on the `bookings` table.
- Mapped the current user as the approver (`approved_by`) and captured the exact `decided_at` timestamp for auditability.

**Files Changed:**
- `assistant/requests.html`: Replaced mock table rows with an empty `<tbody id="requestsTableBody">` container.
- `assets/js/app.js`: Added `fetchPendingBookings`, `renderPendingBookings`, and `updateBookingStatus` to handle querying and updating the `bookings` table. Bound the render function to the `DOMContentLoaded` event on the requests page.

**KPIs / Concepts Demonstrated:**
- **KPI:** Interactive Admin Workflow & Complex Joins.
- **DBMS:** Retrieving relational data (joins via foreign keys) and executing `UPDATE` queries on specific rows based on user action.
- **Web Technology:** Event delegation, asynchronous UI state updates, and dynamic HTML injection.

## Bug Fixes & Code Audit
**Priority 1: Concurrency / Atomicity (Fixed)**
- **Issue Found:** The client-side booking submission (`handleBookingSubmit`) was susceptible to a race condition. It performed a `.select()` to check for overlaps and then an `.insert()`. If two users submitted at the same time, both would pass the `select` check.
- **Fix Applied:** 
  - Created a database migration (`003_add_booking_constraint.sql`) that adds a strict Postgres `EXCLUDE` constraint using `btree_gist` and `tstzrange` to prevent overlapping bookings at the database level.
  - Refactored `app.js` to rely entirely on a single `.insert()` operation. If a conflict occurs, Postgres rejects it immediately, throwing a `23P01` exclusion violation error, which the frontend gracefully catches.
- **KPI Mapping:** Conflict Prevention: zero double-booking — fixed via `EXCLUDE` constraint.

**Priority 2: Authentication & Role-Based Access (Fixed)**
- **Issue Found:** Passwords were sent and stored in plaintext. Role-based access was vulnerable to spoofing because it only relied on checking the `user_id` stored in `localStorage`, allowing any user to easily impersonate an admin by changing the ID.
- **Fix Applied:**
  - Created a database migration (`004_secure_auth.sql`) that enables the `pgcrypto` extension, hashes all existing passwords with `crypt()`, and adds a `session_token` (UUID) column to the `users` table.
  - Built secure Postgres RPC functions (`authenticate_user`, `validate_session`, `invalidate_session`) to handle login and session validation server-side without exposing password hashes.
  - Refactored `loginUser()`, `enforceAuth()`, and `logout()` in `app.js` and `login.html` to use these RPCs and store a secure, unguessable `session_token` in `localStorage` instead of just `user_id`.
- **KPI Mapping:** Authentication Security — fixed via DB-level password hashing and secure tokenized session management.

**Priority 3: Resource Browsing & Timeslots (Fixed)**
- **Issue Found:** The available timeslots on `timeslots.html` were completely hardcoded and didn't interact with the database. Furthermore, the resource cards in `faculty/resources.html` and admin tables showed a static `status` (e.g. "Available") from the `resources` table, ignoring actual real-time bookings.
- **Fix Applied:**
  - Updated `app.js`'s `renderTimeSlots` to dynamically query the `bookings` table for the selected resource and date. It cross-references current `APPROVED` or `PENDING` bookings against standard predefined slots to render their true availability.
  - Modified `renderResourceCards` and `renderResourceTable` to query the `bookings` table for any bookings where the current time falls within `start_at` and `end_at`. If a resource has an active booking right now, its status dynamically shifts to "Occupied".
  - Upgraded `populateBookingForm` to read `resource_id` and `date` from URL parameters, ensuring a seamless user flow when clicking "Book Selected Slot" from the timeslots page.
- **KPI Mapping:** Dynamic UI & Real-Time Constraints — fixed by querying active database states to update the UI on the fly.

**Priority 4: Booking Core / Validation (Fixed)**
- **Issue Found:** There were zero backend validation checks on the booking insertion. A user could successfully book a small 20-person lab for a 100-person headcount, or provide a start time that occurs *after* the end time. The application blindly inserted whatever the frontend payload sent.
- **Fix Applied:**
  - Created a database migration (`005_booking_validation.sql`) containing a Postgres function (`validate_booking_rules`) and a `BEFORE INSERT OR UPDATE` trigger on the `bookings` table.
  - The trigger explicitly blocks inserts where the `headcount` exceeds the resource's documented `capacity`, throwing a custom `headcount_exceeds_capacity` error. It also asserts that `end_at` is strictly greater than `start_at`.
  - Refactored `handleBookingSubmit` in `app.js` to catch these specific Postgres exceptions and translate them into user-friendly JavaScript alerts.
- **KPI Mapping:** Robust Server-Side Validation — fixed via database-level triggers enforcing business logic constraints.

## Phase 5 — Admin Priority Queue for Approvals
**Implemented:**
- Added a Priority Queue Data Model: Introduced a `priority` integer (1=Normal, 2=High, 3=Critical) to the `bookings` table, and a `requires_approval` boolean flag to the `resources` table.
- Auto-Approval Logic: Resources that do not require approval are inserted as `APPROVED` automatically. Bookings for resources that do require approval are inserted as `PENDING` and routed into the priority queue.
- Re-purposed the `admin/conflicts.html` template into a functional `admin/approvals.html` page, updating sidebar links across the admin dashboard.
- Enforced a secure, Atomic Admin Decision API using a Postgres RPC (`admin_process_request`). This function implements a conditional `UPDATE ... WHERE status = 'PENDING'` that cleanly fails if another admin acts on the request first, preventing concurrent overwrite race conditions.
- Integrated Audit Logs: Every admin decision (Approve/Reject) captures the administrator's ID and mandatory override reason directly via a trigger-like hook inside the same atomic RPC.

**Files Changed:**
- `supabase/migrations/006_priority_queue.sql`: Added schema alterations, the priority sorting RPC (`get_priority_approvals`), and the atomic processing RPC (`admin_process_request`).
- `admin/approvals.html`: Replaced `conflicts.html`, wired up with `fetchPriorityApprovals()` UI rendering.
- `assets/js/app.js`: Added JS logic to present the priority level, invoke the atomic admin RPC, and updated `handleBookingSubmit` to utilize the `requires_approval` status flag.
- `faculty/booking.html`: Added a Priority level dropdown.
- `test_admin_atomic.js`: Automated script validating the atomic concurrency of the RPC.

**KPIs / Concepts Demonstrated:**
- **DSA (Data Structures & Algorithms):** Priority queue implemented natively in SQL (`ORDER BY priority DESC, created_at ASC`), using arrival time as a tie-breaker.
- **DBMS:** Concurrent atomic operation execution utilizing conditional updates (`WHERE status = 'PENDING'`) to enforce database state integrity without locking the whole table.
