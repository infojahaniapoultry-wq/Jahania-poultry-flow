import { BadRequestException } from '@nestjs/common';

export type PricingBaseRateType = 'FARM' | 'FINAL';
export type PricingOffsetDirection = 'PLUS' | 'MINUS';

export type CustomerPricingRule = {
  baseRateType: PricingBaseRateType;
  offsetDirection: PricingOffsetDirection;
  offsetValue: unknown;
};

export type MarketRates = {
  farmRate: unknown;
  finalRate: unknown;
};

export function calculateCustomerRate(
  rule: CustomerPricingRule,
  marketRates: MarketRates,
) {
  const baseRate = Number(
    rule.baseRateType === 'FARM' ? marketRates.farmRate : marketRates.finalRate,
  );
  const offset = Number(rule.offsetValue);
  const calculatedRate =
    rule.offsetDirection === 'MINUS' ? baseRate - offset : baseRate + offset;

  if (!Number.isFinite(calculatedRate) || calculatedRate <= 0) {
    throw new BadRequestException(
      'Calculated customer rate must be greater than zero',
    );
  }

  return calculatedRate;
}
