# Embedding Service Warmup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep both ML embedding models warm by having the backend issue periodic mock embed calls, so real requests rarely hit a cold (lazily-loaded) model.

**Architecture:** A new `EmbeddingWarmupService` provider in `EmbeddingsModule` schedules an initial warmup a few seconds after startup, then self-reschedules on a fixed interval (recursive `setTimeout`). Each warmup fires the existing text and image clients in parallel via `Promise.allSettled`, swallowing failures. Config and a master switch come from env via `ConfigService`. Lifecycle is managed through `OnModuleInit`/`OnModuleDestroy`.

**Tech Stack:** NestJS 10, TypeScript, Jest (with fake timers).

---

### Task 1: EmbeddingWarmupService — schedule, run, swallow, teardown

**Files:**
- Create: `backend/src/embeddings/embedding-warmup.service.ts`
- Test: `backend/src/embeddings/embedding-warmup.service.spec.ts`
- Modify: `backend/src/embeddings/embeddings.module.ts`

The service depends on the existing `TextEmbeddingClient` and `ImageEmbeddingClient` (same module) and `ConfigService`. Tests follow the existing client-spec style: a plain `makeConfig` object mock and direct `new` instantiation (no Nest `TestingModule`), with Jest fake timers for the scheduling.

- [ ] **Step 1: Write the failing test**

Create `backend/src/embeddings/embedding-warmup.service.spec.ts`:

```typescript
import { EmbeddingWarmupService } from './embedding-warmup.service';

function makeConfig(overrides: Record<string, string> = {}) {
  const values: Record<string, string> = {
    EMBEDDINGS_ENABLED: 'true',
    EMBED_WARMUP_ENABLED: 'true',
    EMBED_WARMUP_DELAY_MS: '5000',
    EMBED_WARMUP_INTERVAL_MS: '300000',
    ...overrides,
  };
  return { get: (key: string, def?: string) => values[key] ?? def } as any;
}

function makeClients() {
  const text = { embed: jest.fn().mockResolvedValue([[1]]) };
  const image = { embedText: jest.fn().mockResolvedValue([[1]]) };
  return { text, image };
}

// Let any pending microtasks (the awaited Promise.allSettled) settle.
const flush = () => Promise.resolve().then(() => Promise.resolve());

describe('EmbeddingWarmupService', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('does not call clients before the delay elapses', () => {
    const { text, image } = makeClients();
    const svc = new EmbeddingWarmupService(text as any, image as any, makeConfig());
    svc.onModuleInit();

    jest.advanceTimersByTime(4999);
    expect(text.embed).not.toHaveBeenCalled();
    expect(image.embedText).not.toHaveBeenCalled();
    svc.onModuleDestroy();
  });

  it('warms both services after the delay', async () => {
    const { text, image } = makeClients();
    const svc = new EmbeddingWarmupService(text as any, image as any, makeConfig());
    svc.onModuleInit();

    jest.advanceTimersByTime(5000);
    await flush();

    expect(text.embed).toHaveBeenCalledWith(['warm'], { isQuery: true });
    expect(image.embedText).toHaveBeenCalledWith(['warm']);
    svc.onModuleDestroy();
  });

  it('re-warms after each interval', async () => {
    const { text, image } = makeClients();
    const svc = new EmbeddingWarmupService(text as any, image as any, makeConfig());
    svc.onModuleInit();

    jest.advanceTimersByTime(5000);
    await flush();
    jest.advanceTimersByTime(300000);
    await flush();

    expect(text.embed).toHaveBeenCalledTimes(2);
    expect(image.embedText).toHaveBeenCalledTimes(2);
    svc.onModuleDestroy();
  });

  it('swallows a failing client call and still schedules the next run', async () => {
    const { text, image } = makeClients();
    text.embed.mockRejectedValue(new Error('service down'));
    const svc = new EmbeddingWarmupService(text as any, image as any, makeConfig());
    svc.onModuleInit();

    jest.advanceTimersByTime(5000);
    await flush();
    expect(image.embedText).toHaveBeenCalledTimes(1); // ran despite text failing

    jest.advanceTimersByTime(300000);
    await flush();
    expect(image.embedText).toHaveBeenCalledTimes(2); // next run still scheduled
    svc.onModuleDestroy();
  });

  it('onModuleDestroy cancels the pending timer', async () => {
    const { text, image } = makeClients();
    const svc = new EmbeddingWarmupService(text as any, image as any, makeConfig());
    svc.onModuleInit();

    jest.advanceTimersByTime(5000);
    await flush();
    expect(text.embed).toHaveBeenCalledTimes(1);

    svc.onModuleDestroy();
    jest.advanceTimersByTime(300000);
    await flush();
    expect(text.embed).toHaveBeenCalledTimes(1); // no further runs
  });

  it('does not schedule when warmup is disabled', () => {
    const { text, image } = makeClients();
    const svc = new EmbeddingWarmupService(
      text as any,
      image as any,
      makeConfig({ EMBED_WARMUP_ENABLED: 'false' }),
    );
    svc.onModuleInit();

    jest.advanceTimersByTime(1_000_000);
    expect(text.embed).not.toHaveBeenCalled();
    expect(image.embedText).not.toHaveBeenCalled();
    svc.onModuleDestroy();
  });

  it('does not schedule when embeddings are disabled', () => {
    const { text, image } = makeClients();
    const svc = new EmbeddingWarmupService(
      text as any,
      image as any,
      makeConfig({ EMBEDDINGS_ENABLED: 'false' }),
    );
    svc.onModuleInit();

    jest.advanceTimersByTime(1_000_000);
    expect(text.embed).not.toHaveBeenCalled();
    svc.onModuleDestroy();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npx jest src/embeddings/embedding-warmup.service.spec.ts`
