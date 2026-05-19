import { makeToolsNode } from './tools.node';
import { AIMessage, ToolMessage } from '@langchain/core/messages';
import type { GraphState } from '../state';

const baseCtx = () => ({
  configurable: {
    userId: 'u1',
    conversationId: 'c1',
    pushBlock: jest.fn(),
    getPendingPreorder: () => null,
    setPendingPreorder: jest.fn(),
  } as never,
});

describe('tools node', () => {
  it('executes each tool call and appends ToolMessage with the right call id', async () => {
    const tool = {
      name: 'search_products',
      invoke: jest.fn().mockResolvedValue('{"ok":true}'),
    };
    const node = makeToolsNode([tool]);
    const lastAi = new AIMessage({
      content: '',
      tool_calls: [{ id: 'call1', name: 'search_products', args: { query: 'x' } }],
    });
    const out = await node(
      { messages: [lastAi], contentBlocks: [], pendingPreorder: null } as unknown as GraphState,
      baseCtx(),
    );
    expect(tool.invoke).toHaveBeenCalledWith({ query: 'x' }, expect.any(Object));
    expect(out.messages[0]).toBeInstanceOf(ToolMessage);
    expect((out.messages[0] as ToolMessage).tool_call_id).toBe('call1');
    expect((out.messages[0] as ToolMessage).content).toBe('{"ok":true}');
  });

  it('returns a "tool not found" ToolMessage for unknown tool name', async () => {
    const node = makeToolsNode([]);
    const lastAi = new AIMessage({
      content: '',
      tool_calls: [{ id: 'cx', name: 'no_such', args: {} }],
    });
    const out = await node(
      { messages: [lastAi], contentBlocks: [], pendingPreorder: null } as unknown as GraphState,
      baseCtx(),
    );
    const content = (out.messages[0] as ToolMessage).content as string;
    expect(content).toMatch(/not found/i);
  });

  it('serializes object tool results to JSON', async () => {
    const tool = {
      name: 't',
      invoke: jest.fn().mockResolvedValue({ ok: true, n: 1 }),
    };
    const node = makeToolsNode([tool]);
    const out = await node(
      {
        messages: [
          new AIMessage({ content: '', tool_calls: [{ id: 'c', name: 't', args: {} }] }),
        ],
        contentBlocks: [],
        pendingPreorder: null,
      } as unknown as GraphState,
      baseCtx(),
    );
    const content = (out.messages[0] as ToolMessage).content as string;
    expect(JSON.parse(content)).toMatchObject({ ok: true, n: 1 });
  });
});
