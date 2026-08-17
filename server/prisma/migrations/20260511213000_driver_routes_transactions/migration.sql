-- Add driver defaults
ALTER TABLE "Driver"
ADD COLUMN "defaultCharge" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- Driver route templates
CREATE TABLE "DriverRoute" (
    "id" SERIAL NOT NULL,
    "driverId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "truckNo" TEXT,
    "truckType" TEXT,
    "routeCharge" DECIMAL(12,2),
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DriverRoute_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DriverRouteAllocation" (
    "id" SERIAL NOT NULL,
    "routeId" INTEGER NOT NULL,
    "customerId" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "chickenCount" INTEGER NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DriverRouteAllocation_pkey" PRIMARY KEY ("id")
);

-- Link existing movement tables to drivers/routes
ALTER TABLE "PurchaseEntry"
ADD COLUMN "driverId" INTEGER;

ALTER TABLE "Invoice"
ADD COLUMN "driverId" INTEGER,
ADD COLUMN "routeId" INTEGER,
ADD COLUMN "routeSnapshot" JSONB;

-- Helpful indexes
CREATE INDEX "DriverRoute_driverId_idx" ON "DriverRoute"("driverId");
CREATE INDEX "DriverRouteAllocation_routeId_idx" ON "DriverRouteAllocation"("routeId");
CREATE INDEX "DriverRouteAllocation_customerId_idx" ON "DriverRouteAllocation"("customerId");

-- Foreign keys
ALTER TABLE "DriverRoute"
ADD CONSTRAINT "DriverRoute_driverId_fkey"
FOREIGN KEY ("driverId") REFERENCES "Driver"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DriverRouteAllocation"
ADD CONSTRAINT "DriverRouteAllocation_routeId_fkey"
FOREIGN KEY ("routeId") REFERENCES "DriverRoute"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DriverRouteAllocation"
ADD CONSTRAINT "DriverRouteAllocation_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PurchaseEntry"
ADD CONSTRAINT "PurchaseEntry_driverId_fkey"
FOREIGN KEY ("driverId") REFERENCES "Driver"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Invoice"
ADD CONSTRAINT "Invoice_driverId_fkey"
FOREIGN KEY ("driverId") REFERENCES "Driver"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Invoice"
ADD CONSTRAINT "Invoice_routeId_fkey"
FOREIGN KEY ("routeId") REFERENCES "DriverRoute"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
