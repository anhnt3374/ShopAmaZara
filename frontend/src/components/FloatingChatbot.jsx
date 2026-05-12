import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';
import { useChat } from '../context/ChatContext.jsx';
import { listConversations, listFaqs, listMessages, sendMessage } from '../services/chat.js';

// The persistent chat icon. Positioned bottom-right with safe offsets so it
// stays out of the way of CTAs. The panel itself opens above the icon and
// uses an internal scroll area so it never grows past the viewport.

export default function FloatingChatbot() {
  const { open, view, setView, toggleChat, closeChat } = useChat();

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
        {!open && (
          <span className="absolute top-0 right-0 w-3.5 h-3.5 bg-error border-2 border-surface rounded-full" />
        )}
      </button>
    </>
  );
}

function ChatPanel({ view, setView, onClose }) {
  return (
    <div
      role="dialog"
      aria-label="Chat assistant"
      className="fixed bottom-24 right-4 sm:right-6 z-40 w-[calc(100vw-2rem)] sm:w-[380px] max-h-[min(70vh,640px)] bg-surface-container-lowest border border-outline-variant rounded-xl shadow-overlay flex flex-col overflow-hidden"
    >
      <header className="bg-primary text-on-primary px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon name="support_agent" />
          <div>
            <div className="text-label-md">AmaZara Assistant</div>
            <div className="text-[11px] opacity-80">Typically replies in minutes</div>
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

      <nav className="border-b border-outline-variant flex">
        {[
          { id: 'home', icon: 'home', label: 'Home' },
          { id: 'conversations', icon: 'forum', label: 'Chats' },
          { id: 'faq', icon: 'help', label: 'FAQ' },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setView(tab.id)}
            className={`flex-1 px-3 py-2 text-body-sm flex items-center justify-center gap-1 border-b-2 transition-colors ${
              view === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-on-surface-variant hover:text-primary'
            }`}
          >
            <Icon name={tab.icon} size={18} />
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {view === 'home' && <HomeView setView={setView} />}
        {view === 'conversations' && <ConversationsView setView={setView} />}
        {view === 'faq' && <FaqView />}
        {view === 'conversation' && <ConversationView />}
      </div>
    </div>
  );
}

function HomeView({ setView }) {
  const actions = [
    { icon: 'shopping_bag', label: 'Track an order' },
    { icon: 'inventory_2', label: 'Returns & refunds' },
    { icon: 'storefront', label: 'Find a product' },
    { icon: 'support_agent', label: 'Talk to a human' },
  ];
  return (
    <div className="p-4 space-y-4">
      <div className="bg-primary-container/10 border border-primary-container/20 rounded-xl p-4">
        <h3 className="text-label-md text-primary mb-1">Hi, I'm Zara 👋</h3>
        <p className="text-body-sm text-on-surface-variant">
          I can help with orders, shipping, and product questions. Pick a topic below to get started.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {actions.map((a) => (
          <button
            key={a.label}
            type="button"
            onClick={() => setView('conversations')}
            className="flex flex-col items-start gap-2 p-3 rounded-lg border border-outline-variant hover:border-primary hover:bg-surface-container-low text-left transition-all"
          >
            <Icon name={a.icon} className="text-primary" />
            <span className="text-body-sm text-on-surface">{a.label}</span>
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setView('faq')}
        className="w-full text-body-sm text-primary py-2 rounded-lg border border-outline-variant hover:bg-surface-container-low"
      >
        Browse the FAQ →
      </button>
    </div>
  );
}

function ConversationsView({ setView }) {
  const [items, setItems] = useState([]);
  useEffect(() => {
    listConversations().then((res) => setItems(res.items));
  }, []);
  return (
    <div className="divide-y divide-outline-variant">
      {items.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => setView('conversation')}
          className="w-full flex items-center gap-3 p-3 text-left hover:bg-surface-container-low transition-colors"
        >
          <img src={c.avatar} alt="" className="w-10 h-10 rounded-full object-cover" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-label-md text-on-surface truncate">{c.store}</span>
              <span className="text-[11px] text-outline shrink-0">{c.updatedAt}</span>
            </div>
            <p className="text-body-sm text-on-surface-variant truncate">{c.lastMessage}</p>
          </div>
          {c.unread > 0 && (
            <span className="bg-primary text-on-primary text-[10px] font-bold h-5 min-w-5 px-1 rounded-full flex items-center justify-center">
              {c.unread}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

function FaqView() {
  const [items, setItems] = useState([]);
  const [openId, setOpenId] = useState(null);
  useEffect(() => {
    listFaqs().then((res) => setItems(res.items));
  }, []);
  return (
    <div className="p-3 space-y-2">
      {items.map((f) => (
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

function ConversationView() {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');

  useEffect(() => {
    listMessages('c1').then((res) => setMessages(res.items));
  }, []);

  async function submit(e) {
    e.preventDefault();
    if (!text.trim()) return;
    const msg = await sendMessage('c1', text);
    setMessages((prev) => [...prev, msg]);
    setText('');
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-2">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex ${m.from === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] px-3 py-2 rounded-2xl text-body-sm ${
                m.from === 'user'
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-container-low text-on-surface'
              }`}
            >
              {m.text}
            </div>
          </div>
        ))}
      </div>
      <form onSubmit={submit} className="flex items-center gap-2 border-t border-outline-variant p-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a message…"
          className="field flex-1 px-3 py-2 text-body-sm"
        />
        <button
          type="submit"
          aria-label="Send"
          className="bg-primary text-on-primary p-2 rounded-full hover:bg-primary-container transition-colors"
        >
          <Icon name="send" />
        </button>
      </form>
    </div>
  );
}
