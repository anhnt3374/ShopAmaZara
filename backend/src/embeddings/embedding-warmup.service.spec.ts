import { EmbeddingWarmupService } from './embedding-warmup.service';

function makeConfig(overrides: Record<string, string> = {}) {
  const values: Record<string, string> = {
    EMBEDDINGS_ENABLED: 'true',
    EMBED_WARMUP_ENABLED: 'true',
    EMBED_WARMUP_DELAY_MS: '5000',
    EMBED_WARMUP_INTERVAL_MS: '300000',
    EMBED_WARMUP_TIMEOUT_MS: '300000',
    ...overrides,
  };
  return { get: (key: string, def?: string) => values[key] ?? def } as any;
}

function makeClients() {
  const text = {
    healthy: jest.fn().mockResolvedValue(true),
    embed: jest.fn().mockResolvedValue([[1]]),
  };
  const image = {
    healthy: jest.fn().mockResolvedValue(true),
    embedText: jest.fn().mockResolvedValue([[1]]),
  };
  return { text, image };
}

describe('EmbeddingWarmupService', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('does not touch the services before the delay elapses', async () => {
    const { text, image } = makeClients();
    const svc = new EmbeddingWarmupService(text as any, image as any, makeConfig());
    svc.onModuleInit();

    await jest.advanceTimersByTimeAsync(4999);
    expect(text.healthy).not.toHaveBeenCalled();
    expect(text.embed).not.toHaveBeenCalled();
    expect(image.embedText).not.toHaveBeenCalled();
    svc.onModuleDestroy();
  });

  it('health-checks then warms both services after the delay', async () => {
    const { text, image } = makeClients();
    const svc = new EmbeddingWarmupService(text as any, image as any, makeConfig());
    svc.onModuleInit();

    await jest.advanceTimersByTimeAsync(5000);

    expect(text.healthy).toHaveBeenCalled();
    expect(image.healthy).toHaveBeenCalled();
    expect(text.embed).toHaveBeenCalledWith(['warm'], { isQuery: true, timeoutMs: 300000 });
    expect(image.embedText).toHaveBeenCalledWith(['warm'], { timeoutMs: 300000 });
    svc.onModuleDestroy();
  });

  it('passes a custom EMBED_WARMUP_TIMEOUT_MS to the warm calls', async () => {
    const { text, image } = makeClients();
    const svc = new EmbeddingWarmupService(
      text as any,
      image as any,
      makeConfig({ EMBED_WARMUP_TIMEOUT_MS: '120000' }),
    );
    svc.onModuleInit();

    await jest.advanceTimersByTimeAsync(5000);
    expect(text.embed).toHaveBeenCalledWith(['warm'], { isQuery: true, timeoutMs: 120000 });
    expect(image.embedText).toHaveBeenCalledWith(['warm'], { timeoutMs: 120000 });
    svc.onModuleDestroy();
  });

  it('waits until a service is reachable before warming it', async () => {
    const { text, image } = makeClients();
    text.healthy
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValue(true);
    const svc = new EmbeddingWarmupService(text as any, image as any, makeConfig());
    svc.onModuleInit();

    await jest.advanceTimersByTimeAsync(5000); // delay fires; 1st probe = false
    expect(text.healthy).toHaveBeenCalledTimes(1);
    expect(text.embed).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(3000); // 2nd probe = false
    expect(text.healthy).toHaveBeenCalledTimes(2);
    expect(text.embed).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(3000); // 3rd probe = true -> warm
    expect(text.embed).toHaveBeenCalledTimes(1);
    svc.onModuleDestroy();
  });

  it('does not warm a service that never comes up (and does not throw)', async () => {
    const { text, image } = makeClients();
    text.healthy.mockResolvedValue(false); // never reachable
    const svc = new EmbeddingWarmupService(text as any, image as any, makeConfig());
    svc.onModuleInit();

    // Advance past the delay + the full health budget (30 * 3000ms).
    await jest.advanceTimersByTimeAsync(5000 + 30 * 3000 + 1000);
    expect(text.embed).not.toHaveBeenCalled();
    // The other service was reachable and still warmed.
    expect(image.embedText).toHaveBeenCalledTimes(1);
    svc.onModuleDestroy();
  });

  it('re-warms after each interval', async () => {
    const { text, image } = makeClients();
    const svc = new EmbeddingWarmupService(text as any, image as any, makeConfig());
    svc.onModuleInit();

    await jest.advanceTimersByTimeAsync(5000);
    await jest.advanceTimersByTimeAsync(300000);

    expect(text.embed).toHaveBeenCalledTimes(2);
    expect(image.embedText).toHaveBeenCalledTimes(2);
    svc.onModuleDestroy();
  });

  it('swallows a failing warm call and still schedules the next run', async () => {
    const { text, image } = makeClients();
    text.embed.mockRejectedValue(new Error('service down'));
    const svc = new EmbeddingWarmupService(text as any, image as any, makeConfig());
    svc.onModuleInit();

    await jest.advanceTimersByTimeAsync(5000);
    expect(image.embedText).toHaveBeenCalledTimes(1); // ran despite text failing

    await jest.advanceTimersByTimeAsync(300000);
    expect(image.embedText).toHaveBeenCalledTimes(2); // next run still scheduled
    svc.onModuleDestroy();
  });

  it('onModuleDestroy cancels the pending timer', async () => {
    const { text, image } = makeClients();
    const svc = new EmbeddingWarmupService(text as any, image as any, makeConfig());
    svc.onModuleInit();

    await jest.advanceTimersByTimeAsync(5000);
    expect(text.embed).toHaveBeenCalledTimes(1);

    svc.onModuleDestroy();
    await jest.advanceTimersByTimeAsync(300000);
    expect(text.embed).toHaveBeenCalledTimes(1); // no further runs
  });

  it('does not schedule when warmup is disabled', async () => {
    const { text, image } = makeClients();
    const svc = new EmbeddingWarmupService(
      text as any,
      image as any,
      makeConfig({ EMBED_WARMUP_ENABLED: 'false' }),
    );
    svc.onModuleInit();

    await jest.advanceTimersByTimeAsync(1_000_000);
    expect(text.healthy).not.toHaveBeenCalled();
    expect(text.embed).not.toHaveBeenCalled();
    expect(image.embedText).not.toHaveBeenCalled();
    svc.onModuleDestroy();
  });

  it('does not schedule when embeddings are disabled', async () => {
    const { text, image } = makeClients();
    const svc = new EmbeddingWarmupService(
      text as any,
      image as any,
      makeConfig({ EMBEDDINGS_ENABLED: 'false' }),
    );
    svc.onModuleInit();

    await jest.advanceTimersByTimeAsync(1_000_000);
    expect(text.healthy).not.toHaveBeenCalled();
    expect(text.embed).not.toHaveBeenCalled();
    svc.onModuleDestroy();
  });
});
