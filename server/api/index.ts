import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ExpressAdapter } from '@nestjs/platform-express';
import express from 'express';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';

const expressApp = express();
const adapter = new ExpressAdapter(expressApp);

let app: any;

async function bootstrap() {
  if (!app) {
    app = await NestFactory.create(AppModule, adapter);
    
    // Enable Helmet for secure HTTP headers on Vercel
    app.use(helmet());
    
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    
    // Secure CORS configuration
    const frontendUrl = process.env.FRONTEND_URL;
    app.enableCors({
      origin: frontendUrl ? frontendUrl.split(',') : true,
      credentials: true,
    });
    
    await app.init();
  }
  return expressApp;
}

export default async (req: any, res: any) => {
  const server = await bootstrap();
  server(req, res);
};
