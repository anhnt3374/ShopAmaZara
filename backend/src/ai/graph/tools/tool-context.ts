import type { RunnableConfig } from '@langchain/core/runnables';
import type { ContentBlock } from '../../rich-message';

export type ToolContext = {
  userId: string;
  conversationId: string;
  pushBlock: (block: ContentBlock) => void;
};

export function ctxFromConfig(config?: RunnableConfig): ToolContext {
  const ctx = config?.configurable as Partial<ToolContext> | undefined;
  if (!ctx?.userId || !ctx.pushBlock || !ctx.conversationId) {
    throw new Error('ToolContext missing in RunnableConfig.configurable');
  }
  return ctx as ToolContext;
}
