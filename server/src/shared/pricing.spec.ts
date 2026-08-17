import { calculateCustomerRate } from './pricing';

describe('customer pricing calculator', () => {
  it('calculates Farm minus an offset', () => {
    expect(
      calculateCustomerRate(
        { baseRateType: 'FARM', offsetDirection: 'MINUS', offsetValue: 6 },
        { farmRate: 320, finalRate: 322 },
      ),
    ).toBe(314);
  });

  it('calculates Final plus an offset', () => {
    expect(
      calculateCustomerRate(
        { baseRateType: 'FINAL', offsetDirection: 'PLUS', offsetValue: 2 },
        { farmRate: 320, finalRate: 322 },
      ),
    ).toBe(324);
  });

  it('preserves decimal rate precision', () => {
    expect(
      calculateCustomerRate(
        { baseRateType: 'FARM', offsetDirection: 'MINUS', offsetValue: 1.25 },
        { farmRate: 320.5, finalRate: 322 },
      ),
    ).toBe(319.25);
  });

  it('rejects a zero or negative calculated rate', () => {
    expect(() =>
      calculateCustomerRate(
        { baseRateType: 'FARM', offsetDirection: 'MINUS', offsetValue: 320 },
        { farmRate: 320, finalRate: 322 },
      ),
    ).toThrow('Calculated customer rate must be greater than zero');
  });
});
