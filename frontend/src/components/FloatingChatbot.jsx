import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from './Icon.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useChat } from '../context/ChatContext.jsx';
import { useCart } from '../context/CartContext.jsx';
import { MessageBubble } from './chat/MessageBubble.jsx';
import { StreamingBubble } from './chat/StreamingBubble.jsx';
import {
  onMessageDelta,
  onMessageDone,
  onMessageError,
} from '../services/chatSocket.js';

const FAQ_ITEMS = [
  { id: 1, q: 'How long does shipping take?', a: 'Standard delivery: 5-7 business days. Express: 1-2 business days.' },
  { id: 2, q: 'How do I cancel an order?', a: 'Go to My Orders, open the order, and tap Cancel. Available only before shipping.' },
  { id: 3, q: 'How do I change my address?', a: 'Open Profile → Addresses to add, edit, or set a default address.' },
  { id: 4, q: 'Is Cash on Delivery available?', a: 'Yes. Pick "Cash on Delivery" at checkout and pay the courier on arrival.' },
  { id: 5, q: 'How do I contact a seller?', a: 'Open a product page and tap "Contact seller", or use the Stores tab here.' },
];

export default function FloatingChatbot() {
  const { open, toggleChat, closeChat, view, setView, unreadTotal } = useChat();
  const fabBadge = unreadTotal > 0;

  return (
    <>
      {open && <ChatPanel view={view} setView={setView} onClose={closeChat} />}
      <button
        type="button"
        onClick={toggleChat}
        aria-label="Open chat"
        className="fixed bottom-6 right-6 z-40 w-14 h-14 bg-primary text-on-primary rounded-full shadow-overlay flex items-center justify-center hover:bg-primary-container transition-all duration-150 hover:scale-105 active:scale-95"
      >
        <Icon name={open ? 'close' : 'chat'} size={28} />
        {!open && fabBadge && (
          <span className="absolute -top-1 -right-1 bg-error text-on-error text-[10px] font-bold h-5 min-w-5 px-1 rounded-full flex items-center justify-center">
            {unreadTotal}
          </span>
        )}
      </button>
    </>
  );
}

function ChatPanel({ view, setView, onClose }) {
  const { isAuthenticated } = useAuth();
  const { connected } = useChat();
  return (
    <div
      role="dialog"
      aria-label="Chat assistant"
      className="fixed bottom-24 right-4 sm:right-6 z-40 w-[calc(100vw-2rem)] sm:w-[380px] h-[calc(100vh-9rem)] sm:h-[600px] max-h-[80vh] bg-surface-container-lowest border border-outline-variant rounded-xl shadow-overlay flex flex-col overflow-hidden"
    >
      <PanelHeader view={view} onClose={onClose} />
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin bg-surface-container-low">
        {view === 'system' && (isAuthenticated ? <SystemChat /> : <SignInState />)}
        {view === 'stores' && (isAuthenticated ? <StoresTab /> : <SignInState />)}
        {view === 'faq' && <FaqTab />}
      </div>
      {!connected && isAuthenticated && (
        <div className="text-[11px] text-center text-on-surface-variant bg-surface-container py-1">
          Reconnecting…
        </div>
      )}
      <BottomTabs view={view} setView={setView} />
    </div>
  );
}

function PanelHeader({ view, onClose }) {
  const { chats, activeStoreChatId, unreadTotal } = useChat();
  let title = 'AmaZara Assistant';
  let subtitle = 'Online';
  if (view === 'stores') {
    if (activeStoreChatId) {
      const c = chats.find((x) => x.id === activeStoreChatId);
      title = c?.counterpart?.name ?? 'Store';
      subtitle = 'Online';
    } else {
      title = 'Messages';
      subtitle = unreadTotal > 0 ? `${unreadTotal} unread` : 'All caught up';
    }
  } else if (view === 'faq') {
    title = 'Help & FAQ';
    subtitle = 'Common questions';
  }
  return (
    <header className="bg-primary text-on-primary px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Icon name={view === 'faq' ? 'help' : 'support_agent'} />
        <div>
          <div className="text-label-md">{title}</div>
          <div className="text-[11px] opacity-80">{subtitle}</div>
        </div>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close chat"
        className="p-1 rounded-full hover:bg-white/10"
      >
        <Icon name="close" />
      </button>
    </header>
  );
}

