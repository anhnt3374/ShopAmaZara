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
  emitDelta: jest.fn(),
  emitDone: jest.fn(),
  emitError: jest.fn(),
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
  it('feature flag off → bot replies with echo fallback', async () => {
    const config = onConfig({ AI_FEATURE_ENABLED: 'false' });
    const chats = makeChats();
    const gateway = makeGateway();
    const graph = { invoke: jest.fn(), streamEvents: jest.fn() };
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
    expect(graph.streamEvents).not.toHaveBeenCalled();
    expect(gateway.fanOutMessages).toHaveBeenCalled();
  });

  it('streams token deltas via gateway.emitDelta and persists the buffered text', async () => {
    const config = onConfig(baseConfig);
    const chats = makeChats();
    const gateway = makeGateway();
    async function* fake() {
      yield {
        event: 'on_chat_model_stream',
        data: { chunk: { content: 'Hel' } },
      };
      yield {
        event: 'on_chat_model_stream',
        data: { chunk: { content: 'lo' } },
      };
      yield {
        event: 'on_chain_end',
        name: 'LangGraph',
        data: {
          output: {
            messages: [new AIMessage('Hello')],
            contentBlocks: [],
            pendingPreorder: null,
          },
        },
      };
    }
    const graph = {
      streamEvents: jest.fn(() => fake()),
      invoke: jest.fn(),
    };
    const svc = new AiService(
      config,
      chats as never,
      gateway as never,
      graph as never,
      new AiLogger(),
    );
    await svc.respond('u1', conv, 'hi');
    expect(gateway.emitDelta).toHaveBeenNthCalledWith(
      1,
      'u1',
      'c1',
      expect.any(String),
      'Hel',
    );
    expect(gateway.emitDelta).toHaveBeenNthCalledWith(
      2,
      'u1',
      'c1',
      expect.any(String),
      'lo',
    );
    expect(chats.appendBotMessage).toHaveBeenCalledWith('c1', 'Hello', null);
    expect(gateway.emitDone).toHaveBeenCalled();
  });

  it('falls back to graph.invoke when streamEvents is unavailable', async () => {
    const config = onConfig(baseConfig);
    const chats = makeChats();
    const gateway = makeGateway();
    const graph = {
      invoke: jest.fn().mockResolvedValue({
        messages: [new AIMessage('reply')],
        contentBlocks: [],
        pendingPreorder: null,
      }),
      // no streamEvents
    };
    const svc = new AiService(
      config,
      chats as never,
      gateway as never,
      graph as never,
      new AiLogger(),
    );
    await svc.respond('u1', conv, 'hello');
    expect(graph.invoke).toHaveBeenCalled();
    expect(chats.appendBotMessage).toHaveBeenCalledWith('c1', 'reply', null);
  });

  it('emits a fallback message + error when streamEvents throws', async () => {
    const config = onConfig(baseConfig);
    const chats = makeChats();
    const gateway = makeGateway();
    const graph = {
      streamEvents: jest.fn(() => {
        throw new Error('boom');
      }),
      invoke: jest.fn(),
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
    expect(gateway.emitError).toHaveBeenCalled();
    expect(gateway.emitDone).toHaveBeenCalled();
  });

  it('persists collected content blocks from tool side-channel', async () => {
    const config = onConfig(baseConfig);
    const chats = makeChats();
    const gateway = makeGateway();
    async function* fake(cfg: { configurable: { pushBlock: (b: unknown) => void } }) {
      cfg.configurable.pushBlock({ type: 'toast', kind: 'info', text: 'side' });
      yield {
        event: 'on_chain_end',
        name: 'LangGraph',
        data: {
          output: {
            messages: [new AIMessage('done')],
            contentBlocks: [],
            pendingPreorder: null,
          },
        },
      };
    }
    const graph = {
      streamEvents: jest.fn((_input: never, cfg: never) => fake(cfg)),
      invoke: jest.fn(),
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
