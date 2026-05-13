import { Injectable } from '@nestjs/common';
import { Conversation } from './conversation.entity';
import { Message } from './message.entity';

@Injectable()
export class ChatsGateway {
  fanOutMessages(_payload: { conversation: Conversation; messages: Message[] }): void {
    // stub — replaced in Task 8
  }

  fanOutRead(_conversation: Conversation, _party: 'buyer' | 'store', _at: Date): void {
    // stub — replaced in Task 8
  }
}