function BottomTabs({ view, setView }) {
  const { unreadTotal, setActiveStoreChatId } = useChat();
  const tabs = [
    { id: 'system', icon: 'smart_toy', label: 'System' },
    { id: 'stores', icon: 'forum', label: 'Stores', badge: unreadTotal },
    { id: 'faq', icon: 'help', label: 'FAQ' },
  ];
  return (
    <nav className="flex border-t border-outline-variant bg-surface">
      {tabs.map((t) => {
        const active = view === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setView(t.id);
              if (t.id !== 'stores') setActiveStoreChatId(null);
            }}
            className={`flex-1 py-2 flex flex-col items-center gap-0.5 relative transition-colors ${
              active ? 'text-primary' : 'text-on-surface-variant hover:text-primary'
            }`}
          >
            {active && <span className="absolute top-0 left-1/4 right-1/4 h-0.5 bg-primary" />}
            <Icon name={t.icon} size={20} />
            <span className="text-[11px]">{t.label}</span>
            {t.badge > 0 && (
              <span className="absolute top-1 right-3 bg-error text-on-error text-[9px] font-bold h-4 min-w-4 px-1 rounded-full flex items-center justify-center">
                {t.badge}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}

function SignInState() {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center">
      <Icon name="lock" size={40} className="text-outline mb-3" />
      <p className="text-body-md text-on-surface mb-1">Sign in to chat</p>
      <p className="text-body-sm text-on-surface-variant mb-4">
        Log in to message our assistant and the sellers you've shopped with.
      </p>
      <Link to="/auth" className="btn-primary px-5 py-2">
        Sign in
      </Link>
    </div>
  );
}

function SystemChat() {
  const {
    ensureSystemChat,
    loadMessages,
    messagesByChat,
    sendMessage,
    markRead,
    emitTyping,
    typingByChat,
  } = useChat();
  const [conversationId, setConversationId] = useState(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const scrollRef = useRef(null);
  const typingTimerRef = useRef(null);

  useEffect(() => {
    (async () => {
      const id = await ensureSystemChat();
      setConversationId(id);
      await loadMessages(id);
      markRead(id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const messages = conversationId ? messagesByChat[conversationId] ?? [] : [];

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distance < 80) el.scrollTop = el.scrollHeight;
  }, [messages.length, streamingText]);

  useEffect(() => {
    if (!conversationId) return undefined;
    const offDelta = onMessageDelta(({ conversationId: cid, textDelta }) => {
      if (cid !== conversationId) return;
      setStreamingText((t) => t + textDelta);
    });
    const offDone = onMessageDone(({ conversationId: cid }) => {
      if (cid !== conversationId) return;
      setStreamingText('');
    });
    const offError = onMessageError(({ conversationId: cid }) => {
      if (cid !== conversationId) return;
      setStreamingText('');
    });
    return () => {
      offDelta();
      offDone();
      offError();
    };
  }, [conversationId]);

  const submit = async (e) => {
    e.preventDefault();
    if (!text.trim() || !conversationId || sending) return;
    setSending(true);
    try {
      await sendMessage(conversationId, text);
      setText('');
      emitTyping(conversationId, false);
    } finally {
      setSending(false);
    }
  };

  const onChange = (e) => {
    setText(e.target.value);
    if (!conversationId) return;
    emitTyping(conversationId, true);
    clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => emitTyping(conversationId, false), 1500);
  };

  return (
    <div className="flex flex-col h-full">
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto scrollbar-thin p-3 space-y-2">
        {messages.length === 0 && (
          <div className="text-center text-on-surface-variant text-body-sm py-6">
            Say hi to start the conversation 👋
          </div>
        )}
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} conversationId={conversationId} />
        ))}
        {streamingText && <StreamingBubble text={streamingText} />}
        {conversationId && typingByChat[conversationId] && !streamingText && (
          <div className="text-[11px] text-on-surface-variant pl-2">Assistant is typing…</div>
        )}
      </div>
      <MessageInput value={text} onChange={onChange} onSubmit={submit} disabled={sending} />
    </div>
  );
}

function StoresTab() {
  const {
    chats,
    activeStoreChatId,
    setActiveStoreChatId,
    loadMessages,
    messagesByChat,
    sendMessage,
    markRead,
    emitTyping,
    typingByChat,
    ensureStoreChat,
  } = useChat();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [picking, setPicking] = useState(false);
  const scrollRef = useRef(null);
  const typingTimerRef = useRef(null);
  const { items: cartItems } = useCart();

  const storeChats = useMemo(() => chats.filter((c) => c.kind === 'store'), [chats]);

  useEffect(() => {
    if (activeStoreChatId) {
      loadMessages(activeStoreChatId);
      markRead(activeStoreChatId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStoreChatId]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distance < 80) el.scrollTop = el.scrollHeight;
  }, [activeStoreChatId, messagesByChat[activeStoreChatId]?.length]);

  if (activeStoreChatId) {
    const messages = messagesByChat[activeStoreChatId] ?? [];
    const onChange = (e) => {
      setText(e.target.value);
      emitTyping(activeStoreChatId, true);
      clearTimeout(typingTimerRef.current);
      typingTimerRef.current = setTimeout(() => emitTyping(activeStoreChatId, false), 1500);
    };
    const submit = async (e) => {
      e.preventDefault();
      if (!text.trim() || sending) return;
      setSending(true);
      try {
        await sendMessage(activeStoreChatId, text);
        setText('');
        emitTyping(activeStoreChatId, false);
      } finally {
        setSending(false);
      }
    };
    return (
      <div className="flex flex-col h-full">
        <button
          type="button"
          onClick={() => setActiveStoreChatId(null)}
          className="px-3 py-2 text-label-md text-primary hover:bg-surface-container-low text-left flex items-center gap-1 border-b border-outline-variant"
        >
          <Icon name="arrow_back" size={16} /> Back to stores
        </button>
        <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto scrollbar-thin p-3 space-y-2">
          {messages.map((m) => <Bubble key={m.id} m={m} ownKind="buyer" />)}
          {typingByChat[activeStoreChatId] && (
            <div className="text-[11px] text-on-surface-variant pl-2">Store is typing…</div>
          )}
        </div>
        <MessageInput value={text} onChange={onChange} onSubmit={submit} disabled={sending} />
      </div>
    );
  }

  if (picking) {
    const candidates = Array.from(
      new Map(
        cartItems
          .filter((i) => i.storeId)
          .map((i) => [i.storeId, { storeId: i.storeId, name: i.storeName ?? `Store ${i.storeId.slice(0, 6)}` }]),
      ).values(),
    );
    return (
      <div className="p-3 space-y-2">
        <button onClick={() => setPicking(false)} className="text-label-md text-primary flex items-center gap-1">
          <Icon name="arrow_back" size={16} /> Back
        </button>
        <p className="text-label-md text-on-surface-variant">Pick a store you've shopped with:</p>
        {candidates.length === 0 && (
          <p className="text-body-sm text-on-surface-variant">No stores in your cart yet.</p>
        )}
        {candidates.map((s) => (
          <button
            key={s.storeId}
            type="button"
            onClick={async () => {
              const id = await ensureStoreChat(s.storeId);
              setPicking(false);
              setActiveStoreChatId(id);
            }}
            className="w-full text-left px-3 py-2 rounded-lg border border-outline-variant hover:border-primary"
          >
            {s.name}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={() => setPicking(true)}
        className="m-3 px-3 py-2 rounded-lg bg-primary text-on-primary text-label-md flex items-center gap-1 self-start"
      >
        <Icon name="add" size={16} /> New chat
      </button>
      {storeChats.length === 0 ? (
        <p className="text-center text-body-sm text-on-surface-variant py-6">
          No store conversations yet. Tap "+ New chat" or open a product page.
        </p>
      ) : (
        <ul className="divide-y divide-outline-variant">
          {storeChats.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setActiveStoreChatId(c.id)}
                className="w-full p-3 text-left flex items-center gap-3 hover:bg-surface-container-low"
              >
                <div className="w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center">
                  <Icon name="storefront" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between gap-2">
                    <span className="text-label-md text-on-surface truncate">
                      {c.counterpart?.name ?? `Store ${String(c.storeId ?? '').slice(0, 6)}`}
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
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FaqTab() {
  const [openId, setOpenId] = useState(null);
  return (
    <div className="p-3 space-y-2">
      {FAQ_ITEMS.map((f) => (
        <div key={f.id} className="border border-outline-variant rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => setOpenId(openId === f.id ? null : f.id)}
            className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-surface-container-low"
          >
            <span className="text-body-sm text-on-surface">{f.q}</span>
            <Icon
              name={openId === f.id ? 'expand_less' : 'expand_more'}
              className="text-on-surface-variant"
              size={20}
            />
          </button>
          {openId === f.id && (
            <p className="text-body-sm text-on-surface-variant px-3 pb-3">{f.a}</p>
          )}
        </div>
      ))}
    </div>
  );
}

function Bubble({ m, ownKind }) {
  const isOwn = m.senderKind === ownKind;
  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] px-3 py-2 rounded-2xl text-body-sm ${
          isOwn
            ? 'bg-primary text-on-primary rounded-br-md'
            : 'bg-surface text-on-surface border border-outline-variant rounded-bl-md'
        }`}
      >
        {m.body}
      </div>
    </div>
  );
}

function MessageInput({ value, onChange, onSubmit, disabled }) {
  return (
    <form onSubmit={onSubmit} className="flex items-center gap-2 border-t border-outline-variant p-2 bg-surface-container-lowest">
      <input
        value={value}
        onChange={onChange}
        placeholder="Type a message…"
        className="field flex-1 px-3 py-2 text-body-sm"
        disabled={disabled}
      />
      <button
        type="submit"
        aria-label="Send"
        disabled={disabled || !value.trim()}
        className="bg-primary text-on-primary p-2 rounded-full hover:bg-primary-container transition-colors disabled:opacity-50"
      >
        <Icon name="send" />
      </button>
    </form>
  );
}
