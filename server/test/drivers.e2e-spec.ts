import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';

describe('DriversController (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let createdDriverId: number;

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
    if (createdDriverId) {
      await request(app.getHttpServer())
        .delete(`/drivers/${createdDriverId}`)
        .set('Authorization', `Bearer ${adminToken}`);
    }
    await app.close();
  });

  describe('GET /drivers', () => {
    it('should return a list of drivers if authorized', async () => {
      const res = await request(app.getHttpServer())
        .get('/drivers')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('POST /drivers', () => {
    it('should create a new driver successfully', async () => {
      const res = await request(app.getHttpServer())
        .post('/drivers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'E2E Test Driver',
          contact: '0300-1234567',
          vehicleType: 'Mazda',
          defaultCharge: 2000,
        })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body.name).toBe('E2E Test Driver');
      createdDriverId = res.body.id;
    });
  });

  describe('GET /drivers/:id', () => {
    it('should retrieve driver details', async () => {
      const res = await request(app.getHttpServer())
        .get(`/drivers/${createdDriverId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.id).toBe(createdDriverId);
      expect(res.body.name).toBe('E2E Test Driver');
    });
  });

  describe('PATCH /drivers/:id', () => {
    it('should update driver details', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/drivers/${createdDriverId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'E2E Test Driver Updated',
          vehicleType: 'Suzuki',
        })
        .expect(200);

      expect(res.body.name).toBe('E2E Test Driver Updated');
      expect(res.body.vehicleType).toBe('Suzuki');
    });
  });

  describe('DELETE /drivers/:id', () => {
    it('should successfully delete driver', async () => {
      await request(app.getHttpServer())
        .delete(`/drivers/${createdDriverId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      createdDriverId = 0; // Prevent duplicate deletion in afterAll
    });
  });
});
