import { AiService } from './ai.service';
import { AiLogger } from './ai.logger';
import { AIMessage } from '@langchain/core/messages';
import type { Conversation } from '../chats/conversation.entity';

const conv: Conversation = {
  id: 'c1',
  kind: 'system',
  buyerId: 'u1',
  storeId: null,
} as Conversation;

const makeService = (overrides: Record<string, unknown> = {}) => {
  const config = {
    get: (k: string) =>
      ({
        AI_FEATURE_ENABLED: 'true',
        AI_MAX_HISTORY: '20',
        AI_RECURSION_LIMIT: '8',
      } as Record<string, string>)[k] ?? undefined,
  };
  const chats = {
    appendBotMessage: jest
      .fn()
      .mockResolvedValue({ id: 'm1', body: 'reply', contentBlocks: null }),
    loadRecentMessages: jest.fn().mockResolvedValue([]),
  };
  const gateway = { fanOutMessages: jest.fn() };
  const graph = {
    invoke: jest.fn().mockResolvedValue({
      messages: [new AIMessage('reply')],
      contentBlocks: [],
      pendingPreorder: null,
    }),
  };
  const svc = new AiService(
    { ...config, ...(overrides.config ?? {}) } as never,
    (overrides.chats ?? chats) as never,
    (overrides.gateway ?? gateway) as never,
    (overrides.graph ?? graph) as never,
    new AiLogger(),
  );
  return { svc, chats, gateway, graph };
};

describe('AiService.respond', () => {
  it('feature flag off → bot replies with echo fallback', async () => {
    const config = { get: () => 'false' };
    const chats = {
      appendBotMessage: jest.fn().mockResolvedValue({ id: 'm1' }),
      loadRecentMessages: jest.fn(),
    };
    const gateway = { fanOutMessages: jest.fn() };
    const graph = { invoke: jest.fn() };
    const svc = new AiService(
      config as never,
      chats as never,
      gateway as never,
      graph as never,
      new AiLogger(),
    );
    await svc.respond('u1', conv, 'hello');
    expect(chats.appendBotMessage).toHaveBeenCalledWith(
      'c1',
      expect.stringMatching(/received your message/i),
      null,
    );
    expect(graph.invoke).not.toHaveBeenCalled();
    expect(gateway.fanOutMessages).toHaveBeenCalled();
  });

  it('feature flag on → invokes the graph and persists final bot message', async () => {
    const { svc, chats, gateway, graph } = makeService();
    await svc.respond('u1', conv, 'hello');
    expect(graph.invoke).toHaveBeenCalled();
    expect(chats.appendBotMessage).toHaveBeenCalledWith('c1', 'reply', null);
    expect(gateway.fanOutMessages).toHaveBeenCalled();
  });

  it('emits a fallback message when the graph throws', async () => {
    const { svc, chats, gateway } = makeService({
      graph: { invoke: jest.fn().mockRejectedValue(new Error('boom')) },
    });
    await svc.respond('u1', conv, 'hello');
    expect(chats.appendBotMessage).toHaveBeenCalledWith(
      'c1',
      expect.stringMatching(/trouble/i),
      null,
    );
    expect(gateway.fanOutMessages).toHaveBeenCalled();
  });

  it('persists collected content blocks from tool side-channel', async () => {
    const config = {
      get: (k: string) =>
        ({
          AI_FEATURE_ENABLED: 'true',
          AI_MAX_HISTORY: '20',
          AI_RECURSION_LIMIT: '8',
        } as Record<string, string>)[k] ?? undefined,
    };
    const chats = {
      appendBotMessage: jest.fn().mockResolvedValue({ id: 'm1' }),
      loadRecentMessages: jest.fn().mockResolvedValue([]),
    };
    const gateway = { fanOutMessages: jest.fn() };
    const graph = {
      invoke: jest.fn().mockImplementation(async (_state: never, cfg: never) => {
        const ctx = (cfg as { configurable: { pushBlock: (b: unknown) => void } })
          .configurable;
        ctx.pushBlock({ type: 'toast', kind: 'info', text: 'side' });
        return {
          messages: [new AIMessage('done')],
          contentBlocks: [],
          pendingPreorder: null,
        };
      }),
    };
    const svc = new AiService(
      config as never,
      chats as never,
      gateway as never,
      graph as never,
      new AiLogger(),
    );
    await svc.respond('u1', conv, 'hello');
    expect(chats.appendBotMessage).toHaveBeenCalledWith(
      'c1',
      'done',
      [{ type: 'toast', kind: 'info', text: 'side' }],
    );
  });
});
