import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { StoresModule } from './stores/stores.module';
import { ProductsModule } from './products/products.module';
import { WishlistModule } from './wishlist/wishlist.module';
import { CartModule } from './cart/cart.module';
import { OrdersModule } from './orders/orders.module';
import { AddressesModule } from './addresses/addresses.module';
import { User } from './users/user.entity';
import { Store } from './stores/store.entity';
import { Product } from './products/product.entity';
import { WishlistItem } from './wishlist/wishlist-item.entity';
import { CartItem } from './cart/cart-item.entity';
import { Order } from './orders/order.entity';
import { OrderItem } from './orders/order-item.entity';
import { UserAddress } from './addresses/address.entity';
import { Conversation } from './chats/conversation.entity';
import { Message } from './chats/message.entity';
import { ChatsModule } from './chats/chats.module';
import { UploadsModule } from './uploads/uploads.module';
import { ReviewsModule } from './reviews/reviews.module';
import { Review } from './reviews/review.entity';
import { AiModule } from './ai/ai.module';
import { EmbeddingsModule } from './embeddings/embeddings.module';
import { SearchModule } from './search/search.module';
import { UserProductEvent } from './behavior/behavior-event.entity';
import { BehaviorModule } from './behavior/behavior.module';

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
        entities: [User, Store, Product, WishlistItem, CartItem, Order, OrderItem, UserAddress, Conversation, Message, Review, UserProductEvent],
        synchronize: process.env.NODE_ENV !== 'production',
        charset: 'utf8mb4',
      }),
    }),
    UsersModule,
    AuthModule,
    StoresModule,
    ProductsModule,
    WishlistModule,
    CartModule,
    OrdersModule,
    AddressesModule,
    ChatsModule,
    UploadsModule,
    ReviewsModule,
    AiModule,
    EmbeddingsModule,
    SearchModule,
    BehaviorModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