Expected: FAIL — `Cannot find module './embedding-warmup.service'`.

- [ ] **Step 3: Write minimal implementation**

Create `backend/src/embeddings/embedding-warmup.service.ts`:

```typescript
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
        this.log.warn(`Warmup failed for ${labels[i]}: ${r.reason}`);
      }
    });
    if (results.every((r) => r.status === 'fulfilled')) {
      this.log.debug('Embedding services warmed');
    }
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && npx jest src/embeddings/embedding-warmup.service.spec.ts`
Expected: PASS — all 7 tests green.

- [ ] **Step 5: Register the service in the module**

Modify `backend/src/embeddings/embeddings.module.ts` to:

```typescript
import { Module } from '@nestjs/common';
import { TextEmbeddingClient } from './text-embedding.client';
import { ImageEmbeddingClient } from './image-embedding.client';
import { EmbeddingWarmupService } from './embedding-warmup.service';

@Module({
  providers: [TextEmbeddingClient, ImageEmbeddingClient, EmbeddingWarmupService],
  exports: [TextEmbeddingClient, ImageEmbeddingClient],
})
export class EmbeddingsModule {}
```

- [ ] **Step 6: Build to verify wiring compiles**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add backend/src/embeddings/embedding-warmup.service.ts \
  backend/src/embeddings/embedding-warmup.service.spec.ts \
  backend/src/embeddings/embeddings.module.ts
git commit -m "feat(search): periodic warmup for embedding services"
```

---

### Task 2: Document env vars and the feature

**Files:**
- Modify: `backend/.env.example`
- Modify: `CLAUDE.md`
- Create: `docs/features/embedding-warmup.md`
- Modify: `docs/README.md`

- [ ] **Step 1: Add env vars to `backend/.env.example`**

Append near the existing embedding/`TEXT_EMBED_URL` settings (create the lines if no embedding block exists):

```
# Embedding model warmup (keep models loaded against idle cold-starts)
EMBED_WARMUP_ENABLED=true
EMBED_WARMUP_DELAY_MS=5000
EMBED_WARMUP_INTERVAL_MS=300000
```

- [ ] **Step 2: Document the env vars in `CLAUDE.md`**

In the Backend env-vars list under "Environment variables", add a bullet:

```
- Embedding warmup: `EMBED_WARMUP_ENABLED` (default true), `EMBED_WARMUP_DELAY_MS` (default 5000), `EMBED_WARMUP_INTERVAL_MS` (default 300000)
```

- [ ] **Step 3: Write the feature doc**

Create `docs/features/embedding-warmup.md`:

```markdown
# Embedding service warmup

Both ML embedding services (`text-embed`, `image-embed`) load their models
lazily on the first request, so the first search/index after startup or a long
idle period pays the model-load cost.

`EmbeddingWarmupService` (in `backend/src/embeddings/`) keeps them warm: a few
seconds after the backend starts it issues a mock embed to both services
(`text.embed(['warm'])` and the CLIP text path `image.embedText(['warm'])`),
then repeats on a fixed interval. Runs fire both services in parallel and
swallow failures (logged at `warn`) so warmup never destabilizes the API.

## Configuration

| Variable                   | Default  | Meaning                                        |
|----------------------------|----------|------------------------------------------------|
| `EMBED_WARMUP_ENABLED`     | `true`   | Master switch. Also skipped if `EMBEDDINGS_ENABLED=false`. |
| `EMBED_WARMUP_DELAY_MS`    | `5000`   | Delay after startup before the first warmup.    |
| `EMBED_WARMUP_INTERVAL_MS` | `300000` | Interval between warmups (5 min).               |
```

- [ ] **Step 4: Add a row to the completed-features table in `docs/README.md`**

Add a row matching the existing table's columns, e.g.:

```
| Embedding warmup | Periodic mock embeds keep ML models loaded | [embedding-warmup.md](features/embedding-warmup.md) |
```

(Match the actual column count/format of the table already in `docs/README.md`.)

- [ ] **Step 5: Commit**

```bash
git add backend/.env.example CLAUDE.md docs/features/embedding-warmup.md docs/README.md
git commit -m "docs(search): document embedding warmup config and feature"
```

---

### Task 3: Full verification

- [ ] **Step 1: Run the embeddings test suite**

Run: `cd backend && npx jest src/embeddings`
Expected: PASS — warmup + both client specs green.

- [ ] **Step 2: Typecheck the whole backend**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors.
