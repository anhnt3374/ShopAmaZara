import { ValidationPipe, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';

process.env.DATABASE_NAME = process.env.TEST_DATABASE_NAME ?? 'amazara_test';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret-do-not-use';
process.env.NODE_ENV = 'test';

export interface TestContext {
  app: INestApplication;
  dataSource: DataSource;
}

export async function createTestApp(): Promise<TestContext> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  await app.init();
  const dataSource = moduleRef.get(DataSource);
  return { app, dataSource };
}

export async function resetDatabase(dataSource: DataSource): Promise<void> {
  await dataSource.query('SET FOREIGN_KEY_CHECKS = 0');
  await dataSource.query('TRUNCATE TABLE order_items');
  await dataSource.query('TRUNCATE TABLE orders');
  await dataSource.query('TRUNCATE TABLE cart_items');
  await dataSource.query('TRUNCATE TABLE wishlist_items');
  await dataSource.query('TRUNCATE TABLE products');
  await dataSource.query('TRUNCATE TABLE stores');
  await dataSource.query('TRUNCATE TABLE user_addresses');
  await dataSource.query('TRUNCATE TABLE messages');
  await dataSource.query('TRUNCATE TABLE conversations');
  await dataSource.query('TRUNCATE TABLE users');
  await dataSource.query('SET FOREIGN_KEY_CHECKS = 1');
}
