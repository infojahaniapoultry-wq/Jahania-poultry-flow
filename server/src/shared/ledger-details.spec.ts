import {
  detailsForLedgerRow,
  summarizeInvoiceItems,
  summarizePurchase,
} from './ledger-details';

describe('ledger detail summaries', () => {
  it('totals invoice weight and preserves a single rate', () => {
    expect(
      summarizeInvoiceItems([
        { netWeight: '100.250', ratePerKg: '12.50' },
        { netWeight: 50, ratePerKg: 12.5 },
      ]),
    ).toEqual({ weightKg: 150.25, ratePerKg: 12.5, rateCount: 1 });
  });

  it('marks invoice rates as mixed when line items use different rates', () => {
    expect(
      summarizeInvoiceItems([
        { netWeight: 100, ratePerKg: 12.5 },
        { netWeight: 50, ratePerKg: 13 },
      ]),
    ).toEqual({ weightKg: 150, ratePerKg: null, rateCount: 2 });
  });

  it('summarizes purchase weight and rate', () => {
    expect(summarizePurchase({ weightKg: '250.500', ratePerKg: '8' })).toEqual({
      weightKg: 250.5,
      ratePerKg: 8,
      rateCount: 1,
    });
  });

  it('returns empty details for non-commodity ledger references', () => {
    const details = new Map([
      ['INVOICE:22', { weightKg: 100, ratePerKg: 12.5, rateCount: 1 }],
    ]);

    expect(
      detailsForLedgerRow(details, {
        referenceType: 'VOUCHER_PAYMENT_ADJUSTMENT',
        referenceId: 91,
      }),
    ).toEqual({ weightKg: null, ratePerKg: null, rateCount: 0 });
  });
});
