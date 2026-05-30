import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TextEmbeddingClient } from './text-embedding.client';
import { ImageEmbeddingClient } from './image-embedding.client';

function posInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

// How long to wait for a service's HTTP server to start responding before
// giving up on this warmup pass. The model loads lazily on the warm call
// (which uses the longer warmupTimeoutMs); this budget only covers the server
// process coming up, which is quick.
const HEALTH_POLL_INTERVAL_MS = 3000;
const HEALTH_MAX_ATTEMPTS = 30; // ~90s for the container to start listening

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
  // Timeout for the warm embed call itself. Generous by default because the
  // first call triggers a cold model load (FG-CLIP downloads weights + loads
  // onto the GPU), which can take minutes.
  private get warmupTimeoutMs(): number {
    return posInt(this.config.get<string>('EMBED_WARMUP_TIMEOUT_MS', '300000'), 300000);
  }

  onModuleInit(): void {
    if (!this.enabled) {
      this.log.log('Embedding warmup disabled');
      return;
    }
    this.schedule(this.delayMs);
  }

  onModuleDestroy(): void {
    // Sleep timers inside waitReachable aren't tracked individually; the loops
    // check `stopped` after each sleep and bail, so setting the flag is enough
    // to stop further work. Clearing the scheduled-run timer prevents the next
    // pass from starting.
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
    const timeoutMs = this.warmupTimeoutMs;
    await Promise.allSettled([
      this.warmService(
        'text-embed',
        () => this.text.healthy(),
        () => this.text.embed(['warm'], { isQuery: true, timeoutMs }),
      ),
      this.warmService(
        'image-embed',
        () => this.image.healthy(),
        () => this.image.embedText(['warm'], { timeoutMs }),
      ),
    ]);
  }

  // Wait for the service to be reachable, then issue the warm call. The warm
  // call triggers the (possibly cold) lazy model load and waits up to
  // warmupTimeoutMs for it — so a slow first load no longer trips the short
  // per-request timeout and floods the logs with WARNs.
  private async warmService(
    label: string,
    healthy: () => Promise<boolean>,
    warm: () => Promise<unknown>,
  ): Promise<void> {
    if (!(await this.waitReachable(label, healthy))) {
      if (!this.stopped) this.log.warn(`Warmup skipped for ${label}: service did not come up`);
      return;
    }
    try {
      await warm();
      this.log.debug(`${label} warmed`);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      this.log.warn(`Warmup failed for ${label}: ${reason}`);
    }
  }

  private async waitReachable(label: string, healthy: () => Promise<boolean>): Promise<boolean> {
    for (let attempt = 1; attempt <= HEALTH_MAX_ATTEMPTS; attempt++) {
      if (this.stopped) return false;
      if (await healthy()) return true;
      this.log.debug(`Waiting for ${label} to come up (attempt ${attempt}/${HEALTH_MAX_ATTEMPTS})`);
      await this.sleep(HEALTH_POLL_INTERVAL_MS);
    }
    return false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
