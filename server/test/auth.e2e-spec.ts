import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';

describe('AuthController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const loginAsAdmin = () =>
    request(app.getHttpServer()).post('/auth/login').send({
      email: 'admin@jahania.com',
      password: 'admin123',
    });

  describe('POST /auth/login', () => {
    it('should login successfully with correct credentials', async () => {
      const response = await loginAsAdmin().expect(201);

      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.email).toBe('admin@jahania.com');
      expect(response.body.user.role).toBe('ADMIN');
    });

    it('should fail with invalid credentials', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'admin@jahania.com',
          password: 'wrongpassword',
        })
        .expect(401);
    });

    it('should fail validation when fields are missing', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'not-an-email',
        })
        .expect(400);
    });
  });

  describe('GET /auth/me', () => {
    it('should fail when no authorization header is provided', async () => {
      await request(app.getHttpServer()).get('/auth/me').expect(401);
    });

    it('should successfully return profile when a valid token is provided', async () => {
      // Login to get a token
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'admin@jahania.com',
          password: 'admin123',
        });

      const token = loginRes.body.accessToken;

      const profileRes = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(profileRes.body).toHaveProperty('email');
      expect(profileRes.body.email).toBe('admin@jahania.com');
      expect(profileRes.body).toHaveProperty('role');
      expect(profileRes.body.role).toBe('ADMIN');
    });
  });

  describe('POST /auth/login after deactivation', () => {
    it('should reject a token after the user has been deactivated', async () => {
      const adminLogin = await loginAsAdmin().expect(201);
      const adminToken = adminLogin.body.accessToken as string;
      const uniqueEmail = `revoked-${Date.now()}@example.com`;

      const createRes = await request(app.getHttpServer())
        .post('/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Revoked User',
          email: uniqueEmail,
          password: 'secret123',
          role: 'DATA_ENTRY',
        })
        .expect(201);

      const userLogin = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: uniqueEmail,
          password: 'secret123',
        })
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/users/${createRes.body.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${userLogin.body.accessToken}`)
        .expect(401);

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: uniqueEmail,
          password: 'secret123',
        })
        .expect(401);
    });
  });
});

describe('AuthController throttling (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should return 429 after repeated failed login attempts', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'admin@jahania.com',
          password: `wrong-${attempt}`,
        })
        .expect(401);
    }

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'admin@jahania.com',
        password: 'wrong-final',
      })
      .expect(429);
  });
});
