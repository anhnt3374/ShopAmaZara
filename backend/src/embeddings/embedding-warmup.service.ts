import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TextEmbeddingClient } from './text-embedding.client';
import { ImageEmbeddingClient } from './image-embedding.client';

function posInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

@Injectable()
export class EmbeddingWarmupService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('EmbeddingWarmupService');
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  constructor(
    private readonly text: TextEmbeddingClient,
    private readonly image: ImageEmbeddingClient,
    private readonly config: ConfigService,
  ) {}

  private get enabled(): boolean {
    const embeddings = this.config.get<string>('EMBEDDINGS_ENABLED', 'true') !== 'false';
    const warmup = this.config.get<string>('EMBED_WARMUP_ENABLED', 'true') !== 'false';
    return embeddings && warmup;
  }
  private get delayMs(): number {
    return posInt(this.config.get<string>('EMBED_WARMUP_DELAY_MS', '5000'), 5000);
  }
  private get intervalMs(): number {
    return posInt(this.config.get<string>('EMBED_WARMUP_INTERVAL_MS', '300000'), 300000);
  }

  onModuleInit(): void {
    if (!this.enabled) {
      this.log.log('Embedding warmup disabled');
      return;
    }
    this.schedule(this.delayMs);
  }

  onModuleDestroy(): void {
    this.stopped = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  // Only reached when `enabled` is already true (checked in onModuleInit), so
  // the clients' own EMBEDDINGS_ENABLED guard never trips here.
  private schedule(ms: number): void {
    this.timer = setTimeout(() => {
      void this.warmOnce().finally(() => {
        if (!this.stopped) this.schedule(this.intervalMs);
      });
    }, ms);
  }

  private async warmOnce(): Promise<void> {
    const results = await Promise.allSettled([
      this.text.embed(['warm'], { isQuery: true }),
      this.image.embedText(['warm']),
    ]);
    const labels = ['text-embed', 'image-embed'];
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        const reason = r.reason instanceof Error ? r.reason.message : String(r.reason);
        this.log.warn(`Warmup failed for ${labels[i]}: ${reason}`);
      }
    });
    if (results.every((r) => r.status === 'fulfilled')) {
      this.log.debug('Embedding services warmed');
    }
  }
}
