import { Injectable, Inject, Logger, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HumanMessage, AIMessage, type BaseMessage } from '@langchain/core/messages';
import { ChatsService } from '../chats/chats.service';
import { ChatsGateway } from '../chats/chats.gateway';
import type { Conversation } from '../chats/conversation.entity';
import type { PreorderDraft } from '../orders/orders.service';
import { AiLogger } from './ai.logger';
import type { ContentBlock } from './rich-message';

export const AI_GRAPH = 'AI_GRAPH';

type CompiledGraph = {
  invoke: (
    input: { messages: BaseMessage[]; contentBlocks: ContentBlock[]; pendingPreorder: PreorderDraft | null },
    config: { configurable: Record<string, unknown>; recursionLimit?: number },
  ) => Promise<{
    messages: BaseMessage[];
    contentBlocks: ContentBlock[];
    pendingPreorder: PreorderDraft | null;
  }>;
};

@Injectable()
export class AiService {
  private readonly log = new Logger('AiService');

  constructor(
    private readonly config: ConfigService,
    @Inject(forwardRef(() => ChatsService))
    private readonly chats: ChatsService,
    @Inject(forwardRef(() => ChatsGateway))
    private readonly gateway: ChatsGateway,
    @Inject(AI_GRAPH) private readonly graph: CompiledGraph,
    private readonly turnLogger: AiLogger,
  ) {}

  async respond(
    userId: string,
    conversation: Conversation,
    _userMessage: string,
  ): Promise<void> {
    const requestId = Math.random().toString(36).slice(2, 10);
    const start = Date.now();

    if (this.config.get<string>('AI_FEATURE_ENABLED') !== 'true') {
      const saved = await this.chats.appendBotMessage(
        conversation.id,
        'Thanks, we received your message.',
        null,
      );
      this.gateway.fanOutMessages({ conversation, messages: [saved] });
      return;
    }

    const collected: ContentBlock[] = [];
    let pendingPreorder: PreorderDraft | null = null;
    const history = await this.loadHistory(conversation.id);

    try {
      const final = await this.graph.invoke(
        { messages: history, contentBlocks: [], pendingPreorder: null },
        {
          recursionLimit: Number(this.config.get('AI_RECURSION_LIMIT') ?? 8),
          configurable: {
            thread_id: conversation.id,
            userId,
            conversationId: conversation.id,
            pushBlock: (b: ContentBlock) => collected.push(b),
            getPendingPreorder: () => pendingPreorder,
            setPendingPreorder: (d: PreorderDraft | null) => {
              pendingPreorder = d;
            },
          },
        },
      );

      const aiMessages = final.messages.filter((m) => m instanceof AIMessage) as AIMessage[];
      const lastAi = aiMessages[aiMessages.length - 1];
      const text = typeof lastAi?.content === 'string' ? lastAi.content : '';
      const blocks =
        final.contentBlocks && final.contentBlocks.length > 0
          ? final.contentBlocks
          : collected;
      const saved = await this.chats.appendBotMessage(
        conversation.id,
        text,
        blocks.length > 0 ? blocks : null,
      );
      this.gateway.fanOutMessages({ conversation, messages: [saved] });

      this.turnLogger.recordTurn({
        userId,
        conversationId: conversation.id,
        requestId,
        durationMs: Date.now() - start,
        tokensIn: 0,
        tokensOut: 0,
        toolsCalled: blocks.map((b) => b.type),
        outcome: 'ok',
      });
    } catch (e) {
      const fallback =
        "Sorry, I'm having trouble right now. Please try again in a moment.";
      const saved = await this.chats.appendBotMessage(conversation.id, fallback, null);
      this.gateway.fanOutMessages({ conversation, messages: [saved] });
      this.turnLogger.recordTurn({
        userId,
        conversationId: conversation.id,
        requestId,
        durationMs: Date.now() - start,
        tokensIn: 0,
        tokensOut: 0,
        toolsCalled: [],
        outcome: 'error',
        errorCode: (e as Error).message,
      });
      this.log.warn(`ai.respond failed: ${(e as Error).message}`);
    }
  }

  private async loadHistory(conversationId: string): Promise<BaseMessage[]> {
    const limit = Number(this.config.get('AI_MAX_HISTORY') ?? 20);
    const rows = await this.chats.loadRecentMessages(conversationId, limit);
    return rows.map((m) => {
      if (m.senderKind === 'buyer') return new HumanMessage(m.body ?? '');
      if (m.senderKind === 'system') return new AIMessage(m.body ?? '');
      return new HumanMessage(`[store]: ${m.body ?? ''}`);
    });
  }
}
