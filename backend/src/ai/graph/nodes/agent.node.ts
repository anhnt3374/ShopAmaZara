import { SystemMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import type { GraphState } from '../state';

type Bindable = {
  bindTools: (tools: unknown[]) => { invoke: (messages: BaseMessage[]) => Promise<BaseMessage> };
};

export function agentNodeFactory(
  model: Bindable,
  tools: unknown[],
  systemPrompt: string,
) {
  const bound = model.bindTools(tools);
  return async (state: GraphState) => {
    const messages: BaseMessage[] = [
      new SystemMessage(systemPrompt),
      ...state.messages,
    ];
    const ai = await bound.invoke(messages);
    return { messages: [ai] };
  };
}
