
import { existsSync } from 'node:fs';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';

if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Global validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // CORS configuration
  app.enableCors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:3000',
  });

  // Swagger configuration
  const swaggerConfig = new DocumentBuilder()
    .setTitle('BrewLite API')
    .setDescription(
      'API documentation for BrewLite. Authenticate with a JWT access token using the Authorize button.',
    )
    .setVersion('1.0.0')
    .addTag('Health', 'Service status')
    .addTag('Authentication', 'Customer registration and login')
    .addTag('Products', 'Product catalog')
    .addTag('Inventory', 'Cart availability checks')
    .addTag('Orders', 'Customer orders')
    .addTag('Payments', 'Order payments and VNPay callbacks')
    .addTag('Staff', 'Staff inventory and order management')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Enter your JWT access token',
      },
      'access-token',
    )
    .build();

  const swaggerDocument = SwaggerModule.createDocument(
    app,
    swaggerConfig,
  );

  SwaggerModule.setup('api-docs', app, swaggerDocument, {
    swaggerOptions: { persistAuthorization: true },
    customSiteTitle: 'BrewLite API Docs',
  });

  // Start server
  await app.listen(process.env.PORT ?? 3001);
}

await bootstrap();
