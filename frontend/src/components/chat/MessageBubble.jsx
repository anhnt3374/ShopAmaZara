import { BlockDispatcher } from './BlockDispatcher';

function isActionSentinel(body) {
  return typeof body === 'string' && /^\[action:[^\]]+\]$/.test(body);
}

export function MessageBubble({ message, conversationId, compact = false }) {
  const isBuyer = message.senderKind === 'buyer';

  // Hide [action:...] sentinels from the visible thread — they exist to drive
  // the agent on the server side but shouldn't appear as plain text.
  if (isBuyer && isActionSentinel(message.body)) return null;

  if (isBuyer) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] sm:max-w-[60%] px-4 py-2 rounded-2xl text-body-sm bg-primary text-on-primary rounded-br-md break-words">
          {message.body}
        </div>
      </div>
    );
  }

  const blocks = message.contentBlocks ?? message.content_blocks ?? [];
  return (
    <div className="flex justify-start min-w-0">
      <div className="max-w-[80%] flex flex-col min-w-0">
        {message.body && (
          <div className="px-4 py-2 rounded-2xl rounded-bl-md text-body-sm bg-surface text-on-surface border border-outline-variant break-words">
            {message.body}
          </div>
        )}
        {blocks.map((b, i) => (
          <BlockDispatcher
            key={i}
            block={b}
            conversationId={conversationId}
            compact={compact}
          />
        ))}
      </div>
    </div>
  );
}
