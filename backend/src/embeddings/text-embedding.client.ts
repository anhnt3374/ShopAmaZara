import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { postJson } from './embeddings.http';

interface EmbedResponse {
  vectors: number[][];
  dim: number;
}

@Injectable()
export class TextEmbeddingClient {
  constructor(private readonly config: ConfigService) {}

  private get enabled(): boolean {
    return this.config.get<string>('EMBEDDINGS_ENABLED', 'true') !== 'false';
  }
  private get baseUrl(): string {
    return this.config.get<string>('TEXT_EMBED_URL', 'http://text-embed:8000');
  }
  private get batchSize(): number {
    return Number(this.config.get<string>('EMBED_BATCH_SIZE', '32'));
  }
  private get timeoutMs(): number {
    return Number(this.config.get<string>('EMBED_REQUEST_TIMEOUT_MS', '30000'));
  }

  async embed(texts: string[], opts: { isQuery?: boolean } = {}): Promise<number[][]> {
    if (!this.enabled) throw new Error('Embeddings disabled (EMBEDDINGS_ENABLED=false)');
    if (texts.length === 0) return [];
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += this.batchSize) {
      const batch = texts.slice(i, i + this.batchSize);
      const res = await postJson<EmbedResponse>(
        `${this.baseUrl}/embed`,
        { texts: batch, is_query: opts.isQuery ?? false },
        this.timeoutMs,
      );
      out.push(...res.vectors);
    }
    return out;
  }
}
