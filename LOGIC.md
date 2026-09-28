# LOGIC.md — Backend Logic Reference

This file explains every piece of logic in the Python backend (`backend/`) and the
concept behind it: DSA, OS, DBMS and software design. It follows the
*Functional Design & Business Logic* document in `docs/`.

**New module added:** `backend/services/booking_logic.py`, with its routes in
`backend/api/logic.py` under `/api/logic`. The frontend was not changed.

---

## 1. Module Map

| File | What it does |
|---|---|
| `backend/main.py` | FastAPI app. Registers the routers and serves the frontend as static files |
| `backend/database/connection.py` | SQLite connection, WAL mode, transactions |
| `backend/services/concurrency.py` | Advisory mutex (lock) for each resource and date |
| `backend/services/booking_service.py` | Create a booking, recurring bookings, cancel, suggest alternatives |
| `backend/services/approval_service.py` | Admin approve / deny / preempt |
| `backend/services/notification_service.py` | Create and read notifications |
| `backend/services/audit_service.py` | Append-only audit log |
| `backend/services/report_service.py` | Utilisation, peak load, conflicts, turnaround time (TAT) reports |
| **`backend/services/booking_logic.py`** | **New:** interval overlap, priority queue, notification queue, modify, auto-release, availability |

### New endpoints (`/api/logic`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/logic/availability/{resource_id}?date=YYYY-MM-DD` | Slots for the day, each marked Available / Booked / Break |
| GET | `/api/logic/approval-queue` | Pending requests in priority order |
| POST | `/api/logic/bookings/{id}/modify` | Change a booking's resource, date or slot safely |
| POST | `/api/logic/expire` | Run the auto-release rule |
| POST | `/api/logic/notifications/process` | Deliver and retry queued notifications |

---

## 2. Overall Booking Flow

1. Faculty picks a date. The system shows resources.
2. Faculty picks a resource. The system shows its free slots (`get_day_availability`).
3. Faculty picks a slot and enters the purpose.
4. The server checks authorization, capacity and resource rules.
5. The booking is attempted in **one atomic transaction**.
6. If the slot is still free, the booking is created. If not, the request fails as a conflict and alternatives are suggested.
7. A request that needs approval goes into the **priority queue**.
8. Changes are written to the audit log, and users get notifications. The database is the source of truth.

What the screen shows while browsing is only a hint. The final database transaction decides whether a booking succeeds.

---

## 3. Operating System Concepts

| Concept | Where | How |
|---|---|---|
| **Critical Section** | `submit_booking`, `modify_booking` | The code that reads and writes `booking_schedule` runs while a lock is held, inside a transaction |
| **Mutex / Locking** | `concurrency.py` → `AdvisoryMutex` | One `threading.Lock` per `(resource_id, date)` key. Only one thread can book the same room on the same day at once |
| **Bounded waiting / Deadlock prevention** | `AdvisoryMutex(timeout=5s)` | `lock.acquire(timeout=...)` gives up after 5 seconds instead of waiting forever. `__exit__` always releases the lock, even on error, so no lock is left held |
| **Synchronization** | `_registry_lock` | A global lock protects the dictionary of per-key locks while it is being built |
| **Fine-grained locking** | Lock key = room + date | Different rooms, or different days, never block each other |
| **Atomicity** | `transaction()` uses `BEGIN IMMEDIATE … COMMIT / ROLLBACK` | Every step succeeds, or none of them do. A failed booking never leaves a half-made row |
| **Concurrency control** | SQLite WAL mode + `busy_timeout` | Readers don't block writers. Writers wait a bounded time |
| **FCFS scheduling** | Whichever transaction commits first | The first request to take the slot wins. Server/database order is used, never the client's clock |

The lock only coordinates requests. What actually guarantees no double booking is the database constraint (section 5).

---

## 4. Data Structures & Algorithms

| DS / Algorithm | Where | Why |
|---|---|---|
| **Priority Queue (min-heap, `heapq`)** | `ApprovalPriorityQueue` | Admin review order is `(priority_rank, requested_at, booking_id)`. The lowest rank comes out first, and request time breaks ties. Push and pop are O(log n) |
| **FIFO Queue (`collections.deque`)** | `process_notification_queue` | Notifications are delivered oldest first. `popleft()` is O(1) |
| **Retry with a limit** | Notification queue | A `FAILED` notification is retried, up to `MAX_NOTIFICATION_RETRIES = 3` |
| **Hash Set** | `get_day_availability` → `taken` set | O(1) check of whether each slot is booked |
| **Hash Map (dict)** | `_mutexes` registry in `concurrency.py` | O(1) lookup of the lock for a `(resource, date)` key |
| **Half-open interval overlap** | `intervals_overlap()` | `[a_start, a_end)` and `[b_start, b_end)` overlap when `a_start < b_end and b_start < a_end`. So 9–10 and 10–11 do not clash |
| **Buffer / turnaround time** | `intervals_overlap(..., buffer_minutes)` | Cleanup time is added to the end of each interval |
| **Range scan** | `slot_id BETWEEN start AND end` | Slots are numbered in order, so a range of slots is a contiguous interval |
| **Linear search with filtering** | `suggest_alternatives` | Filter rooms by type, `ACTIVE` status and capacity at least the headcount, then keep only rooms whose slots are all free |
| **Date iteration / generation** | `submit_recurring_booking` | Builds each date (DAILY / WEEKLY) and books each one separately. A conflict skips that date only |
| **Sorting** | `ApprovalPriorityQueue.ordered()`, SQL `ORDER BY` | Listing the queue, and producing reports |
| **Aggregation (group by / count / sum)** | `report_service.py` | Utilisation %, peak hours, conflict counts, approval TAT |
| **Random ID generation** | `generate_booking_reference()` | Human-readable reference such as `BK2026-123456` |

