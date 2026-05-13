import { useEffect, useRef, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { useStoreChat } from './useStoreChat.js';

export default function StoreChatPage() {
  const { chats, activeId, messages, typing, connected, open, send, emitTyping } = useStoreChat();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);
  const typingTimerRef = useRef(null);

  useEffect(() => {
    if (!activeId && chats[0]) open(chats[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chats]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [activeId, messages.length]);

  const onChange = (e) => {
    setText(e.target.value);
    emitTyping(true);
    clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => emitTyping(false), 1500);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      await send(text);
      setText('');
      emitTyping(false);
    } finally {
      setSending(false);
    }
  };

  const active = chats.find((c) => c.id === activeId);

  return (
    <div className="-mx-4 md:-mx-8 -my-6 h-[calc(100vh-3.5rem)] md:h-screen flex">
      <aside className="hidden md:flex flex-col w-80 border-r border-outline-variant bg-surface shrink-0">
        <header className="px-4 py-3 border-b border-outline-variant">
          <h2 className="text-headline-md text-on-surface">Messages</h2>
          <p className="text-body-sm text-on-surface-variant">
            {chats.reduce((s, c) => s + (c.unread ?? 0), 0)} unread
          </p>
        </header>
        <div className="flex-1 overflow-y-auto scrollbar-thin divide-y divide-outline-variant">
          {chats.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => open(c.id)}
              className={`w-full flex gap-3 p-3 text-left hover:bg-surface-container-low transition-colors ${
                c.id === activeId ? 'bg-surface-container-low' : ''
              }`}
            >
              <div className="w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center">
                <Icon name="person" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-label-md text-on-surface truncate">
                    {c.counterpart?.name ?? `Buyer ${String(c.buyerId).slice(0, 6)}`}
                  </span>
                  {c.unread > 0 && (
                    <span className="bg-primary text-on-primary text-[10px] font-bold h-5 min-w-5 px-1 rounded-full flex items-center justify-center">
                      {c.unread}
                    </span>
                  )}
                </div>
                <p className="text-body-sm text-on-surface-variant truncate">
                  {c.lastMessage?.body ?? 'No messages yet'}
                </p>
              </div>
            </button>
          ))}
        </div>
      </aside>

      <section className="flex-1 flex flex-col min-w-0 bg-surface-container-low">
        {active ? (
          <>
            <header className="px-4 py-3 border-b border-outline-variant bg-surface flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center">
                <Icon name="person" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-label-md text-on-surface">
                  {active.counterpart?.name ?? `Buyer ${String(active.buyerId).slice(0, 6)}`}
                </div>
                <div className="text-body-sm text-on-surface-variant">
                  {typing ? 'typing…' : connected ? 'Online' : 'Reconnecting…'}
                </div>
              </div>
            </header>

            <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-3">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex ${m.senderKind === 'store' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] sm:max-w-[60%] px-4 py-2 rounded-2xl text-body-sm ${
                      m.senderKind === 'store'
                        ? 'bg-primary text-on-primary rounded-br-md'
                        : 'bg-surface text-on-surface border border-outline-variant rounded-bl-md'
                    }`}
                  >
                    {m.body}
                  </div>
                </div>
              ))}
            </div>

            <form
              onSubmit={submit}
              className="flex items-center gap-2 border-t border-outline-variant p-3 bg-surface"
            >
              <input
                value={text}
                onChange={onChange}
                className="field flex-1 px-4 py-2 text-body-sm"
                placeholder="Reply to customer…"
              />
              <button
                type="submit"
                aria-label="Send"
                disabled={sending || !text.trim()}
                className="bg-primary text-on-primary p-2 rounded-full hover:bg-primary-container transition-colors disabled:opacity-50"
              >
                <Icon name="send" />
              </button>
            </form>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-on-surface-variant">
            <div className="text-center">
              <Icon name="forum" size={48} className="text-outline" />
              <p className="mt-3 text-body-md">Pick a conversation to begin</p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
