import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';

describe('VendorsController (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let createdVendorId: number;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    await app.init();

    // Login as Admin to get Admin JWT
    const adminLoginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'admin@jahania.com',
        password: 'admin123',
      });
    adminToken = adminLoginRes.body.accessToken;
  });

  afterAll(async () => {
    if (createdVendorId) {
      await request(app.getHttpServer())
        .delete(`/vendors/${createdVendorId}`)
        .set('Authorization', `Bearer ${adminToken}`);
    }
    await app.close();
  });

  describe('GET /vendors', () => {
    it('should return a list of vendors if authorized', async () => {
      const res = await request(app.getHttpServer())
        .get('/vendors')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('POST /vendors', () => {
    it('should create a new vendor successfully', async () => {
      const res = await request(app.getHttpServer())
        .post('/vendors')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'E2E Test Vendor',
          contact: '0300-7654321',
          address: 'E2E Vendor City',
          openingBalance: 1000,
        })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body.name).toBe('E2E Test Vendor');
      createdVendorId = res.body.id;
    });
  });

  describe('GET /vendors/:id', () => {
    it('should retrieve vendor details', async () => {
      const res = await request(app.getHttpServer())
        .get(`/vendors/${createdVendorId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.id).toBe(createdVendorId);
      expect(res.body.name).toBe('E2E Test Vendor');
    });
  });

  describe('PATCH /vendors/:id', () => {
    it('should update vendor details', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/vendors/${createdVendorId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'E2E Test Vendor Updated',
          address: 'Updated Vendor City',
        })
        .expect(200);

      expect(res.body.name).toBe('E2E Test Vendor Updated');
      expect(res.body.address).toBe('Updated Vendor City');
    });
  });

  describe('DELETE /vendors/:id', () => {
    it('should successfully delete vendor', async () => {
      await request(app.getHttpServer())
        .delete(`/vendors/${createdVendorId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      createdVendorId = 0; // Prevent duplicate deletion in afterAll
    });
  });
});
