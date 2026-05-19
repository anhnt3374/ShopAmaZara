import { agentNodeFactory } from './agent.node';
import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { GraphState } from '../state';

describe('agent node', () => {
  it('invokes the model with bound tools and returns the AIMessage', async () => {
    const aiMsg = new AIMessage({ content: 'ok' });
    const invoke = jest.fn().mockResolvedValue(aiMsg);
    const bindTools = jest.fn().mockReturnValue({ invoke });
    const model = { bindTools };
    const tools = [{ name: 't1' }, { name: 't2' }];

    const node = agentNodeFactory(model as never, tools, 'SYSTEM');
    const state = {
      messages: [new HumanMessage('hi')],
      contentBlocks: [],
      pendingPreorder: null,
    } as unknown as GraphState;

    const out = await node(state);

    expect(bindTools).toHaveBeenCalledWith(tools);
    expect(invoke).toHaveBeenCalledTimes(1);
    const passed = invoke.mock.calls[0][0];
    expect(passed[0]).toBeInstanceOf(SystemMessage);
    expect(passed[0].content).toBe('SYSTEM');
    expect(passed[1]).toBeInstanceOf(HumanMessage);
    expect(out.messages).toEqual([aiMsg]);
  });
});
