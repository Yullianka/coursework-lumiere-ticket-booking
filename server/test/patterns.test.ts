import test from 'node:test';
import assert from 'node:assert/strict';
import { Booking } from '../src/domain/booking.js';
import { InvalidTransitionError } from '../src/domain/booking-state.js';
import { PricingService, type DiscountContext } from '../src/domain/pricing.js';
import { BookingService, type BookingRepository } from '../src/application/booking-service.js';
import {
  AuditObserver,
  BookingEventPublisher,
  type BookingEvent,
} from '../src/application/booking-events.js';

const NOW = Date.UTC(2026, 10, 11, 12);
const pricing = new PricingService();
const context: DiscountContext = { studentVerified: false, now: NOW };
function booking(startsAt = NOW + 3_600_000) {
  return Booking.create({
    userId: 'customer-1',
    sessionId: 'session-1',
    now: NOW,
    startsAt,
    items: [{ seatId: 'seat-1', ...pricing.calculate(20000, context) }],
  });
}

// Test adapter only: checks stale updates; it is not a production inventory repository.
class TestRepository implements BookingRepository {
  readonly rows = new Map<string, Booking>();
  saves = 0;
  fail = false;
  async save(next: Booking, previous?: Booking): Promise<void> {
    if (this.fail) throw new Error('Database unavailable');
    if (previous && this.rows.get(previous.snapshot.id) !== previous)
      throw new Error('Stale booking');
    this.rows.set(next.snapshot.id, next);
    this.saves++;
  }
}
function setup() {
  let now = NOW;
  const repo = new TestRepository();
  const publisher = new BookingEventPublisher();
  const events: BookingEvent[] = [];
  publisher.subscribe({
    onBookingChanged(event) {
      events.push(event);
    },
  });
  const service = new BookingService(repo, pricing, publisher, () => now);
  return {
    repo,
    publisher,
    events,
    service,
    setTime(value: number) {
      now = value;
    },
  };
}
const reservation = {
  userId: 'customer-1',
  sessionId: 'session-1',
  startsAt: NOW + 3_600_000,
  seats: [{ seatId: 'seat-1', basePriceKopecks: 20000 }],
  discount: { studentVerified: true },
};

test('Booking: validates seats and freezes the price snapshot', () => {
  const item = { seatId: 'seat-1', ...pricing.calculate(20000, context) };
  const input = { userId: 'c', sessionId: 's', now: NOW, startsAt: NOW + 1000, items: [item] };
  for (const items of [
    [],
    [item, item],
    Array.from({ length: 9 }, (_, i) => ({ ...item, seatId: String(i) })),
  ]) {
    assert.throws(() => Booking.create({ ...input, items }));
  }
  assert.throws(() => Booking.create({ ...input, startsAt: NOW }));
  const original = Booking.create(input);
  item.basePriceKopecks = 999;
  assert.equal(original.snapshot.items[0].basePriceKopecks, 20000);
  assert.throws(() => {
    (original.snapshot.items as unknown as { seatId: string }[]).push({ seatId: 'other' });
  });
});
test('State: allows payment and cancellation while preserving the original booking', () => {
  const original = booking();
  assert.equal(original.transition('pay', NOW).snapshot.status, 'PAID');
  assert.equal(original.transition('cancel', NOW).snapshot.status, 'CANCELLED');
  assert.equal(original.snapshot.status, 'PENDING');
  assert.equal(original.snapshot.expiresAt, NOW + 900_000);
});
test('State: expiry is bounded by session start and rejects payment at the deadline', () => {
  const original = booking(NOW + 1000);
  assert.equal(original.snapshot.expiresAt, NOW + 1000);
  assert.throws(() => original.transition('expire', NOW + 999), InvalidTransitionError);
  assert.throws(() => original.transition('pay', NOW + 1000), InvalidTransitionError);
  assert.throws(() => original.transition('cancel', NOW + 1000), InvalidTransitionError);
  assert.equal(original.transition('expire', NOW + 1000).snapshot.status, 'EXPIRED');
});
test('State: terminal transitions are forbidden and identical retries are idempotent', () => {
  for (const [action, time] of [
    ['pay', NOW],
    ['cancel', NOW],
    ['expire', NOW + 900_000],
  ] as const) {
    const terminal = booking().transition(action, time);
    assert.equal(terminal.transition(action, time), terminal);
    for (const other of ['pay', 'cancel', 'expire'] as const) {
      if (other !== action)
        assert.throws(() => terminal.transition(other, time), InvalidTransitionError);
    }
  }
});
test('All patterns: student-priced booking, save, payment and audit in order', async () => {
  const { repo, publisher, events, service } = setup();
  const lines: string[] = [];
  publisher.subscribe(new AuditObserver((line) => lines.push(line)));
  publisher.subscribe({
    onBookingChanged(event) {
      assert.equal(repo.rows.get(event.booking.id)?.snapshot.status, event.booking.status);
    },
  });
  const created = await service.reserve(reservation);
  assert.equal(created.booking.snapshot.totalKopecks, 18000);
  const paid = await service.pay('customer-1', created.booking);
  assert.equal(paid.booking.snapshot.status, 'PAID');
  await service.pay('customer-1', paid.booking);
  assert.equal(repo.saves, 2);
  assert.deepEqual(
    events.map((event) => event.type),
    ['BOOKING_CREATED', 'BOOKING_PAID'],
  );
  assert.equal(JSON.parse(lines[1]).status, 'PAID');
});
test('Service: ownership and stale updates are rejected without extra events', async () => {
  const { service, events } = setup();
  const { booking: original } = await service.reserve(reservation);
  await assert.rejects(service.pay('another-customer', original), /does not belong/);
  await service.pay('customer-1', original);
  await assert.rejects(service.cancel('customer-1', original), /Stale/);
  assert.equal(events.length, 2);
});
test('Service: persistence failure emits nothing and leaves the original unchanged', async () => {
  const { service, repo, events } = setup();
  const { booking: original } = await service.reserve(reservation);
  repo.fail = true;
  await assert.rejects(service.pay('customer-1', original), /Database unavailable/);
  assert.equal(original.snapshot.status, 'PENDING');
  assert.equal(events.length, 1);
  await assert.rejects(service.reserve(reservation), /Database unavailable/);
  assert.equal(events.length, 1);
});
test('Observer: one failure does not hide a saved change or stop other observers', async () => {
  const { service, repo, publisher } = setup();
  let notified = 0;
  publisher.subscribe({
    async onBookingChanged() {
      throw new Error('Audit unavailable');
    },
  });
  const observer = {
    onBookingChanged() {
      notified++;
    },
  };
  const unsubscribe = publisher.subscribe(observer);
  publisher.subscribe(observer); // duplicate subscriptions are ignored
  const result = await service.reserve(reservation);
  assert.equal(result.observerFailures.length, 1);
  assert.equal(repo.saves, 1);
  assert.equal(notified, 1);
  unsubscribe();
  await service.pay('customer-1', result.booking);
  assert.equal(notified, 1);
});
test('Service: cancellation and expiration publish the correct events', async () => {
  const { service, events, setTime } = setup();
  const first = await service.reserve(reservation);
  await service.cancel('customer-1', first.booking);
  const second = await service.reserve(reservation);
  setTime(second.booking.snapshot.expiresAt);
  await service.expire(second.booking);
  assert.deepEqual(
    events.map((event) => event.type),
    ['BOOKING_CREATED', 'BOOKING_CANCELLED', 'BOOKING_CREATED', 'BOOKING_EXPIRED'],
  );
});
