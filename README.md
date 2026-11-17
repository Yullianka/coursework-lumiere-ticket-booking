# Lumiere Theater and Cinema Ticket Booking

The client and server are independent npm packages with their own lockfiles.
Run npm ci in each directory. From server run npm run db:local and npm run dev.
From client run npm run dev in another terminal. Open http://127.0.0.1:5173.
Database migrations are under server/database. Local database data and credentials
remain under the ignored .local directory at the repository root.
