import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QdrantClient } from '@qdrant/js-client-rest';
import { Review } from '../reviews/review.entity';
import { EmbeddingsModule } from '../embeddings/embeddings.module';
import { ProductIndexerService } from './product-indexer.service';
import { QDRANT_CLIENT, QdrantService } from './qdrant.service';

@Module({
  imports: [EmbeddingsModule, TypeOrmModule.forFeature([Review])],
  providers: [
    {
      provide: QDRANT_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new QdrantClient({ url: config.get<string>('QDRANT_URL', 'http://qdrant:6333') }),
    },
    QdrantService,
    ProductIndexerService,
  ],
  exports: [QdrantService, ProductIndexerService],
})
export class SearchModule {}
