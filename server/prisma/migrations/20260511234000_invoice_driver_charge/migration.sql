-- Add invoice-level driver charge so customer-mode invoices can override it too.
ALTER TABLE "Invoice"
ADD COLUMN "driverCharge" DECIMAL(12,2) NOT NULL DEFAULT 0;
