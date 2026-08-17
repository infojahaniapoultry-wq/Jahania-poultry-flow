import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';

describe('CustomersController (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let entryToken: string;
  let createdCustomerId: number;

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

    // Login as Data Entry to get Data Entry JWT
    const entryLoginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'entry@jahania.com',
        password: 'entry123',
      });
    entryToken = entryLoginRes.body.accessToken;
  });

  afterAll(async () => {
    // Cleanup if customer was created and exists
    if (createdCustomerId) {
      await request(app.getHttpServer())
        .delete(`/customers/${createdCustomerId}`)
        .set('Authorization', `Bearer ${adminToken}`);
    }
    await app.close();
  });

  describe('GET /customers', () => {
    it('should fail if unauthorized', async () => {
      await request(app.getHttpServer()).get('/customers').expect(401);
    });

    it('should return a list of customers if authorized', async () => {
      const res = await request(app.getHttpServer())
        .get('/customers')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('POST /customers', () => {
    it('should create a new customer as Admin', async () => {
      const res = await request(app.getHttpServer())
        .post('/customers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          shopName: 'E2E Customer Test Admin',
          contact: '0300-9999999',
          address: 'E2E City Admin',
          openingBalance: 500,
        })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body.shopName).toBe('E2E Customer Test Admin');
      createdCustomerId = res.body.id;
    });

    it('should create a new customer as Data Entry', async () => {
      const res = await request(app.getHttpServer())
        .post('/customers')
        .set('Authorization', `Bearer ${entryToken}`)
        .send({
          shopName: 'E2E Customer Test Entry',
          contact: '0300-8888888',
          address: 'E2E City Entry',
          openingBalance: 100,
        })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body.shopName).toBe('E2E Customer Test Entry');

      // Cleanup this extra customer immediately
      await request(app.getHttpServer())
        .delete(`/customers/${res.body.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });

    it('should fail with missing shopName', async () => {
      await request(app.getHttpServer())
        .post('/customers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          contact: '0300-1111111',
        })
        .expect(400);
    });
  });

  describe('GET /customers/:id', () => {
    it('should retrieve a single customer details', async () => {
      const res = await request(app.getHttpServer())
        .get(`/customers/${createdCustomerId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.id).toBe(createdCustomerId);
      expect(res.body.shopName).toBe('E2E Customer Test Admin');
    });
  });

  describe('PATCH /customers/:id', () => {
    it('should update customer details as Admin', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/customers/${createdCustomerId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          shopName: 'E2E Customer Test Admin Updated',
          address: 'Updated City',
        })
        .expect(200);

      expect(res.body.shopName).toBe('E2E Customer Test Admin Updated');
      expect(res.body.address).toBe('Updated City');
    });

    it('should fail to update customer as Data Entry (roles check)', async () => {
      await request(app.getHttpServer())
        .patch(`/customers/${createdCustomerId}`)
        .set('Authorization', `Bearer ${entryToken}`)
        .send({
          shopName: 'Unauthorized Update Attempts',
        })
        .expect(403);
    });
  });

  describe('DELETE /customers/:id', () => {
    it('should fail to delete customer as Data Entry (roles check)', async () => {
      await request(app.getHttpServer())
        .delete(`/customers/${createdCustomerId}`)
        .set('Authorization', `Bearer ${entryToken}`)
        .expect(403);
    });

    it('should successfully delete customer as Admin', async () => {
      await request(app.getHttpServer())
        .delete(`/customers/${createdCustomerId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      // Prevent duplicate deletion in afterAll
      createdCustomerId = 0;
    });
  });
});
