import { StateGraph, MemorySaver, START, END } from '@langchain/langgraph';
import type { AIMessage } from '@langchain/core/messages';
import { GraphAnnotation, type GraphState } from './state';
import { agentNodeFactory } from './nodes/agent.node';
import { makeToolsNode } from './nodes/tools.node';

const checkpointer = new MemorySaver();

type Bindable = Parameters<typeof agentNodeFactory>[0];
type ToolLike = Parameters<typeof makeToolsNode>[0][number];

export function buildGraph(opts: {
  model: Bindable;
  tools: ToolLike[];
  systemPrompt: string;
}) {
  const agent = agentNodeFactory(opts.model, opts.tools, opts.systemPrompt);
  const tools = makeToolsNode(opts.tools);

  const graph = new StateGraph(GraphAnnotation)
    .addNode('agent', agent)
    .addNode('tools', tools)
    .addEdge(START, 'agent')
    .addConditionalEdges('agent', (state: GraphState) => {
      const last = state.messages[state.messages.length - 1] as AIMessage;
      return last.tool_calls && last.tool_calls.length > 0 ? 'tools' : END;
    })
    .addEdge('tools', 'agent');

  return graph.compile({ checkpointer });
}

export { checkpointer };
