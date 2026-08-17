import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Bootstrap default users with raw SQL so the seed does not depend on
  // Prisma's generated enum validator when the client is out of sync.
  const adminHash = await bcrypt.hash('admin123', 10);
  await prisma.$executeRawUnsafe(`
    INSERT INTO "User" ("name", "email", "password", "role", "isActive", "createdAt", "updatedAt")
    VALUES ('Jahania Admin', 'admin@jahania.com', '${adminHash}', 'ADMIN'::"Role", true, NOW(), NOW())
    ON CONFLICT ("email") DO UPDATE
    SET "name" = EXCLUDED."name",
        "password" = EXCLUDED."password",
        "role" = EXCLUDED."role",
        "isActive" = EXCLUDED."isActive",
        "updatedAt" = NOW()
  `);
  console.log('Admin user ensured:', 'admin@jahania.com');

  const entryHash = await bcrypt.hash('entry123', 10);
  await prisma.$executeRawUnsafe(`
    INSERT INTO "User" ("name", "email", "password", "role", "isActive", "createdAt", "updatedAt")
    VALUES ('Data Entry Desk', 'entry@jahania.com', '${entryHash}', 'DATA_ENTRY'::"Role", true, NOW(), NOW())
    ON CONFLICT ("email") DO UPDATE
    SET "name" = EXCLUDED."name",
        "password" = EXCLUDED."password",
        "role" = EXCLUDED."role",
        "isActive" = EXCLUDED."isActive",
        "updatedAt" = NOW()
  `);
  console.log('Data entry user ensured:', 'entry@jahania.com');

  const expenseAccounts = [
    { name: 'Mazda Diesel', category: 'Vehicle' },
    { name: 'Mazda Maintenance', category: 'Vehicle' },
    { name: 'Suzuki Petrol', category: 'Vehicle' },
    { name: 'Suzuki Maintenance', category: 'Vehicle' },
    { name: 'Home Expense', category: 'Home' },
    { name: 'Office Expense', category: 'Office' },
    { name: 'Personal Expense', category: 'Owner' },
    { name: 'Rider Fuel', category: 'Rider' },
    { name: 'Rider Bike Maintenance', category: 'Rider' },
  ];

  for (const acc of expenseAccounts) {
    await prisma.expenseAccount.upsert({
      where: { name: acc.name },
      update: {},
      create: acc,
    });
  }
  console.log(`${expenseAccounts.length} expense accounts seeded`);

  await prisma.vendor.upsert({
    where: { id: 1 },
    update: {},
    create: {
      name: 'Sindh Public Kanta Thatta',
      contact: '0300-1234567',
      address: 'Thatta, Sindh',
      openingBalance: 0,
      currentBalance: 0,
    },
  });
  console.log('Sample vendor seeded');

  await prisma.customer.upsert({
    where: { id: 1 },
    update: {
      pricingBaseRateType: 'FARM',
      pricingOffsetDirection: 'MINUS',
      pricingOffsetValue: 6,
    },
    create: {
      shopName: 'M/S Inshad',
      contact: '0300-0000000',
      address: 'Karachi',
      openingBalance: 0,
      currentBalance: 0,
      pricingBaseRateType: 'FARM',
      pricingOffsetDirection: 'MINUS',
      pricingOffsetValue: 6,
    },
  });
  console.log('Sample customer seeded');

  const businessDate = new Date(
    `${new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Karachi',
    }).format(new Date())}T00:00:00.000Z`,
  );
  await prisma.marketRate.upsert({
    where: { effectiveDate: businessDate },
    update: { farmRate: 320, finalRate: 322 },
    create: { effectiveDate: businessDate, farmRate: 320, finalRate: 322 },
  });
  console.log('Sample market rates seeded:', 'Farm 320 / Final 322');

  await prisma.driver.upsert({
    where: { id: 1 },
    update: {},
    create: {
      name: 'Driver One',
      contact: '0300-1111111',
      vehicleType: 'Mazda',
      defaultCharge: 1500,
      advanceBalance: 0,
    },
  });
  console.log('Sample driver seeded');

  await prisma.driver.upsert({
    where: { id: 2 },
    update: {},
    create: {
      name: 'Driver Two',
      contact: '0300-2222222',
      vehicleType: 'Suzuki',
      defaultCharge: 1200,
      advanceBalance: 0,
    },
  });
  console.log('Second sample driver seeded');

  const samplePurchase = await prisma.purchaseEntry.findFirst({ where: { vendorId: 1, driverId: 1 } });
  if (!samplePurchase) {
    await prisma.purchaseEntry.create({
      data: {
        vendorId: 1,
        driverId: 1,
        driverCharge: 1500,
        weightKg: 1040,
        ratePerKg: 320,
        purchaseAmount: 332800,
        paymentMode: 'CASH',
        notes: 'Seed purchase with driver link',
      },
    });
    console.log('Sample purchase seeded');
  } else if (Number(samplePurchase.driverCharge ?? 0) === 0) {
    await prisma.purchaseEntry.update({
      where: { id: samplePurchase.id },
      data: { driverCharge: 1500 },
    });
    console.log('Sample purchase driver charge updated');
  }

  console.log('Database seeded successfully!');
  console.log('');
  console.log('Login credentials:');
  console.log('  Admin:    admin@jahania.com / admin123');
  console.log('  Entry:    entry@jahania.com / entry123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
