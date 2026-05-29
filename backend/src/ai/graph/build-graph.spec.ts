import { buildGraph } from './build-graph';
import { AIMessage, HumanMessage } from '@langchain/core/messages';

describe('buildGraph', () => {
  it('routes to tools when last AI message has tool_calls, else ends', async () => {
    const tool = {
      name: 't',
      invoke: jest.fn().mockResolvedValue('{"ok":true}'),
    };
    const replies: AIMessage[] = [
      new AIMessage({
        content: '',
        tool_calls: [{ id: '1', name: 't', args: {} }],
      }),
      new AIMessage({ content: 'done' }),
    ];
    let i = 0;
    const model = {
      bindTools: () => ({ invoke: async () => replies[i++] }),
    };

    const graph = buildGraph({
      model: model as never,
      tools: [tool],
      systemPrompt: 'sys',
    });
    const threadId = `thread-${Math.random().toString(36).slice(2, 8)}`;
    const out = await graph.invoke(
      {
        messages: [new HumanMessage('hi')],
        contentBlocks: [],
        pendingPreorder: null,
      },
      {
        configurable: {
          thread_id: threadId,
          userId: 'u1',
          conversationId: 'c1',
          pushBlock: () => undefined,
          getPendingPreorder: () => null,
          setPendingPreorder: () => undefined,
        },
      },
    );
    expect(tool.invoke).toHaveBeenCalledTimes(1);
    const lastContent = out.messages[out.messages.length - 1].content;
    expect(lastContent).toBe('done');
  });
});
