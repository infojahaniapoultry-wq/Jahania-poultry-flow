-- Add settled amount tracking for partial payments on purchases and invoices.
ALTER TABLE "PurchaseEntry"
ADD COLUMN IF NOT EXISTS "settledAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;

ALTER TABLE "Invoice"
ADD COLUMN IF NOT EXISTS "settledAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;
