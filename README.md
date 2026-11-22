# Lumière — Theater & Cinema Ticket Booking

Coursework project 11. A React client and an Express REST API with PostgreSQL.
The two applications are independent npm packages: no workspaces, root npm package,
shared node_modules or common dependency lockfile.

## Structure

```text
server/                 Independent TypeScript/Express application
  src/controllers/       HTTP request and response handling
  src/services/          Business logic and use cases
  src/repositories/      ORM and PostgreSQL queries
  src/models/            Table mappings and booking model
  src/patterns/          Strategy, State and Observer
  src/routes/            URL registration
  src/middleware/        Validation, roles and request guards
  src/config/            Database configuration and dependency setup
  src/types/             Input and response types
  scripts/               Local database helper
  database/              Versioned SQL migrations and seed data
  package.json
  package-lock.json
client/                Independent React/Vite application
  src/features/          Authentication, catalog, tickets and administration
  src/shared/            Reusable UI and HTTP client
  package.json
  package-lock.json
```

## Start the server

Requires Node.js 22.12+ and PostgreSQL 14+ with btree_gist.
Open a terminal in the repository and run:

```sh
cd server
npm ci
npm run db:local
npm run dev
```

The API listens on http://127.0.0.1:3001. Readiness: /api/ready.
The local helper preserves data in .local at the repository root and writes
server/.env. Existing administrator credentials remain in .local/admin-login.txt.
Use npm run db:stop from server to stop the local database.
For a separately provisioned PostgreSQL database, configure server/.env and use
npm run db:migrate, npm run db:seed and npm run admin:create from server.

## Start the client

Open a second terminal:

```sh
cd client
npm ci
npm run dev
```

Open http://127.0.0.1:5173. Vite forwards /api to the local server.
Install client libraries only inside client and server libraries only inside
server. Each application has its own node_modules and package-lock.json.

## Features

- Server-side title search, type/date filters and date/price sorting.
- Numbered Standard, VIP and Balcony seats; prices per session.
- Customer registration, sign-in/out and personal tickets.
- Atomic reservations of 1–8 seats; cancellation and expiration release inventory.
- Reservations last up to 15 minutes, bounded by the session start.
- Best eligible discount: verified student 10% or a valid promo, without stacking.
- Simulated payment, issued tickets and print view.
- Separate administrator workflow for productions, halls, schedules, promos,
  student status and reports; administrators cannot use customer booking routes.
- Sales by period, session revenue, daily hall occupancy and CSV export.

Payment is a coursework simulation. No money is charged; paid-ticket refunds are
not implemented. Run npm run db:demo from server for additional fictional data.
Fixtures preserve existing records and do not move dates on subsequent runs.

## Architecture and persistence

The server follows Controller → Service → Repository. Routes bind URLs to controller
methods. Controllers validate HTTP input and return responses. Services implement
business rules and call repositories. Repositories use typed Drizzle query builders for reads, writes and reports.
PostgreSQL expressions handle date grouping and case folding; a transaction-scoped
advisory lock remains an explicit database operation. Models describe table
mappings; config connects dependencies. There are no separate domain/application
or ports layers.
Strategy calculates discounts, State controls booking transitions, and Observer
publishes audit events after successful persistence. Audit delivery is in-process.
SQL migrations own database constraints; do not use automatic ORM schema push.

## Verify separately

From server:

```sh
npm run check
npm run build
```

From client:

```sh
npm run check
npm run build
```

The production outputs are server/dist and client/dist. Production hosting
requires API/domain, HTTPS, database and networking configuration; the checked-in
Vite proxy is intended for local development.

## Local files

.env, .local, node_modules, build output and passwords are ignored by Git.
The university report is a separate deliverable.
