# Lumière API

Initial Express and TypeScript server package.

## Requirements and setup

Use Node.js 22.12+ and npm. From `apps/api`:

```sh
npm ci --workspaces=false
npm run check
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

This PR provides only the server foundation. Booking domain logic, authentication,
database persistence and booking routes will be added in subsequent changes.

## Files

- `src/app.ts`: Express application, health endpoint and error handling.
- `src/server.ts`: port validation, HTTP listener and shutdown handling.
- `tsconfig.json`: strict TypeScript configuration.
