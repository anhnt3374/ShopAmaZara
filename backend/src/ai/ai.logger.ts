import { Injectable, Logger } from '@nestjs/common';

export type TurnOutcome = {
  userId: string;
  conversationId: string;
  requestId: string;
  durationMs: number;
  tokensIn: number;
  tokensOut: number;
  toolsCalled: string[];
  outcome: 'ok' | 'error';
  errorCode?: string;
};

@Injectable()
export class AiLogger {
  private readonly nest = new Logger('AI');

  recordTurn(t: TurnOutcome): void {
    this.nest.log(JSON.stringify(t));
  }

  toolError(toolName: string, err: unknown): void {
    this.nest.warn(`tool=${toolName} error=${(err as Error).message}`);
  }
}
