import { useState } from 'react';
import { sendChatAction } from '../../services/chatSocket';

export function ConfirmCardBlock({ block, conversationId }) {
  const [used, setUsed] = useState(false);
  const fire = (action) => {
    if (used) return;
    setUsed(true);
    sendChatAction({ conversationId, action, preorderId: block.preorderId });
  };
  return (
    <div
      className={`mt-2 p-3 bg-surface border border-outline-variant rounded-xl ${
        used ? 'opacity-60 pointer-events-none' : ''
      }`}
    >
      <div className="text-label-md font-semibold mb-2 text-on-surface">
        {block.title}
      </div>
      <div className="text-body-sm text-on-surface-variant">
        {block.lines.map((l, i) => (
          <div
            key={i}
            className="flex justify-between gap-2 py-1 border-b border-dashed border-outline-variant min-w-0"
          >
            <span className="min-w-0 break-words flex-1">{l.label}</span>
            <span className="flex-none">{l.value}</span>
          </div>
        ))}
        <div className="flex justify-between py-1 mt-1 font-semibold text-error">
          <span>{block.total.label}</span>
          <span>{block.total.value}</span>
        </div>
      </div>
      <div className="flex gap-2 mt-3">
        <button
          onClick={() => fire(block.secondary.action)}
          className="flex-1 py-2 rounded-lg border border-outline-variant bg-surface hover:bg-surface-container text-body-sm font-semibold"
        >
          {block.secondary.label}
        </button>
        <button
          onClick={() => fire(block.primary.action)}
          className="flex-1 py-2 rounded-lg bg-on-surface text-surface hover:opacity-90 text-body-sm font-semibold"
        >
          {block.primary.label}
        </button>
      </div>
      {block.chips?.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {block.chips.map((c, i) => (
            <button
              key={i}
              onClick={() => fire(c.action)}
              className="text-body-xs px-2.5 py-1 rounded-full border border-outline-variant bg-surface hover:bg-surface-container"
            >
              {c.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
