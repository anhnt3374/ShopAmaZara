import { Module } from '@nestjs/common';
import { TextEmbeddingClient } from './text-embedding.client';
import { ImageEmbeddingClient } from './image-embedding.client';
import { EmbeddingWarmupService } from './embedding-warmup.service';

@Module({
  providers: [TextEmbeddingClient, ImageEmbeddingClient, EmbeddingWarmupService],
  exports: [TextEmbeddingClient, ImageEmbeddingClient],
})
export class EmbeddingsModule {}
