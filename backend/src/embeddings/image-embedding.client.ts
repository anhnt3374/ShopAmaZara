import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { postJson } from './embeddings.http';

interface ImageEmbedResponse {
  vectors: number[][];
  dim: number;
  failed: number[];
}
interface TextEmbedResponse {
  vectors: number[][];
  dim: number;
}

@Injectable()
export class ImageEmbeddingClient {
  constructor(private readonly config: ConfigService) {}

  private get enabled(): boolean {
    return this.config.get<string>('EMBEDDINGS_ENABLED', 'true') !== 'false';
  }
  private get baseUrl(): string {
    return this.config.get<string>('IMAGE_EMBED_URL', 'http://image-embed:8000');
  }
  private get batchSize(): number {
    const n = Number(this.config.get<string>('EMBED_BATCH_SIZE', '32'));
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 32;
  }
  private get timeoutMs(): number {
    const n = Number(this.config.get<string>('EMBED_REQUEST_TIMEOUT_MS', '30000'));
    return Number.isFinite(n) && n > 0 ? n : 30000;
  }

  async embedImages(urls: string[]): Promise<{ vectors: number[][]; failed: number[] }> {
    if (!this.enabled) throw new Error('Embeddings disabled (EMBEDDINGS_ENABLED=false)');
    if (urls.length === 0) return { vectors: [], failed: [] };
    const { baseUrl, batchSize, timeoutMs } = this;
    const vectors: number[][] = [];
    const failed: number[] = [];
    for (let i = 0; i < urls.length; i += batchSize) {
      const batch = urls.slice(i, i + batchSize);
      const res = await postJson<ImageEmbedResponse>(
        `${baseUrl}/embed/image`,
        { image_urls: batch },
        timeoutMs,
      );
      vectors.push(...res.vectors);
      for (const f of res.failed ?? []) failed.push(i + f); // service indices are batch-relative
    }
    return { vectors, failed };
  }

  // CLIP text encoder on the image service — embeds text into the image model's
  // shared space (used to match a text query against product images).
  async embedText(texts: string[]): Promise<number[][]> {
    if (!this.enabled) throw new Error('Embeddings disabled (EMBEDDINGS_ENABLED=false)');
    if (texts.length === 0) return [];
    const { baseUrl, batchSize, timeoutMs } = this;
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const res = await postJson<TextEmbedResponse>(
        `${baseUrl}/embed/text`,
        { texts: batch },
        timeoutMs,
      );
      out.push(...res.vectors);
    }
    return out;
  }
}
