import { toNumber } from './ledger-posting';

type StockTxClient = {
  purchaseEntry: {
    aggregate: (args: any) => Promise<any>;
  };
  invoiceItem: {
    aggregate: (args: any) => Promise<any>;
  };
};

export async function getCurrentStockSummary(tx: StockTxClient) {
  const [purchaseAgg, soldAgg] = await Promise.all([
    tx.purchaseEntry.aggregate({
      where: { isVoided: false },
      _sum: { weightKg: true },
    }),
    tx.invoiceItem.aggregate({
      where: {
        invoice: {
          isVoided: false,
        },
      },
      _sum: { netWeight: true },
    }),
  ]);

  const purchasedWeight = toNumber(purchaseAgg?._sum?.weightKg);
  const soldWeight = toNumber(soldAgg?._sum?.netWeight);
  const availableWeight = purchasedWeight - soldWeight;

  return {
    purchasedWeight,
    soldWeight,
    availableWeight,
  };
}
