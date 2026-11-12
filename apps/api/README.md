# Lumière REST API

Express 5 + TypeScript + PostgreSQL. Run from the repository root with
`npm run dev -w apps/api`. Configuration is loaded from `apps/api/.env`.
See the root README for full setup, administrator bootstrap and verification.

## Contract

All paths below start with `/api`. Request bodies are JSON, limited to 32 KB.
Dates are ISO 8601 strings with timezone offsets; amounts are integer kopecks.
Errors use `{ "error": { "code": "...", "message": "..." } }`.
Validation errors include field details. Expected responses include 400 (validation),
401 (sign-in required), 403 (not allowed), 404, 409 (conflict), 413, 415 and 429.

Authentication uses an HttpOnly, SameSite=Strict cookie. Cookies are Secure under
`NODE_ENV=production`; production requires HTTPS and an explicit `APP_ORIGIN`.
Local allowed origins include localhost/127.0.0.1 on ports 3001, 5173 and 4173.
Mutations reject unapproved browser origins and non-JSON content types.
Auth routes are rate-limited to 60 requests per 15 minutes per IP.

| Method | Path | Access / behavior |
|---|---|---|
| GET | `/health` | Process liveness. |
| GET | `/ready` | Database connectivity; 503 if unavailable. Does not check migration state. |
| POST | `/auth/register` | `email`, `password` (8–128 chars), `displayName`; creates CLIENT and signs in. |
| POST | `/auth/login` | `email`, `password`; sets session cookie. |
| GET | `/auth/me` | `{user}` or `{user:null}`. |
| POST | `/auth/logout` | `{}`; revokes session, clears cookie; 204. |
| GET | `/productions` | Active productions. |
| GET | `/sessions` | Upcoming active sessions with availability and minimum price. |
| GET | `/sessions/:id/seats` | `{session,seats}` with row, number, category, price and status. |
| POST | `/bookings` | Customer: `sessionId`, `seatIds` (1–8 unique IDs), optional `promoCode`. |
| GET | `/bookings/mine` | Customer's bookings with prices, seat labels and ticket IDs. |
| POST | `/bookings/:id/pay` | Owner only; `{}`; simulated payment, no external charge. |
| POST | `/bookings/:id/cancel` | Owner only; `{}`; releases unpaid reservation. |
| GET/POST | `/admin/productions` | Admin: list/create productions. |
| PATCH | `/admin/productions/:id` | Admin: edit production or hide from catalog. |
| GET/POST | `/admin/halls` | Admin: list/create hall and numbered seats. |
| PATCH | `/admin/halls/:id` | Admin: rename hall; established seat maps remain fixed. |
| GET/POST | `/admin/sessions` | Admin: list/create schedule and prices. |
| PATCH | `/admin/sessions/:id` | Admin: edit only sessions without booking history. |
| GET/POST | `/admin/discounts` | Admin: list/create promo codes. |
| PATCH | `/admin/discounts/:id` | Admin: edit promo code. |
| GET | `/admin/users` | Admin: account details without password/session hashes. |
| PATCH | `/admin/users/:id` | Admin: `{studentVerified:boolean}`. |
| GET | `/admin/reports?from=...&to=...` | Admin: sales summary, session revenue and hall/day occupancy. |

Catalog lists are limited to 200 records; the admin session/user lists to 300 and
personal booking history to 200. This bounds the coursework UI; pagination is a
future enhancement for larger catalogs.

## Administrative payloads

Production: `{title, description, type: "FILM"|"PLAY", durationMinutes, archived?}`.
Hall: `{name, rows, seatsPerRow, vipRows?:number[], balconyRows?:number[]}`.
Rows are 1-based, at most 20 rows and 30 seats per row. Categories must not overlap.
Rename: `{name}`.

Session: `{productionId, hallId, startsAt, prices:{STANDARD,VIP,BALCONY}, archived?}`.
All three category prices are required. End time derives from production duration.
Changing a production's duration affects newly saved sessions, not existing ones.
The database rejects overlapping schedules. Sessions with history cannot be edited.

Promotion: `{code, percent, validFrom, validTo, active?}`. Codes are 3–32 ASCII
letters/digits/underscores/hyphens, normalized to uppercase. Admin edit forms submit
all fields of the relevant record; omitted optional flags use their schema defaults.
There are no hard-delete endpoints and no paid-ticket refund flow.

## Consistency

A booking transitions PENDING → PAID / CANCELLED / EXPIRED. Repeating an already
completed identical action is idempotent. Conflicting concurrent updates return
409. Expiration is bounded by session start. Prices are immutable snapshots, so
later promotion or eligibility edits never change an existing booking's amount.

Inventory, booking records and ticket issuance update in one transaction.
Strategy, State and Observer cooperate through `BookingService`; PostgreSQL
implements its repository contract. Events are delivered after commit to the
booking audit observer. Subscriber failure is logged separately from the saved action.

Reports use half-open `[from,to)` periods, at most 366 days. Revenue uses payment
dates and PAID bookings. Occupancy uses session dates grouped by Europe/Kyiv day,
with sold and reserved counts separate. Occupancy = sold / total session capacity.
The frontend can export the report to CSV and print issued tickets.

## Tests

`npm test` in this package runs the domain and readiness suite without a database.
`npm run test:db` and `npm run test:http` each require a separate fresh empty
`TEST_DATABASE_URL` ending in `_test`. The root `npm run test:integration` provisions
and cleans up those disposable databases automatically.
