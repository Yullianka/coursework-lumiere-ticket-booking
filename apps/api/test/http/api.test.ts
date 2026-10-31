import test from 'node:test';
import assert from 'node:assert/strict';
import { createDatabasePool } from '../../src/infrastructure/database.js';
import { migrate, seed } from '../../src/infrastructure/migrations.js';
import { createApp } from '../../src/app.js';
const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test'))
  throw new Error('Use an empty dedicated database ending in _test.');
test('HTTP workflows with PostgreSQL', async (t) => {
  const pool = createDatabasePool(url);
  assert.equal((await pool.query("SELECT 1 FROM pg_tables WHERE schemaname='public'")).rowCount, 0);
  await migrate(pool);
  await seed(pool);
  const server = createApp(async () => {
    await pool.query('SELECT 1');
  }, pool).listen(0, '127.0.0.1');
  await new Promise<void>((r) => server.once('listening', r));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}/api`;
  async function request(path: string, method = 'GET', body?: unknown, cookie = '') {
    const response = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return {
      status: response.status,
      data: response.status === 204 ? null : await response.json(),
      cookie: response.headers.get('set-cookie')?.split(';')[0] ?? '',
    };
  }
  try {
    const a = await request('/auth/register', 'POST', {
      email: 'alice@example.test',
      password: 'correct-horse-123',
      displayName: 'Alice',
    });
    const b = await request('/auth/register', 'POST', {
      email: 'bob@example.test',
      password: 'correct-horse-456',
      displayName: 'Bob',
    });
    assert.equal(a.status, 201);
    assert.equal(b.status, 201);
    await pool.query("UPDATE users SET role='ADMIN',student_verified=true WHERE id=$1", [
      a.data.id,
    ]);
    await t.test('auth, ownership, role and origin restrictions', async () => {
      assert.equal(
        (
          await request('/auth/login', 'POST', {
            email: 'alice@example.test',
            password: 'incorrect-password',
          })
        ).status,
        401,
      );
      assert.equal(
        (
          await request('/auth/login', 'POST', {
            email: 'alice@example.test',
            password: 'correct-horse-123',
          })
        ).status,
        200,
      );
      assert.equal((await request('/admin/users')).status, 401);
      assert.equal((await request('/admin/users', 'GET', undefined, b.cookie)).status, 403);
      const attack = await fetch(base + '/auth/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          origin: 'https://attacker.example',
          cookie: a.cookie,
        },
        body: '{}',
      });
      assert.equal(attack.status, 403);
      const stored = (await pool.query('SELECT password_hash FROM users WHERE id=$1', [a.data.id]))
        .rows[0];
      assert.notEqual(stored.password_hash, 'correct-horse-123');
      assert.equal(
        (await request('/auth/me', 'GET', undefined, a.cookie)).data.user.student_verified,
        true,
      );
    });
    const session = (await request('/sessions')).data[0];
    const seats = (await request(`/sessions/${session.id}/seats`)).data.seats;
    const reserve = (cookie: string, seatId: string, promoCode?: string) =>
      request('/bookings', 'POST', { sessionId: session.id, seatIds: [seatId], promoCode }, cookie);
    await t.test('concurrent customers cannot reserve the same seat', async () => {
      const results = await Promise.all([
        reserve(a.cookie, seats[0].id),
        reserve(b.cookie, seats[0].id),
      ]);
      assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
      const win = results.findIndex((r) => r.status === 201),
        booking = results[win].data,
        owner = win === 0 ? a : b,
        other = win === 0 ? b : a;
      assert.equal(
        (await request(`/bookings/${booking.id}/cancel`, 'POST', {}, other.cookie)).status,
        403,
      );
      assert.equal(
        (await request(`/bookings/${booking.id}/cancel`, 'POST', {}, owner.cookie)).status,
        200,
      );
      assert.equal((await reserve(other.cookie, seats[0].id)).status, 201);
    });
    await t.test('best discount, idempotent sale, immutable paid tickets and reports', async () => {
      const now = Date.now();
      const promo = await request(
        '/admin/discounts',
        'POST',
        {
          code: 'OPEN20',
          percent: 20,
          validFrom: new Date(now - 60000).toISOString(),
          validTo: new Date(now + 86400000).toISOString(),
        },
        a.cookie,
      );
      assert.equal(promo.status, 201);
      const booking = await reserve(a.cookie, seats[1].id, 'OPEN20');
      assert.equal(booking.status, 201);
      assert.equal(booking.data.totalKopecks, Math.round(seats[1].price_kopecks * 0.8));
      assert.equal(booking.data.items[0].discountName, 'PROMO');
      for (let i = 0; i < 2; i++)
        assert.equal(
          (await request(`/bookings/${booking.data.id}/pay`, 'POST', {}, a.cookie)).status,
          200,
        );
      assert.equal(
        (await request(`/bookings/${booking.data.id}/cancel`, 'POST', {}, a.cookie)).status,
        409,
      );
      const mine = (await request('/bookings/mine', 'GET', undefined, a.cookie)).data.find(
        (x: { id: string }) => x.id === booking.data.id,
      );
      assert.ok(mine.items[0].ticketId);
      assert.equal((await pool.query('SELECT * FROM tickets')).rowCount, 1);
      assert.equal(
        (
          await pool.query(
            "SELECT * FROM booking_audit WHERE booking_id=$1 AND event_type='BOOKING_PAID'",
            [booking.data.id],
          )
        ).rowCount,
        1,
      );
      const report = await request(
        `/admin/reports?from=${new Date(now - 86400000).toISOString()}&to=${new Date(now + 14 * 86400000).toISOString()}`,
        'GET',
        undefined,
        a.cookie,
      );
      assert.equal(report.status, 200);
      assert.equal(report.data.summary.tickets, 1);
      assert.equal(Number(report.data.summary.revenue), booking.data.totalKopecks);
      assert.equal(
        report.data.occupancy.reduce((n: number, r: { sold: number }) => n + r.sold, 0),
        1,
      );
    });
    await t.test('expired reservations return seats automatically and cannot be paid', async () => {
      const booking = await reserve(b.cookie, seats[2].id);
      assert.equal(booking.status, 201);
      await pool.query(
        "UPDATE bookings SET created_at=now()-interval '16 minutes',expires_at=now()-interval '1 minute' WHERE id=$1",
        [booking.data.id],
      );
      assert.equal(
        (await request(`/bookings/${booking.data.id}/pay`, 'POST', {}, b.cookie)).status,
        409,
      );
      assert.equal((await reserve(a.cookie, seats[2].id)).status, 201);
    });
    await t.test('admin creates and edits a schedule; conflicting slots roll back', async () => {
      const hall = await request(
        '/admin/halls',
        'POST',
        { name: 'Studio', rows: 3, seatsPerRow: 4, vipRows: [1], balconyRows: [3] },
        a.cookie,
      );
      assert.equal(hall.status, 201);
      const prod = await request(
        '/admin/productions',
        'POST',
        { title: 'Test play', description: 'A production', type: 'PLAY', durationMinutes: 90 },
        a.cookie,
      );
      assert.equal(prod.status, 201);
      const payload = {
        productionId: prod.data.id,
        hallId: hall.data.id,
        startsAt: new Date(Date.now() + 10 * 86400000).toISOString(),
        prices: { STANDARD: 10000, VIP: 20000, BALCONY: 8000 },
      };
      const created = await request('/admin/sessions', 'POST', payload, a.cookie);
      assert.equal(created.status, 201);
      assert.equal((await request('/admin/sessions', 'POST', payload, a.cookie)).status, 409);
      const halls = (await request('/admin/halls', 'GET', undefined, a.cookie)).data;
      const edited = await request(
        `/admin/sessions/${created.data.id}`,
        'PATCH',
        { ...payload, hallId: halls.find((h: { id: string }) => h.id !== hall.data.id).id },
        a.cookie,
      );
      assert.equal(edited.status, 200);
      assert.equal((await request(`/sessions/${created.data.id}/seats`)).data.seats.length, 48);
    });
    await t.test(
      'multi-seat conflicts roll back; payment and cancellation cannot both succeed',
      async () => {
        const conflict = await request(
          '/bookings',
          'POST',
          {
            sessionId: session.id,
            seatIds: [seats[1].id, seats[4].id],
            totalKopecks: 1,
          },
          b.cookie,
        );
        assert.equal(conflict.status, 409);
        const reserved = await reserve(b.cookie, seats[4].id);
        assert.equal(reserved.status, 201);
        assert.equal(reserved.data.totalKopecks, seats[4].price_kopecks);
        const results = await Promise.all(
          ['pay', 'cancel'].map((action) =>
            request(`/bookings/${reserved.data.id}/${action}`, 'POST', {}, b.cookie),
          ),
        );
        assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
        const stored = (
          await pool.query('SELECT status FROM bookings WHERE id=$1', [reserved.data.id])
        ).rows[0];
        const inventory = (
          await pool.query('SELECT status FROM session_seats WHERE session_id=$1 AND seat_id=$2', [
            session.id,
            seats[4].id,
          ])
        ).rows[0];
        assert.equal(inventory.status, stored.status === 'PAID' ? 'SOLD' : 'AVAILABLE');
      },
    );
    await t.test('logout revokes the server-side session', async () => {
      assert.equal((await request('/auth/logout', 'POST', {}, b.cookie)).status, 204);
      assert.equal((await request('/bookings/mine', 'GET', undefined, b.cookie)).status, 401);
    });
  } finally {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
    await pool.end();
  }
});
