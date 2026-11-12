# PostgreSQL setup

Requires PostgreSQL 14+ with the `btree_gist` extension available and Node.js 22.12+.
The initial schema has been tested on PostgreSQL 14.18.

For the bundled macOS/Linux helper, run `npm run db:local` from the root.
For a separately managed PostgreSQL instance, use the steps below.

## Create a development database

Start your local PostgreSQL server. Using a PostgreSQL administrator account, run:

```sh
createuser --pwprompt lumiere_app
createdb --owner=lumiere_app lumiere
```

The migration account needs permission to create tables and the `btree_gist`
extension in this dedicated database. If an administrator preinstalls the
extension, migrations can use an appropriately privileged application account.

From `apps/api`:

```sh
npm ci --workspaces=false
cp .env.example .env
# Edit DATABASE_URL in .env with your local connection details.
npm run db:check
npm run db:migrate
npm run db:seed
npm run dev
```

Do not commit `.env`. Commands load it from the API package directory; existing
shell environment variables take precedence. `db:seed` is optional and explicit.

## Migration behavior

`001_initial.sql` creates users, productions, halls, seats, sessions,
session_prices, discounts, bookings, session_seats, booking_items and tickets.
`schema_migrations` tracks filenames, SHA-256 checksums and application times.

Run migrations through `db:migrate`, not directly through `psql`: the runner
owns transactions. Concurrent migration calls use a PostgreSQL advisory lock.
All pending migrations run in one transaction; errors roll back DDL and tracking
rows. Repeat runs skip applied migrations. Applied files must not be edited:
add the next numbered migration instead. Missing, altered or out-of-order
migration files are rejected.

## Demo catalog

`seed.sql` adds one hall, 48 seats, two fictional productions, two future sessions,
six category prices and 96 session-seat inventory rows. There are 24 Standard,
8 VIP and 16 Balcony seats. Prices are 180, 300 and 120 UAH respectively.
Sessions are initially scheduled seven/eight days ahead at 18:00 Europe/Kyiv.

Stable identifiers make repeat runs safe. Existing rows, edits, times and
reservations are preserved. Existing sessions are not moved forward on later
seed runs. No user accounts, passwords or sales are seeded.

## Integrity and booking integration

Foreign keys tie session seats to the correct hall, category, session and booking.
Unique constraints prevent duplicate seat numbers and tickets for one booking
item. Checks reject invalid amounts and inconsistent price breakdowns. An
exclusion constraint prevents overlapping sessions in one hall; adjacent
half-open intervals are allowed. Historical records have no cascading deletes.

`PostgresBookingRepository` commits booking state, inventory and ticket issuance
atomically. A common transaction advisory lock serializes venue writes; stale
status changes and occupied seats are rejected. The expiration worker and booking
endpoints release expired reservations through the same domain/service flow.

`002_auth_and_audit.sql` adds hashed server-side authentication sessions, an
immutable discount label on booking items, and the booking event audit table.
The audit observer writes after the booking transaction has committed.

## Database integration tests

Use a **fresh, empty, disposable database** whose name ends in `_test`:

```sh
createdb --owner=lumiere_app lumiere_schema_test
# Set TEST_DATABASE_URL in apps/api/.env to this database.
cd apps/api
npm run test:db
```

The tests refuse a nonempty public schema and never erase data. Each new run
needs a new empty test database (for example `lumiere_second_test`). Tests cover
migration locking/idempotency, seed preservation, constraints, transaction/DDL
rollback, migration checksums and HTTP readiness against PostgreSQL.
