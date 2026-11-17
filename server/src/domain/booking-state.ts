export type BookingStatus = 'PENDING' | 'PAID' | 'CANCELLED' | 'EXPIRED';
export interface TransitionContext {
  readonly now: number;
  readonly expiresAt: number;
}

export class InvalidTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidTransitionError';
  }
}

export interface BookingState {
  readonly status: BookingStatus;
  pay(context: TransitionContext): BookingState;
  cancel(context: TransitionContext): BookingState;
  expire(context: TransitionContext): BookingState;
}

abstract class TerminalState implements BookingState {
  abstract readonly status: BookingStatus;
  pay(_context: TransitionContext): BookingState {
    throw new InvalidTransitionError(`Cannot pay a ${this.status} booking.`);
  }
  cancel(_context: TransitionContext): BookingState {
    throw new InvalidTransitionError(`Cannot cancel a ${this.status} booking.`);
  }
  expire(_context: TransitionContext): BookingState {
    throw new InvalidTransitionError(`Cannot expire a ${this.status} booking.`);
  }
}

export class PaidState extends TerminalState {
  readonly status = 'PAID';
  override pay(): BookingState {
    return this;
  }
}
export class CancelledState extends TerminalState {
  readonly status = 'CANCELLED';
  override cancel(): BookingState {
    return this;
  }
}
export class ExpiredState extends TerminalState {
  readonly status = 'EXPIRED';
  override expire(): BookingState {
    return this;
  }
}
export class PendingState implements BookingState {
  readonly status = 'PENDING';
  private requireActive({ now, expiresAt }: TransitionContext): void {
    if (now >= expiresAt) throw new InvalidTransitionError('Booking has expired.');
  }
  pay(context: TransitionContext): BookingState {
    this.requireActive(context);
    return new PaidState();
  }
  cancel(context: TransitionContext): BookingState {
    this.requireActive(context);
    return new CancelledState();
  }
  expire({ now, expiresAt }: TransitionContext): BookingState {
    if (now < expiresAt) throw new InvalidTransitionError('Booking has not expired yet.');
    return new ExpiredState();
  }
}
