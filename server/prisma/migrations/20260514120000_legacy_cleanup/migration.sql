-- Backfill legacy purchase weights before dropping the old chicken-count fields.
ALTER TABLE "PurchaseEntry"
  ADD COLUMN IF NOT EXISTS "weightKg" DECIMAL(10,3) NOT NULL DEFAULT 0;

UPDATE "PurchaseEntry"
SET "weightKg" = COALESCE(
  NULLIF("weightKg", 0),
  COALESCE("totalWeight", GREATEST(COALESCE("firstWeight", 0) - COALESCE("secondWeight", 0), 0))
);

-- Expand enum support for the new payment model.
DO $$
BEGIN
  CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'OUTSTANDING', 'COMPLETED', 'FAILED', 'BOUNCED', 'REVERSED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "OnlineProvider" AS ENUM ('JAZZCASH', 'EASYPAISA', 'BANK_TRANSFER', 'OTHER');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE "ChequeStatus" ADD VALUE IF NOT EXISTS 'REVERSED';

ALTER TYPE "PaymentMode" RENAME TO "PaymentMode_old";
CREATE TYPE "PaymentMode" AS ENUM ('CASH', 'UDHAR', 'ONLINE', 'CHEQUE');

ALTER TABLE "PurchaseEntry" ALTER COLUMN "paymentMode" DROP DEFAULT;
ALTER TABLE "PurchaseEntry"
  ALTER COLUMN "paymentMode" TYPE "PaymentMode" USING (
    CASE
      WHEN "paymentMode"::text IN ('BANK', 'EASYPAISA') THEN 'ONLINE'
      ELSE "paymentMode"::text
    END
  )::"PaymentMode";
ALTER TABLE "PurchaseEntry" ALTER COLUMN "paymentMode" SET DEFAULT 'CASH';

ALTER TABLE "Invoice"
  ADD COLUMN IF NOT EXISTS "paymentMode" "PaymentMode" NOT NULL DEFAULT 'CASH';
ALTER TABLE "Invoice" ALTER COLUMN "paymentMode" DROP DEFAULT;
ALTER TABLE "Invoice"
  ALTER COLUMN "paymentMode" TYPE "PaymentMode" USING (
    CASE
      WHEN "paymentMode"::text IN ('BANK', 'EASYPAISA') THEN 'ONLINE'
      ELSE "paymentMode"::text
    END
  )::"PaymentMode";
ALTER TABLE "Invoice" ALTER COLUMN "paymentMode" SET DEFAULT 'CASH';

ALTER TABLE "Voucher" ALTER COLUMN "paymentMode" DROP DEFAULT;
ALTER TABLE "Voucher"
  ALTER COLUMN "paymentMode" TYPE "PaymentMode" USING (
    CASE
      WHEN "paymentMode"::text IN ('BANK', 'EASYPAISA') THEN 'ONLINE'
      ELSE "paymentMode"::text
    END
  )::"PaymentMode";
ALTER TABLE "Voucher" ALTER COLUMN "paymentMode" SET DEFAULT 'CASH';

ALTER TABLE "ExpenseEntry" ALTER COLUMN "paymentMode" DROP DEFAULT;
ALTER TABLE "ExpenseEntry"
  ALTER COLUMN "paymentMode" TYPE "PaymentMode" USING (
    CASE
      WHEN "paymentMode"::text IN ('BANK', 'EASYPAISA') THEN 'ONLINE'
      ELSE "paymentMode"::text
    END
  )::"PaymentMode";
ALTER TABLE "ExpenseEntry" ALTER COLUMN "paymentMode" SET DEFAULT 'CASH';

ALTER TABLE "TransportAdvance" ALTER COLUMN "paymentMode" DROP DEFAULT;
ALTER TABLE "TransportAdvance"
  ALTER COLUMN "paymentMode" TYPE "PaymentMode" USING (
    CASE
      WHEN "paymentMode"::text IN ('BANK', 'EASYPAISA') THEN 'ONLINE'
      ELSE "paymentMode"::text
    END
  )::"PaymentMode";
ALTER TABLE "TransportAdvance" ALTER COLUMN "paymentMode" SET DEFAULT 'CASH';

DROP TYPE "PaymentMode_old";

