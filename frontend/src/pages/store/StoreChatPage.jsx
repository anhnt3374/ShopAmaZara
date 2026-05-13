import { useEffect, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { listStoreChats, listStoreMessages, sendStoreMessage } from '../../services/chat.js';

// TODO(Task 18): replace with new store chat service API
const listConversations = listStoreChats;
const listMessages = listStoreMessages;
const sendMessage = sendStoreMessage;

export default function StoreChatPage() {
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');

  useEffect(() => {
    listConversations().then((res) => {
      setConversations(res.items);
      if (res.items[0]) setActiveId(res.items[0].id);
    });
  }, []);

  useEffect(() => {
    if (!activeId) return;
    listMessages(activeId).then((res) => setMessages(res.items));
  }, [activeId]);

  async function submit(e) {
    e.preventDefault();
    if (!text.trim()) return;
    const msg = await sendMessage(activeId, text);
    setMessages((prev) => [...prev, msg]);
    setText('');
  }

  const active = conversations.find((c) => c.id === activeId);

  return (
    <div className="-mx-4 md:-mx-8 -my-6 h-[calc(100vh-3.5rem)] md:h-screen flex">
      {/* Conversation list */}
      <aside className="hidden md:flex flex-col w-80 border-r border-outline-variant bg-surface shrink-0">
        <header className="px-4 py-3 border-b border-outline-variant">
          <h2 className="text-headline-md text-on-surface">Messages</h2>
          <p className="text-body-sm text-on-surface-variant">
            {conversations.reduce((s, c) => s + c.unread, 0)} unread
          </p>
        </header>
        <div className="px-3 py-2 border-b border-outline-variant">
          <div className="relative">
            <input
              placeholder="Search customers…"
              className="field w-full py-2 pl-10 pr-3 text-body-sm"
            />
            <Icon name="search" size={20} className="absolute left-3 top-2.5 text-outline" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin divide-y divide-outline-variant">
          {conversations.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setActiveId(c.id)}
              className={`w-full flex gap-3 p-3 text-left hover:bg-surface-container-low transition-colors ${
                c.id === activeId ? 'bg-surface-container-low' : ''
              }`}
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
                <span className="bg-primary text-on-primary text-[10px] font-bold h-5 min-w-5 px-1 rounded-full flex items-center justify-center self-center">
                  {c.unread}
                </span>
              )}
            </button>
          ))}
        </div>
      </aside>

      {/* Active conversation */}
      <section className="flex-1 flex flex-col min-w-0 bg-surface-container-low">
        {active ? (
          <>
            <header className="px-4 py-3 border-b border-outline-variant bg-surface flex items-center gap-3">
              <img src={active.avatar} alt="" className="w-10 h-10 rounded-full object-cover" />
              <div className="flex-1 min-w-0">
                <div className="text-label-md text-on-surface">{active.store}</div>
                <div className="text-body-sm text-on-surface-variant">Customer • 12 prior orders</div>
              </div>
              <button className="btn-secondary px-3 py-1.5 text-body-sm">
                <Icon name="receipt_long" size={16} /> View orders
              </button>
            </header>

            <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-3">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex ${m.from === 'store' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] sm:max-w-[60%] px-4 py-2 rounded-2xl text-body-sm ${
                      m.from === 'store'
                        ? 'bg-primary text-on-primary rounded-br-md'
                        : 'bg-surface text-on-surface border border-outline-variant rounded-bl-md'
                    }`}
                  >
                    {m.text}
                  </div>
                </div>
              ))}
            </div>

            <form
              onSubmit={submit}
              className="flex items-center gap-2 border-t border-outline-variant p-3 bg-surface"
            >
              <button
                type="button"
                aria-label="Templates"
                className="p-2 rounded-full hover:bg-surface-container-high text-on-surface-variant"
              >
                <Icon name="bolt" />
              </button>
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="field flex-1 px-4 py-2 text-body-sm"
                placeholder="Reply to customer…"
              />
              <button
                type="submit"
                aria-label="Send"
                className="bg-primary text-on-primary p-2 rounded-full hover:bg-primary-container transition-colors"
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