---

## 5. Database (DBMS) Concepts

| Concept | Where |
|---|---|
| **Transactions (ACID)** | `transaction()` in `connection.py` |
| **Unique constraint as the final guard** | `uq_schedule_slot_lock ON booking_schedule(resource_id, schedule_date, slot_id, lock_flag)`. `lock_flag` is 1 only while the row is `ACTIVE`, so two active bookings can't hold the same slot. A released row has `lock_flag = NULL`, which lets the slot be booked again |
| **Generated column** | `lock_flag` is computed from `occupancy_state` |
| **Occupancy ledger** | `booking_schedule` has one row per booked slot, which makes conflict checks simple |
| **Indexes** | `idx_bookings_resource_date`, `idx_bookings_user`, `idx_bookings_status_pending`, `idx_schedule_lookup` speed up availability, history and pending-queue queries |
| **Foreign keys** | Every table is linked, with `PRAGMA foreign_keys = ON` |
| **Append-only audit** | Triggers on `audit_logs` block UPDATE and DELETE |
| **Status history** | `booking_status_history` records every status change |
| **Normalization** | Separate tables for roles, users, resources, labs, classrooms, slots, bookings, schedule, approvals, notifications and audit |

---

## 6. Business Rules

### 6.1 Validation before booking (`submit_booking`)
- The end slot must not come before the start slot. A booking can be at most 4 slots (4 hours).
- No dates in the past. The date must be within the role's `max_advance_days`.
- The user must be active. The resource must be `ACTIVE`.
- `expected_headcount` must not exceed the room's `capacity`.
- No break slots and no inactive slots.

### 6.2 Conflict handling
- The slot is held by an **APPROVED** booking → hard conflict. The request is rejected with `SLOT_TAKEN`, the conflict is logged, and **alternatives** are returned.
- The slot is held by a **PENDING** booking → the new request becomes PENDING too, and the admin decides through the priority queue.
- The unique index is hit (a race) → `IntegrityError`, so ROLLBACK, and the user sees a normal conflict message.
- There is **no** "simultaneous booking" threshold. Near-simultaneous requests are not sent to the admin; the database order decides.

### 6.3 Auto-approval vs admin approval
- A role with `is_auto_approved = 1` (Faculty) gets **APPROVED** immediately.
- Other roles go in as **PENDING**, the admins are notified, and the request enters the **priority queue**.
- The system does not judge which purpose matters more. The admin sees the name, purpose, room, date, time, capacity and priority, and decides.

### 6.4 Concurrent admin actions (`approval_service.py`)
- A status update only applies while the booking is still `PENDING`. If a second admin acts on a request already decided, they are told it has already been processed and nothing is overwritten.
- Approve, deny and preempt are audited. A preempt or override records its reason.

### 6.5 Cancellation (`cancel_booking`)
- Only the owner or an admin can cancel.
- Only PENDING or APPROVED bookings can be cancelled. An APPROVED booking must be cancelled at least **2 hours** before it starts (admins are exempt).
- The status becomes CANCELLED, the slots are **RELEASED**, and the change goes to history, the audit log and a notification.

### 6.6 Modification (`modify_booking`, new)
- Runs the same checks as a new booking: ownership, status, resource active, capacity, slot validity and conflicts. The booking's own current slots are not counted as a conflict.
- Everything happens in one transaction under the mutex. **If any step fails, the original booking stays unchanged** because of ROLLBACK.
- Audit log: the old and new values are both stored.

### 6.7 Auto-release (`expire_stale_bookings`, new)
There is no attendance data, so the system does **not** claim to detect physical no-shows. The rule is explicit:
- A **PENDING** booking whose start time has passed becomes **EXPIRED** (no one decided in time).
- An **APPROVED** booking whose end time has passed becomes **COMPLETED**.
- Both release their slots and are audited. The rule runs when `POST /api/logic/expire` is called; it does not run by itself.

### 6.8 Recurring bookings
- Pattern (DAILY / WEEKLY), start date, end date, slot and resource.
- Each date is validated and booked **on its own**. A clash on one date never overwrites an existing booking.
- The response lists which dates succeeded and which failed.

### 6.9 Alternative resources
- Same type, `ACTIVE`, capacity at least the headcount, and every requested slot free.
- An alternative is **not reserved**. Choosing one runs the full atomic booking again.

### 6.10 Notifications
- They are informational only. The booking status in the database is the truth.
- Statuses: PENDING / SENT / FAILED / READ. FAILED ones are retried through the FIFO queue.
- A notification never holds a resource.

---

## 7. Other Techniques Used

| Technique | Where |
|---|---|
| REST API design | FastAPI routers in `backend/api/` |
| Request validation | Pydantic models (`ModifyRequest`, `BookingSubmitRequest`, …) |
| Context managers (`with`) | `get_db()`, `transaction()`, `AdvisoryMutex` guarantee cleanup |
| Separation of concerns | `api/` handles HTTP, `services/` holds the logic, `database/` handles storage |
| Role-based access control | Roles with `priority_rank`, `can_approve`, `is_auto_approved`, `can_preempt` |
| Session-based auth | `user_sessions` table with an expiry time |
| CORS | `CORSMiddleware` in `main.py` |