-- Purchase entries become weight-only.
ALTER TABLE "PurchaseEntry"
  ADD COLUMN IF NOT EXISTS "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'COMPLETED',
  ADD COLUMN IF NOT EXISTS "paymentReference" TEXT,
  ADD COLUMN IF NOT EXISTS "paymentProvider" "OnlineProvider",
  ADD COLUMN IF NOT EXISTS "chequeLogId" INTEGER,
  ADD COLUMN IF NOT EXISTS "onlinePaymentLogId" INTEGER,
  DROP COLUMN IF EXISTS "birdType",
  DROP COLUMN IF EXISTS "birdCount",
  DROP COLUMN IF EXISTS "firstWeight",
  DROP COLUMN IF EXISTS "secondWeight",
  DROP COLUMN IF EXISTS "netWeight",
  DROP COLUMN IF EXISTS "crateWeight",
  DROP COLUMN IF EXISTS "safiDeduction",
  DROP COLUMN IF EXISTS "extra",
  DROP COLUMN IF EXISTS "totalWeight",
  DROP COLUMN IF EXISTS "avgWeight",
  DROP COLUMN IF EXISTS "shortCount",
  DROP COLUMN IF EXISTS "expiredCount",
  DROP COLUMN IF EXISTS "netShort";

ALTER TABLE "DriverRouteAllocation"
  DROP COLUMN IF EXISTS "chickenCount";

ALTER TABLE "Invoice"
  ADD COLUMN IF NOT EXISTS "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'COMPLETED',
  ADD COLUMN IF NOT EXISTS "paymentReference" TEXT,
  ADD COLUMN IF NOT EXISTS "paymentProvider" "OnlineProvider",
  ADD COLUMN IF NOT EXISTS "chequeLogId" INTEGER,
  ADD COLUMN IF NOT EXISTS "onlinePaymentLogId" INTEGER;

-- Cheque and online payment log tables backing the new settlement flow.
CREATE TABLE IF NOT EXISTS "ChequeLog" (
  "id" SERIAL NOT NULL,
  "chequeNo" TEXT NOT NULL,
  "bankName" TEXT NOT NULL,
  "chequeDate" TIMESTAMP(3) NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "receivedFrom" TEXT,
  "sourceType" TEXT,
  "sourceId" INTEGER,
  "paymentMode" "PaymentMode" NOT NULL DEFAULT 'CHEQUE',
  "status" "ChequeStatus" NOT NULL DEFAULT 'PENDING',
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ChequeLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "OnlinePaymentLog" (
  "id" SERIAL NOT NULL,
  "provider" "OnlineProvider" NOT NULL,
  "referenceNo" TEXT,
  "amount" DECIMAL(12,2) NOT NULL,
  "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
  "receivedFrom" TEXT,
  "sourceType" TEXT,
  "sourceId" INTEGER,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OnlinePaymentLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PurchaseEntry_chequeLogId_key" ON "PurchaseEntry"("chequeLogId");
CREATE UNIQUE INDEX IF NOT EXISTS "PurchaseEntry_onlinePaymentLogId_key" ON "PurchaseEntry"("onlinePaymentLogId");
CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_chequeLogId_key" ON "Invoice"("chequeLogId");
CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_onlinePaymentLogId_key" ON "Invoice"("onlinePaymentLogId");

ALTER TABLE "PurchaseEntry"
  ADD CONSTRAINT "PurchaseEntry_chequeLogId_fkey"
  FOREIGN KEY ("chequeLogId") REFERENCES "ChequeLog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PurchaseEntry"
  ADD CONSTRAINT "PurchaseEntry_onlinePaymentLogId_fkey"
  FOREIGN KEY ("onlinePaymentLogId") REFERENCES "OnlinePaymentLog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Invoice"
  ADD CONSTRAINT "Invoice_chequeLogId_fkey"
  FOREIGN KEY ("chequeLogId") REFERENCES "ChequeLog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Invoice"
  ADD CONSTRAINT "Invoice_onlinePaymentLogId_fkey"
  FOREIGN KEY ("onlinePaymentLogId") REFERENCES "OnlinePaymentLog"("id") ON DELETE SET NULL ON UPDATE CASCADE;
