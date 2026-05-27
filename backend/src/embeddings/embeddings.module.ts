import { Module } from '@nestjs/common';
import { TextEmbeddingClient } from './text-embedding.client';
import { ImageEmbeddingClient } from './image-embedding.client';

@Module({
  providers: [TextEmbeddingClient, ImageEmbeddingClient],
  exports: [TextEmbeddingClient, ImageEmbeddingClient],
})
export class EmbeddingsModule {}
