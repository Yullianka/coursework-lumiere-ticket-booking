# Lumière — Theater & Cinema Ticket Booking

Coursework project 11: a working React web application and REST API backed by PostgreSQL.
The interface is Ukrainian; source documentation and commit messages are English.

## Run locally

Requirements: Node.js 22.12+, npm and PostgreSQL 14+ with `btree_gist`.

```sh
npm ci
npm run db:local
npm run dev
```

Open **http://127.0.0.1:5173**. The API runs at http://127.0.0.1:3001/api/health.

`db:local` is a macOS/Linux development helper. It finds PostgreSQL on PATH or
in `/opt/homebrew/bin`; set `PG_BIN` for another installation. It creates an
isolated cluster in `.local/postgres`, listening only on a local Unix socket,
starts it on port 55440, applies migrations, seeds two events and creates a
local administrator. It preserves existing data on repeat runs.

The generated administrator login is in **`.local/admin-login.txt`**.
The database and credentials are ignored by Git. Register through the web UI
for a normal customer account. Stop the local database with `npm run db:stop`.
After restarting your laptop, run `npm run db:local` before `npm run dev`.

For Windows, an existing PostgreSQL server or a custom database, follow
[database setup](database/README.md), configure `apps/api/.env`, and run:

```sh
npm run db:migrate -w apps/api
npm run db:seed -w apps/api
npm run admin:create -w apps/api
npm run dev
```

For `admin:create`, supply `ADMIN_EMAIL`, `ADMIN_PASSWORD` (at least 12 characters)
and optionally `ADMIN_NAME` in the shell or untracked `apps/api/.env`. Existing
users are never overwritten or silently promoted. Remove the bootstrap password
from your shell/environment after use. There are no committed default passwords.

## Features

- Film/play catalog with title, description, duration, hall and session time;
  search, type and date filters.
- Numbered seating plans, Standard/VIP/Balcony prices and live availability refresh.
- Registration, sign-in/out and server-enforced customer/admin permissions.
- Atomic reservation of 1–8 seats; conflicting requests return HTTP 409.
- Cancellation and automatic expiry after 15 minutes (or the session start).
- One best discount: administrator-confirmed student status (10%) or a valid promo.
- Simulated payment, persistent tickets and a print-friendly ticket view.
- Administration of productions, halls, schedules, prices, promotions and student status.
- Ticket sales by period, session revenue and daily hall occupancy, with CSV export.

**Payment is a coursework simulation. No card details are collected and no money
is charged. Paid-ticket refunds and real payment-provider integration are out of scope.**

## Architecture and design patterns

A layered monolith separates the React UI, Express HTTP controllers, application
services, domain rules and PostgreSQL adapters. Money is stored as integer kopecks;
seat prices and eligibility are resolved by the server. Session times are displayed
in Europe/Kyiv. Admin date inputs explicitly use the device timezone.

| Pattern / principle | Implementation |
|---|---|
| GoF Strategy | `domain/pricing.ts`: interchangeable discount strategies; largest eligible discount wins, no stacking. |
| GoF State | `domain/booking-state.ts`: Pending, Paid, Cancelled and Expired states govern allowed transitions. |
| GoF Observer | `application/booking-events.ts`: publishes events after successful persistence; database audit subscriber. |
| GRASP Controller | `BookingService` coordinates pricing, persistence and event publication. |
| Information Expert | `Booking` owns its immutable price snapshot and lifecycle. |
| SOLID / dependency inversion | Domain depends on contracts; PostgreSQL implements `BookingRepository`; strategies and observers are replaceable. |

The PostgreSQL adapter uses one transaction lock for venue inventory/schedule
writes plus status checks. This intentionally simple approach serializes writes
for a small venue and prevents overselling. It is not designed for high-volume
multi-venue traffic. The expiry worker runs every 10 seconds; availability and
booking endpoints also sweep expired reservations. Client prices are never trusted.

Audit observers run after commit. A failed observer is logged without reporting a
successfully persisted booking as failed. Audit delivery is in-process, not a
durable message queue. Authentication uses scrypt password hashes and random
server-side sessions; the database stores only hashes of session tokens.

## Coursework artifacts

- [1. Domain analysis and use cases](docs/requirements.md)
- [Use case diagram (PNG)](docs/images/use-cases.png)
- [Class diagram (PNG)](docs/images/class-diagram.png)
- [REST API reference](apps/api/README.md)
- [Database schema, migrations and constraints](database/README.md)

The class diagram is a domain-level design, not a listing of every UI component
or infrastructure helper. The written university report and defense slides are
separate deliverables; the repository supplies the application and design artifacts.

## Validation

```sh
npm run check              # TypeScript, including test sources
npm test                   # Pricing, lifecycle, Observer and readiness tests
npm run test:integration   # PostgreSQL constraints and end-to-end HTTP workflows
npm run build              # Compile API and build browser assets
```

The integration runner requires `DATABASE_URL` and permission to create databases.
It creates uniquely named disposable databases and removes only those it created;
it never resets the application database. To use a database provisioned by someone
else, run the API's `test:db` and `test:http` scripts separately, each with its own
fresh empty `TEST_DATABASE_URL` ending in `_test`.

Integration coverage includes simultaneous reservation attempts, ownership checks,
admin authorization, password verification, origin checks, discounts, idempotent
payment, expiry, seat release, hall changes, overlapping schedules and reports.
Manual browser checks cover booking → demo payment → issued ticket → report, plus
narrow-screen seating layout. A sample demo sale may be present in the local database.

To preview compiled output, run `npm start -w apps/api` and
`npm run preview -w apps/web` after building. Preview uses port 4173; the API must
remain running. No deployment is required for the coursework demonstration.

## Demo walkthrough

1. Sign in as the local administrator; inspect the seeded events and seat prices.
2. Create a promo code in **Керування → Промокоди** if a discount demonstration is needed.
3. Register a customer, choose a session and reserve seats. Confirm student status
   from **Керування → Клієнти** when demonstrating the 10% student discount.
4. Inspect the final amount in **Мої квитки**; cancel one reservation and confirm
   the seats become available again. Complete demo payment for another reservation.
5. Open **Керування → Звіти**, include both payment and session dates in the range,
   and verify ticket count, revenue and occupancy. Download CSV if needed.

Seed sessions are initially seven/eight days ahead. Re-seeding preserves their
original times and any sales; add new future sessions through the admin UI later.

## Repository workflow

Changes are committed directly to `main`; pull requests and deployment are optional.
Keep `.env`, `.local`, dependencies and build output out of Git. Source changes,
SQL migrations, diagrams and tests belong in the repository.
