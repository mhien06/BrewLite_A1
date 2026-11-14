
import { existsSync } from 'node:fs';
import { connect as connectTls } from 'node:tls';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';

if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

const networkLogger = new Logger('VnpayNetworkCheck');

/**
 * Kiểm tra kết nối TLS qua cổng 443.
 * Không gửi HTTP, Refund hoặc dữ liệu thanh toán.
 * Chỉ dùng tạm thời để chẩn đoán kết nối mạng.
 */
function checkHttpsConnection(host: string): Promise<void> {
  return new Promise((resolve) => {
    let finished = false;

    const socket = connectTls({
      host,
      port: 443,
      servername: host,
      timeout: 8_000,
    });

    const finish = (result: string, succeeded: boolean) => {
      if (finished) return;
      finished = true;

      if (succeeded) {
        networkLogger.log(`[NETWORK CHECK] ${host}: ${result}`);
      } else {
        networkLogger.warn(`[NETWORK CHECK] ${host}: ${result}`);
      }

      socket.destroy();
      resolve();
    };

    socket.once('secureConnect', () => {
      finish('SUCCESS', true);
    });

    socket.once('timeout', () => {
      finish('TIMEOUT', false);
    });

    socket.once('error', (error: NodeJS.ErrnoException) => {
      const code = error.code ?? 'UNKNOWN';
      finish(`ERROR ${code}`, false);
    });
  });
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
  const allowedOrigins = new Set([
    process.env.FRONTEND_URL ?? 'http://localhost:3000',
    'http://localhost:3004',
  ]);
  app.enableCors({
    origin(
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) {
      // Requests without Origin are server-to-server/health checks.
      callback(null, !origin || allowedOrigins.has(origin));
    },
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

  // Chỉ kiểm tra kết nối, không gọi API Refund/QueryDR.
  void Promise.all([
    checkHttpsConnection('sandbox.vnpayment.vn'),
    checkHttpsConnection('example.com'),
  ]);
}

await bootstrap();
