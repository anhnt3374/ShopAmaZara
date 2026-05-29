import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Store } from '../stores/store.entity';
import { StoresModule } from '../stores/stores.module';
import { Conversation } from './conversation.entity';
import { Message } from './message.entity';
import { ChatsService } from './chats.service';
import { ChatsController } from './chats.controller';
import { StoreChatsController } from './store-chats.controller';
import { ChatsGateway } from './chats.gateway';
import { SellerStoreGuard } from '../common/guards/seller-store.guard';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Conversation, Message, Store]),
    StoresModule,
    forwardRef(() => AiModule),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
      }),
    }),
  ],
  controllers: [ChatsController, StoreChatsController],
  providers: [ChatsService, ChatsGateway, SellerStoreGuard],
  exports: [ChatsService, ChatsGateway],
})
export class ChatsModule {}
