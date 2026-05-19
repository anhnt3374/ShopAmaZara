import { Annotation, MessagesAnnotation } from '@langchain/langgraph';
import type { ContentBlock } from '../rich-message';
import type { PreorderDraft } from '../../orders/orders.service';

export const GraphAnnotation = Annotation.Root({
  ...MessagesAnnotation.spec,
  contentBlocks: Annotation<ContentBlock[]>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),
  pendingPreorder: Annotation<PreorderDraft | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
});

export type GraphState = typeof GraphAnnotation.State;
