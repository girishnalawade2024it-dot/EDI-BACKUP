-- =========================================
-- EDI Project - Backfill resource capacity
--
-- capacity is NULL for every seeded resource, so the portal renders
-- "Flexible" / "TBD" everywhere it shows a room size. Nothing breaks
-- without this -- it is display data only -- but the values below match
-- the rooms as described in their notes.
-- =========================================

UPDATE resources SET capacity = v.capacity
FROM (VALUES
    ('MB 409',   40),
    ('MB 412',   35),
    ('MB 413',   40),
    ('MB 414',   40),
    ('MB 407 A', 30),
    ('MB 407 B', 30),
    ('MB 408 A', 30),
    ('MB 408 B', 30),
    ('AC 301',   60),
    ('AC 304',   60),
    ('AC 401',   75)
) AS v(room_code, capacity)
WHERE resources.room_code = v.room_code
  AND resources.capacity IS NULL;
