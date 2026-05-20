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

const makeGateway = () => ({
  fanOutMessages: jest.fn(),
});

const makeChats = () => ({
  appendBotMessage: jest
    .fn()
    .mockResolvedValue({ id: 'm1', body: 'reply', contentBlocks: null }),
  loadRecentMessages: jest.fn().mockResolvedValue([]),
});

const onConfig =
  (entries: Record<string, string>) =>
  ({
    get: (k: string) => entries[k],
  }) as never;

const baseConfig = {
  AI_FEATURE_ENABLED: 'true',
  AI_MAX_HISTORY: '20',
  AI_RECURSION_LIMIT: '8',
};

describe('AiService.respond', () => {
  it('feature flag off → bot replies with the generic ack', async () => {
    const config = onConfig({ AI_FEATURE_ENABLED: 'false' });
    const chats = makeChats();
    const gateway = makeGateway();
    const graph = { invoke: jest.fn() };
    const svc = new AiService(
      config,
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

  it('feature flag on → invokes the graph and persists the final bot message', async () => {
    const config = onConfig(baseConfig);
    const chats = makeChats();
    const gateway = makeGateway();
    const graph = {
      invoke: jest.fn().mockResolvedValue({
        messages: [new AIMessage('Hello')],
        contentBlocks: [],
        pendingPreorder: null,
      }),
    };
    const svc = new AiService(
      config,
      chats as never,
      gateway as never,
      graph as never,
      new AiLogger(),
    );
    await svc.respond('u1', conv, 'hi');
    expect(graph.invoke).toHaveBeenCalled();
    expect(chats.appendBotMessage).toHaveBeenCalledWith('c1', 'Hello', null);
    expect(gateway.fanOutMessages).toHaveBeenCalled();
  });

  it('emits a fallback message when the graph throws', async () => {
    const config = onConfig(baseConfig);
    const chats = makeChats();
    const gateway = makeGateway();
    const graph = {
      invoke: jest.fn().mockRejectedValue(new Error('boom')),
    };
    const svc = new AiService(
      config,
      chats as never,
      gateway as never,
      graph as never,
      new AiLogger(),
    );
    await svc.respond('u1', conv, 'hello');
    expect(chats.appendBotMessage).toHaveBeenCalledWith(
      'c1',
      expect.stringMatching(/trouble/i),
      null,
    );
    expect(gateway.fanOutMessages).toHaveBeenCalled();
  });

  it('persists collected content blocks from tool side-channel', async () => {
    const config = onConfig(baseConfig);
    const chats = makeChats();
    const gateway = makeGateway();
    const graph = {
      invoke: jest.fn(async (_input: never, cfg: never) => {
        const c = cfg as { configurable: { pushBlock: (b: unknown) => void } };
        c.configurable.pushBlock({ type: 'toast', kind: 'info', text: 'side' });
        return {
          messages: [new AIMessage('done')],
          contentBlocks: [],
          pendingPreorder: null,
        };
      }),
    };
    const svc = new AiService(
      config,
      chats as never,
      gateway as never,
      graph as never,
      new AiLogger(),
    );
    await svc.respond('u1', conv, 'hello');
    expect(chats.appendBotMessage).toHaveBeenCalledWith('c1', 'done', [
      { type: 'toast', kind: 'info', text: 'side' },
    ]);
  });
});
