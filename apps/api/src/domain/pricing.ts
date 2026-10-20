/** All monetary values are integer kopecks; promotions do not stack. */
export interface DiscountContext {
  readonly studentVerified: boolean;
  readonly now: number;
  readonly promo?: {
    readonly code: string;
    readonly percent: number;
    readonly active: boolean;
    readonly validFrom: number;
    readonly validTo: number;
  };
}

export interface DiscountStrategy {
  readonly name: string;
  discount(basePrice: number, context: DiscountContext): number;
}

export class NoDiscount implements DiscountStrategy {
  readonly name = 'NONE';
  discount(): number {
    return 0;
  }
}

export class StudentDiscount implements DiscountStrategy {
  readonly name = 'STUDENT';
  discount(basePrice: number, context: DiscountContext): number {
    return context.studentVerified ? Math.round(basePrice * 0.1) : 0;
  }
}

export class PromoDiscount implements DiscountStrategy {
  readonly name = 'PROMO';
  discount(basePrice: number, { promo, now }: DiscountContext): number {
    if (!promo || !promo.active || now < promo.validFrom || now >= promo.validTo) return 0;
    if (!Number.isInteger(promo.percent) || promo.percent < 1 || promo.percent > 100) {
      throw new Error('Promotion percentage must be between 1 and 100.');
    }
    if (
      !Number.isFinite(promo.validFrom) ||
      !Number.isFinite(promo.validTo) ||
      promo.validTo <= promo.validFrom
    ) {
      throw new Error('Invalid promotion validity period.');
    }
    return Math.round((basePrice * promo.percent) / 100);
  }
}

export interface Price {
  readonly basePriceKopecks: number;
  readonly discountKopecks: number;
  readonly finalPriceKopecks: number;
  readonly discountName: string;
}

export class PricingService {
  private readonly strategies: readonly DiscountStrategy[];
  constructor(
    strategies: readonly DiscountStrategy[] = [
      new NoDiscount(),
      new StudentDiscount(),
      new PromoDiscount(),
    ],
  ) {
    this.strategies = [...strategies];
  }

  calculate(basePrice: number, context: DiscountContext): Price {
    // The bound also keeps percentage multiplication within safe integer arithmetic.
    if (!Number.isSafeInteger(basePrice) || basePrice < 0 || basePrice > 1_000_000_000) {
      throw new Error('Price must be an integer from 0 to 1,000,000,000 kopecks.');
    }
    if (!Number.isFinite(context.now)) throw new Error('Invalid pricing time.');
    let best = 0;
    let name = 'NONE';
    for (const strategy of this.strategies) {
      const discount = strategy.discount(basePrice, context);
      if (!Number.isSafeInteger(discount) || discount < 0 || discount > basePrice) {
        throw new Error('Discount strategy returned an invalid amount.');
      }
      if (discount > best) {
        best = discount;
        name = strategy.name;
      }
    }
    return Object.freeze({
      basePriceKopecks: basePrice,
      discountKopecks: best,
      finalPriceKopecks: basePrice - best,
      discountName: name,
    });
  }
}
