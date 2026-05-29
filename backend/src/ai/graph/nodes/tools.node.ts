import { ToolMessage } from '@langchain/core/messages';
import type { AIMessage } from '@langchain/core/messages';
import type { RunnableConfig } from '@langchain/core/runnables';
import type { GraphState } from '../state';

type ToolLike = { name: string; invoke: (args: unknown, config?: RunnableConfig) => Promise<unknown> };

export function makeToolsNode(tools: ToolLike[]) {
  const byName = new Map(tools.map((t) => [t.name, t]));
  return async (state: GraphState, config?: RunnableConfig) => {
    const last = state.messages[state.messages.length - 1] as AIMessage;
    const calls = last.tool_calls ?? [];
    const out: ToolMessage[] = [];
    for (const call of calls) {
      const tool = byName.get(call.name);
      if (!tool) {
        out.push(
          new ToolMessage({
            tool_call_id: call.id ?? '',
            content: JSON.stringify({
              ok: false,
              error: `Tool ${call.name} not found`,
            }),
          }),
        );
        continue;
      }
      const content = await tool.invoke(call.args, config);
      out.push(
        new ToolMessage({
          tool_call_id: call.id ?? '',
          content: typeof content === 'string' ? content : JSON.stringify(content),
        }),
      );
    }
    return { messages: out };
  };
}
