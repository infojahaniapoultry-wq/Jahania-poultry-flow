import { PrismaClient } from '@prisma/client';
import { formatDocumentNo } from '../src/shared/document-number';

const prisma = new PrismaClient();

async function main() {
  const invoiceRows = await prisma.invoice.findMany({
    select: { id: true, invoiceNo: true },
  });

  const purchaseCashBookRows = await prisma.cashBook.findMany({
    where: { referenceType: 'PURCHASE' },
    select: { id: true, referenceId: true, voucherRef: true },
  });

  const purchaseReversalRows = await prisma.cashBook.findMany({
    where: { referenceType: 'PURCHASE_REVERSAL' },
    select: { id: true, referenceId: true, voucherRef: true },
  });

  const transportAdvanceRows = await prisma.transportAdvance.findMany({
    select: { id: true, voucherRef: true },
  });

  let invoicesUpdated = 0;
  let purchaseRefsUpdated = 0;
  let purchaseReversalRefsUpdated = 0;
  let transportRefsUpdated = 0;

  await prisma.$transaction(async (tx) => {
    for (const row of invoiceRows) {
      const next = formatDocumentNo('INVOICE', row.id);
      if (row.invoiceNo !== next) {
        await tx.invoice.update({
          where: { id: row.id },
          data: { invoiceNo: next },
        });
        invoicesUpdated += 1;
      }
    }

    for (const row of purchaseCashBookRows) {
      if (row.referenceId == null) continue;
      const next = formatDocumentNo('PUR', row.referenceId);
      if (row.voucherRef !== next) {
        await tx.cashBook.update({
          where: { id: row.id },
          data: { voucherRef: next },
        });
        purchaseRefsUpdated += 1;
      }
    }

    for (const row of purchaseReversalRows) {
      if (row.referenceId == null) continue;
      const next = formatDocumentNo('PUR-REV', row.referenceId);
      if (row.voucherRef !== next) {
        await tx.cashBook.update({
          where: { id: row.id },
          data: { voucherRef: next },
        });
        purchaseReversalRefsUpdated += 1;
      }
    }

    for (const row of transportAdvanceRows) {
      const next = formatDocumentNo('TA', row.id);
      if (!row.voucherRef || /^TA-\d+$/.test(row.voucherRef)) {
        if (row.voucherRef !== next) {
          await tx.transportAdvance.update({
            where: { id: row.id },
            data: { voucherRef: next },
          });
          transportRefsUpdated += 1;
        }
      }
    }
  });

  console.log(
    JSON.stringify(
      {
        invoicesUpdated,
        purchaseRefsUpdated,
        purchaseReversalRefsUpdated,
        transportRefsUpdated,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
