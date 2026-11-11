# Lumière API

Express and TypeScript server package with booking domain patterns.

## Requirements and setup

Use Node.js 22.12+ and npm. From `apps/api`:

```sh
npm ci --workspaces=false
npm run check
npm test
npm run build
npm run dev
```

`npm start` runs the compiled server after `npm run build`.
The package can be installed independently of the frontend.

## Configuration

The server binds to `127.0.0.1` and uses port 3001 by default.
Override it with an environment variable:

```sh
PORT=3002 npm run dev
```

`.env.example` documents configuration values. The server does not automatically
load `.env` files. `DATABASE_URL` is reserved for the later PostgreSQL integration.

## Current API

`GET /api/health` returns HTTP 200:

```json
{"status":"ok","service":"lumiere-api","stage":"foundation","database":"not-connected"}
```

Unknown routes return a JSON 404 error. Malformed JSON returns 400, and JSON
request bodies above 32 KB return 413. Internal errors return a generic JSON 500
response. SIGINT and SIGTERM stop the HTTP server gracefully.

The booking domain is implemented and exercised by tests. Authentication,
PostgreSQL persistence and booking HTTP routes are not implemented yet.

## Files

- `src/app.ts`: Express application, health endpoint and error handling.
- `src/server.ts`: port validation, HTTP listener and shutdown handling.
- `tsconfig.json`: strict TypeScript configuration.

## Discount strategies

`src/domain/pricing.ts` implements the Strategy pattern through the
`DiscountStrategy` interface and `NoDiscount`, `StudentDiscount` and `PromoDiscount`.
`PricingService` chooses the largest eligible discount without stacking discounts.
Prices are integer kopecks; discounts are rounded per seat. Promotion validity
uses an inclusive start and exclusive end. Student eligibility and promotion
data must come from trusted server-side data when HTTP integration is added.

New strategies can be injected into `PricingService` without changing its
selection algorithm. The returned price breakdown is immutable.
`test/pricing.test.ts` covers eligibility, rounding, promotion boundaries,
validation, extension strategies, zero prices and full discounts.

## Booking lifecycle and events

- `src/domain/booking.ts`: immutable booking aggregate, validated seat selections
  and fixed price snapshots.
- `src/domain/booking-state.ts`: State pattern for PENDING, PAID, CANCELLED and
  EXPIRED. Reservations expire after 15 minutes or at the session start.
- `src/application/booking-events.ts`: Observer publisher and audit subscriber.
- `src/application/booking-service.ts`: coordinates pricing, state transitions,
  persistence and event delivery.
- `test/patterns.test.ts`: lifecycle tests and combined Strategy/State/Observer
  scenarios.

`BookingService` requires a `BookingRepository`. A future PostgreSQL adapter must
atomically reserve/release seat inventory, issue tickets on payment and reject
stale updates. The test adapter checks stale updates but is not a production
inventory repository. Prices and eligibility must come from trusted server data.

A transition produces a new booking. Failed persistence leaves the original
unchanged and emits no event. Events are published after successful persistence.
Subscriber errors are returned in `observerFailures`; callers must inspect them.
These errors do not turn a saved change into a failed operation. Delivery is
in-process; durable delivery and an expiration scheduler are future integration
work. Expiration currently runs through the explicit `expire` service method.
