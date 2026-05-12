import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { StoresModule } from './stores/stores.module';
import { User } from './users/user.entity';
import { Store } from './stores/store.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'mysql',
        host: config.get<string>('DATABASE_HOST', '127.0.0.1'),
        port: Number(config.get<string>('DATABASE_PORT', '3306')),
        username: config.get<string>('DATABASE_USER'),
        password: config.get<string>('DATABASE_PASSWORD'),
        database: config.get<string>('DATABASE_NAME'),
        entities: [User, Store],
        synchronize: process.env.NODE_ENV !== 'production',
        charset: 'utf8mb4',
      }),
    }),
    UsersModule,
    AuthModule,
    StoresModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
