-- Explicit demo data. Stable IDs and DO NOTHING preserve existing edits/reservations.
-- No accounts or default passwords are created.
INSERT INTO halls (id, name) VALUES ('10000000-0000-4000-8000-000000000001', 'Lumiere Main Hall') ON CONFLICT (id) DO NOTHING;

INSERT INTO seats (id, hall_id, row_number, seat_number, category)
SELECT ('20000000-0000-4000-8000-' || lpad(((r-1)*8+n)::text,12,'0'))::uuid,
 '10000000-0000-4000-8000-000000000001', r, n,
 CASE WHEN r <= 3 THEN 'STANDARD' WHEN r = 4 THEN 'VIP' ELSE 'BALCONY' END
FROM generate_series(1,6) r CROSS JOIN generate_series(1,8) n
ON CONFLICT (id) DO NOTHING;

INSERT INTO productions (id, title, description, type, duration_minutes) VALUES
 ('30000000-0000-4000-8000-000000000001', 'Beyond the Horizon', 'Demo film for the coursework catalog.', 'FILM', 120),
 ('30000000-0000-4000-8000-000000000002', 'An Evening on Stage', 'Demo theater performance for the coursework catalog.', 'PLAY', 90)
ON CONFLICT (id) DO NOTHING;

WITH schedule AS (
 SELECT (date_trunc('day', now() AT TIME ZONE 'Europe/Kyiv') + interval '7 days 18 hours') AT TIME ZONE 'Europe/Kyiv' AS start_time
)
INSERT INTO sessions (id, production_id, hall_id, starts_at, ends_at)
SELECT '40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
 '10000000-0000-4000-8000-000000000001', start_time, start_time + interval '120 minutes' FROM schedule
ON CONFLICT (id) DO NOTHING;
WITH schedule AS (
 SELECT (date_trunc('day', now() AT TIME ZONE 'Europe/Kyiv') + interval '8 days 18 hours') AT TIME ZONE 'Europe/Kyiv' AS start_time
)
INSERT INTO sessions (id, production_id, hall_id, starts_at, ends_at)
SELECT '40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002',
 '10000000-0000-4000-8000-000000000001', start_time, start_time + interval '90 minutes' FROM schedule
ON CONFLICT (id) DO NOTHING;

INSERT INTO session_prices (session_id, category, price_kopecks)
SELECT session_id, category, price
FROM (VALUES ('40000000-0000-4000-8000-000000000001'::uuid), ('40000000-0000-4000-8000-000000000002'::uuid)) AS sessions(session_id)
CROSS JOIN (VALUES ('STANDARD',18000), ('VIP',30000), ('BALCONY',12000)) AS prices(category,price)
ON CONFLICT (session_id,category) DO NOTHING;

INSERT INTO session_seats (session_id,seat_id,hall_id,category)
SELECT sessions.id,seats.id,seats.hall_id,seats.category FROM sessions
JOIN seats ON seats.hall_id = sessions.hall_id
WHERE sessions.id IN ('40000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000002')
ON CONFLICT (session_id,seat_id) DO NOTHING;
