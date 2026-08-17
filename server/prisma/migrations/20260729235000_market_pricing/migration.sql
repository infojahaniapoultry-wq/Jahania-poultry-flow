-- CreateEnum
CREATE TYPE "MarketRateBaseType" AS ENUM ('FARM', 'FINAL');

-- CreateEnum
CREATE TYPE "PricingOffsetDirection" AS ENUM ('PLUS', 'MINUS');

-- Add customer pricing-rule fields. They remain nullable for existing records;
-- invoice creation rejects customers until their rule is configured.
ALTER TABLE "Customer"
ADD COLUMN "pricingBaseRateType" "MarketRateBaseType",
ADD COLUMN "pricingOffsetDirection" "PricingOffsetDirection",
ADD COLUMN "pricingOffsetValue" DECIMAL(10,2);

-- CreateTable
CREATE TABLE "MarketRate" (
    "id" SERIAL NOT NULL,
    "effectiveDate" DATE NOT NULL,
    "farmRate" DECIMAL(10,2) NOT NULL,
    "finalRate" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MarketRate_effectiveDate_key" ON "MarketRate"("effectiveDate");

-- CreateIndex
CREATE INDEX "MarketRate_effectiveDate_idx" ON "MarketRate"("effectiveDate");
