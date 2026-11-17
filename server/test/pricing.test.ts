import test from 'node:test';
import assert from 'node:assert/strict';
import { PricingService, type DiscountContext } from '../src/domain/pricing.js';

const NOW = Date.UTC(2026, 10, 11, 12);
const pricing = new PricingService();
const context: DiscountContext = { studentVerified: false, now: NOW };
const promo = {
  code: 'AUTUMN',
  percent: 20,
  active: true,
  validFrom: NOW - 1000,
  validTo: NOW + 1000,
};

test('Strategy: no discount, student eligibility and rounding', () => {
  assert.equal(pricing.calculate(10005, context).finalPriceKopecks, 10005);
  assert.equal(
    pricing.calculate(10005, { ...context, studentVerified: true }).discountKopecks,
    1001,
  );
});
test('Strategy: selects the best eligible discount without stacking', () => {
  const result = pricing.calculate(20000, { ...context, studentVerified: true, promo });
  assert.deepEqual(result, {
    basePriceKopecks: 20000,
    discountKopecks: 4000,
    finalPriceKopecks: 16000,
    discountName: 'PROMO',
  });
  assert.equal(
    pricing.calculate(20000, { ...context, studentVerified: true, promo: { ...promo, percent: 5 } })
      .discountName,
    'STUDENT',
  );
});
test('Strategy: promotion boundaries, disabled promotions and invalid inputs', () => {
  assert.equal(
    pricing.calculate(20000, { ...context, now: promo.validFrom, promo }).discountKopecks,
    4000,
  );
  for (const ctx of [
    { ...context, now: promo.validFrom - 1, promo },
    { ...context, now: promo.validTo, promo },
    { ...context, promo: { ...promo, active: false } },
  ]) {
    assert.equal(pricing.calculate(20000, ctx).discountKopecks, 0);
  }
  for (const price of [-1, 1.5, NaN, Infinity])
    assert.throws(() => pricing.calculate(price, context));
  assert.throws(() => pricing.calculate(20000, { ...context, promo: { ...promo, percent: 101 } }));
});
test('Strategy: accepts extensions and rejects invalid strategy results', () => {
  const custom = new PricingService([{ name: 'FIXED', discount: () => 500 }]);
  assert.equal(custom.calculate(20000, context).finalPriceKopecks, 19500);
  assert.throws(() =>
    new PricingService([{ name: 'BROKEN', discount: () => 30000 }]).calculate(20000, context),
  );
});

test('Strategy: zero-priced seats and full discounts remain non-negative', () => {
  assert.equal(
    pricing.calculate(0, { ...context, studentVerified: true, promo }).finalPriceKopecks,
    0,
  );
  assert.equal(
    pricing.calculate(20000, { ...context, promo: { ...promo, percent: 100 } }).finalPriceKopecks,
    0,
  );
});
test('Strategy: an empty strategy list uses the original price', () => {
  assert.equal(new PricingService([]).calculate(20000, context).finalPriceKopecks, 20000);
  assert.throws(() => pricing.calculate(20000, { ...context, now: NaN }));
});
