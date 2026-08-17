import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { VoucherType, PaymentMode, LedgerEntryType } from '@prisma/client';

describe('Poultry Business Workflow (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;

  // Test entities created during the workflow
  let driverId: number;
  let vendorId: number;
  let customerId: number;
  let purchaseId: number;
  let invoiceId: number;
  let recoveryVoucherId: number;
  let paymentVoucherId: number;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();

    // Authenticate as Admin to acquire JWT token
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'admin@jahania.com',
        password: 'admin123',
      });
    adminToken = loginRes.body.accessToken;
  });

  afterAll(async () => {
    // Tear down transactions in reverse dependency order to keep DB clean
    if (recoveryVoucherId) {
      // Vouchers don't have delete endpoints, but let's clear up if possible or just let them stand.
      // Since they are transactional, let's delete them via direct Prisma context if needed,
      // but since E2E APIs don't expose DELETE vouchers, we can let database cascades handle cascade deletes
      // when deleting Customer and Vendor.
    }
    if (invoiceId) {
      await request(app.getHttpServer())
        .delete(`/invoices/${invoiceId}`)
        .set('Authorization', `Bearer ${adminToken}`);
    }
    if (purchaseId) {
      await request(app.getHttpServer())
        .delete(`/purchases/${purchaseId}`)
        .set('Authorization', `Bearer ${adminToken}`);
    }
    if (customerId) {
      await request(app.getHttpServer())
        .delete(`/customers/${customerId}`)
        .set('Authorization', `Bearer ${adminToken}`);
    }
    if (vendorId) {
      await request(app.getHttpServer())
        .delete(`/vendors/${vendorId}`)
        .set('Authorization', `Bearer ${adminToken}`);
    }
    if (driverId) {
      await request(app.getHttpServer())
        .delete(`/drivers/${driverId}`)
        .set('Authorization', `Bearer ${adminToken}`);
    }
    await app.close();
  });

  it('should successfully run the complete transactional business cycle', async () => {
    // -------------------------------------------------------------
    // STEP 1: CREATE OPERATIONAL ENTITIES
    // -------------------------------------------------------------

    // Create a new Driver
    const driverRes = await request(app.getHttpServer())
      .post('/drivers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Workflow Test Driver',
        contact: '0300-1112223',
        vehicleType: 'Rider Chota Hathi',
        defaultCharge: 1500,
      })
      .expect(201);
    driverId = driverRes.body.id;
    expect(driverId).toBeDefined();

    // Create a new Vendor with 0 initial balance
    const vendorRes = await request(app.getHttpServer())
      .post('/vendors')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Workflow Farmer Vendor',
        contact: '0300-4445556',
        address: 'Multan Farm Road',
        openingBalance: 0,
      })
      .expect(201);
    vendorId = vendorRes.body.id;
    expect(vendorId).toBeDefined();

    // Create a new Customer with 0 initial balance
    const customerRes = await request(app.getHttpServer())
      .post('/customers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        shopName: 'Workflow Broiler Shop',
        contact: '0300-7778889',
        address: 'Jahania Main Bazar',
        openingBalance: 0,
      })
      .expect(201);
    customerId = customerRes.body.id;
    expect(customerId).toBeDefined();

    // -------------------------------------------------------------
    // STEP 2: INFLOW TRANSACTION (PURCHASE POULTRY)
    // -------------------------------------------------------------
    // We buy 1500 kg of broiler at Rs 300 per kg on credit (UDHAR).
    // Total cost = 450,000.
    const purchaseRes = await request(app.getHttpServer())
      .post('/purchases')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        vendorId,
        driverId,
        driverCharge: 1500,
        weightKg: 1500,
        ratePerKg: 300,
        paymentMode: PaymentMode.UDHAR,
        notes: 'Inflow workflow test purchase',
      })
      .expect(201);
    purchaseId = purchaseRes.body.id;
    expect(purchaseId).toBeDefined();
    expect(Number(purchaseRes.body.purchaseAmount)).toBe(450000);

    // Verify Vendor Balance increases to 450,000
    const vendorAfterPurchase = await request(app.getHttpServer())
      .get(`/vendors/${vendorId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(Number(vendorAfterPurchase.body.currentBalance)).toBe(450000);

    // -------------------------------------------------------------
    // STEP 3: OUTFLOW TRANSACTION (SALES INVOICE)
    // -------------------------------------------------------------
    // We sell 1000 kg of poultry to the customer at Rs 350 per kg on credit (UDHAR).
    // Total revenue = 350,000.
    // Stock is sufficient because step 2 added 1500 kg of inventory.
    const invoiceRes = await request(app.getHttpServer())
      .post('/invoices')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        customerId,
        driverId,
        driverCharge: 1500,
        paymentMode: PaymentMode.UDHAR,
        items: [
          {
            description: 'Broiler Grade A',
            firstWeight: 1100, // Gross weight
            secondWeight: 100, // Crates weight
            ratePerKg: 350, // Net weight = 1000 kg. Cost = 350,000.
          },
        ],
        notes: 'Outflow workflow test sales',
      })
      .expect(201);
    invoiceId = invoiceRes.body.id;
    expect(invoiceId).toBeDefined();
    expect(Number(invoiceRes.body.totalAmount)).toBe(350000);

    // Verify Customer Balance increases to 350,000
    const customerAfterSale = await request(app.getHttpServer())
      .get(`/customers/${customerId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(Number(customerAfterSale.body.currentBalance)).toBe(350000);

    // -------------------------------------------------------------
    // STEP 4: CASH RECOVERY FROM CUSTOMER (RECOVERY VOUCHER)
    // -------------------------------------------------------------
    // The customer pays back Rs 150,000 cash.
    // Customer balance should drop to: 350,000 - 150,000 = 200,000.
    const recoveryRes = await request(app.getHttpServer())
      .post('/vouchers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        type: VoucherType.RECOVERY,
        customerId,
        amount: 150000,
        paymentMode: PaymentMode.CASH,
        narration: 'Workflow cash recovery customer payment',
      })
      .expect(201);
    recoveryVoucherId = recoveryRes.body.id;
    expect(recoveryVoucherId).toBeDefined();

    // Verify Customer Balance is reduced to 200,000
    const customerAfterRecovery = await request(app.getHttpServer())
      .get(`/customers/${customerId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(Number(customerAfterRecovery.body.currentBalance)).toBe(200000);

    // -------------------------------------------------------------
    // STEP 5: CASH PAYMENT TO VENDOR (DEBIT VOUCHER)
    // -------------------------------------------------------------
    // We pay the farmer vendor Rs 250,000 cash.
    // Vendor outstanding balance we owe should drop to: 450,000 - 250,000 = 200,000.
    const paymentRes = await request(app.getHttpServer())
      .post('/vouchers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        type: VoucherType.DEBIT,
        vendorId,
        amount: 250000,
        paymentMode: PaymentMode.CASH,
        narration: 'Workflow cash payout to supplier',
      })
      .expect(201);
    paymentVoucherId = paymentRes.body.id;
    expect(paymentVoucherId).toBeDefined();

    // Verify Vendor Balance drops to 200,000
    const vendorAfterPayment = await request(app.getHttpServer())
      .get(`/vendors/${vendorId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(Number(vendorAfterPayment.body.currentBalance)).toBe(200000);
  });
});
