import type { RunnableConfig } from '@langchain/core/runnables';
import type { ContentBlock } from '../../rich-message';
import type { PreorderDraft } from '../../../orders/orders.service';

export type ToolContext = {
  userId: string;
  conversationId: string;
  pushBlock: (block: ContentBlock) => void;
  getPendingPreorder: () => PreorderDraft | null;
  setPendingPreorder: (draft: PreorderDraft | null) => void;
};

export function ctxFromConfig(config?: RunnableConfig): ToolContext {
  const ctx = config?.configurable as Partial<ToolContext> | undefined;
  if (
    !ctx?.userId ||
    !ctx.conversationId ||
    !ctx.pushBlock ||
    !ctx.getPendingPreorder ||
    !ctx.setPendingPreorder
  ) {
    throw new Error('ToolContext missing in RunnableConfig.configurable');
  }
  return ctx as ToolContext;
}
