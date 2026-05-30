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
