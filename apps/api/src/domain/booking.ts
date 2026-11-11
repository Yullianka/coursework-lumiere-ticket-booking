import { randomUUID } from 'node:crypto';
import { PendingState, type BookingState, type BookingStatus } from './booking-state.js';
import type { Price } from './pricing.js';

export interface BookingItem extends Price { readonly seatId: string }
export interface BookingSnapshot {
  readonly id: string;
  readonly userId: string;
  readonly sessionId: string;
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly status: BookingStatus;
  readonly items: readonly BookingItem[];
  readonly totalKopecks: number;
}

/** Immutable aggregate: a transition produces a new booking; the original remains unchanged. */
export class Booking {
  private constructor(
    private readonly data: Omit<BookingSnapshot, 'status'>,
    private readonly state: BookingState,
  ) {}

  static create(input: {
    userId: string; sessionId: string; startsAt: number; now: number; items: readonly BookingItem[];
  }): Booking {
    if (!input.userId.trim() || !input.sessionId.trim()) throw new Error('Customer and session are required.');
    if (!Number.isFinite(input.now) || !Number.isFinite(input.startsAt) || input.startsAt <= input.now) {
      throw new Error('The session must start in the future.');
    }
    if (input.items.length < 1 || input.items.length > 8) throw new Error('Select between 1 and 8 seats.');
    if (new Set(input.items.map(item => item.seatId)).size !== input.items.length) throw new Error('Duplicate seat.');
    for (const item of input.items) {
      if (!item.seatId.trim() || ![item.basePriceKopecks, item.discountKopecks, item.finalPriceKopecks].every(value => Number.isSafeInteger(value) && value >= 0) || item.finalPriceKopecks !== item.basePriceKopecks - item.discountKopecks) {
        throw new Error('Invalid booking item.');
      }
    }
    const items = Object.freeze(input.items.map(item => Object.freeze({ ...item })));
    const totalKopecks = items.reduce((sum, item) => sum + item.finalPriceKopecks, 0);
    if (!Number.isSafeInteger(totalKopecks)) throw new Error('Invalid booking total.');
    const data = Object.freeze({
      id: randomUUID(), userId: input.userId, sessionId: input.sessionId,
      createdAt: input.now, expiresAt: Math.min(input.now + 15 * 60_000, input.startsAt), items, totalKopecks,
    });
    return new Booking(data, new PendingState());
  }

  get snapshot(): BookingSnapshot { return Object.freeze({ ...this.data, status: this.state.status }); }

  transition(action: 'pay' | 'cancel' | 'expire', now: number): Booking {
    if (!Number.isFinite(now) || now < this.data.createdAt) throw new Error('Invalid transition time.');
    const next = this.state[action]({ now, expiresAt: this.data.expiresAt });
    return next.status === this.state.status ? this : new Booking(this.data, next);
  }
}
