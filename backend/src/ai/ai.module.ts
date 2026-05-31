import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ChatGroq } from '@langchain/groq';
import { AiService, AI_GRAPH } from './ai.service';
import { AiLogger } from './ai.logger';
import { PreorderRegistry } from './preorder-registry';
import { ChatsModule } from '../chats/chats.module';
import { ProductsModule } from '../products/products.module';
import { CartModule } from '../cart/cart.module';
import { WishlistModule } from '../wishlist/wishlist.module';
import { OrdersModule } from '../orders/orders.module';
import { ProductsService } from '../products/products.service';
import { CartService } from '../cart/cart.service';
import { WishlistService } from '../wishlist/wishlist.service';
import { OrdersService } from '../orders/orders.service';
import { buildGraph } from './graph/build-graph';
import { SYSTEM_PROMPT_EN } from './prompts/system.en';
import { makeSearchProductsTool } from './graph/tools/search-products.tool';
import { makeCompareProductsTool } from './graph/tools/compare-products.tool';
import { makeAddToCartTool } from './graph/tools/add-to-cart.tool';
import { makeRemoveFromCartTool } from './graph/tools/remove-from-cart.tool';
import { makeToggleWishlistTool } from './graph/tools/toggle-wishlist.tool';
import {
  makeCreatePreorderTool,
  makeConfirmOrderTool,
  makeCancelOrderTool,
} from './graph/tools/order-tools';
import { makeLookupOrderTool } from './graph/tools/lookup-order.tool';
import { makeSuggestSimilarTool } from './graph/tools/suggest-similar.tool';
import { makeGetPoliciesTool } from './graph/tools/get-policies.tool';

@Module({
  imports: [
    ConfigModule,
    ProductsModule,
    CartModule,
    WishlistModule,
    OrdersModule,
    forwardRef(() => ChatsModule),
  ],
  providers: [
    AiLogger,
    PreorderRegistry,
    {
      provide: AI_GRAPH,
      inject: [
        ConfigService,
        ProductsService,
        CartService,
        WishlistService,
        OrdersService,
        PreorderRegistry,
      ],
      useFactory: (
        config: ConfigService,
        products: ProductsService,
        cart: CartService,
        wishlist: WishlistService,
        orders: OrdersService,
        registry: PreorderRegistry,
      ) => {
        const tools = [
          makeSearchProductsTool({ products }),
          makeCompareProductsTool({ products }),
          makeAddToCartTool({ cart }),
          makeRemoveFromCartTool({ cart }),
          makeToggleWishlistTool({ wishlist }),
          makeCreatePreorderTool({ orders, registry }),
          makeConfirmOrderTool({ orders, registry }),
          makeCancelOrderTool({ orders }),
          makeLookupOrderTool({ orders }),
          makeSuggestSimilarTool({ products }),
          makeGetPoliciesTool(),
        ];
        const apiKey = config.get<string>('GROQ_API_KEY');
        const model = new ChatGroq({
          apiKey: apiKey || 'placeholder',
          model: config.get<string>('GROQ_MODEL') ?? 'openai/gpt-oss-120b',
          temperature: 0.3,
        });
        return buildGraph({
          model: model as never,
          tools: tools as never,
          systemPrompt: SYSTEM_PROMPT_EN,
        });
      },
    },
    AiService,
  ],
  exports: [AiService],
})
export class AiModule {}
