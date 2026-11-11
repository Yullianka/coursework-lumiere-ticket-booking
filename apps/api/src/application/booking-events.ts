import type { BookingSnapshot } from '../domain/booking.js';

export type BookingEventType = 'BOOKING_CREATED' | 'BOOKING_PAID' | 'BOOKING_CANCELLED' | 'BOOKING_EXPIRED';
export interface BookingEvent {
  readonly type: BookingEventType;
  readonly occurredAt: number;
  readonly booking: BookingSnapshot;
}
export interface BookingObserver { onBookingChanged(event: BookingEvent): void | Promise<void> }
export interface ObserverFailure { readonly observer: BookingObserver; readonly error: unknown }

export class BookingEventPublisher {
  private readonly observers = new Set<BookingObserver>();
  subscribe(observer: BookingObserver): () => void {
    this.observers.add(observer);
    return () => { this.observers.delete(observer); };
  }
  async publish(event: BookingEvent): Promise<readonly ObserverFailure[]> {
    const failures: ObserverFailure[] = [];
    for (const observer of [...this.observers]) {
      try { await observer.onBookingChanged(event); }
      catch (error) { failures.push({ observer, error }); }
    }
    return failures;
  }
}

/** The sink can be a logger; no password or customer email is written. */
export class AuditObserver implements BookingObserver {
  constructor(private readonly write: (line: string) => void = console.info) {}
  onBookingChanged(event: BookingEvent): void {
    this.write(JSON.stringify({ type: event.type, bookingId: event.booking.id, status: event.booking.status, occurredAt: event.occurredAt }));
  }
}
