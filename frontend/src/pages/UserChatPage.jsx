import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import { listConversations, listMessages, sendMessage } from '../services/chat.js';

// Full-page user messaging. Header stays sticky at the top, conversation
// list sidebar is sticky to the viewport left so it does not scroll with
// the chat thread.

export default function UserChatPage() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState([]);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');

  useEffect(() => {
    listConversations().then((res) => {
      setConversations(res.items);
      if (!conversationId && res.items[0]) {
        navigate(`/messages/${res.items[0].id}`, { replace: true });
      }
    });
  }, [conversationId, navigate]);

  useEffect(() => {
    if (!conversationId) return;
    listMessages(conversationId).then((res) => setMessages(res.items));
  }, [conversationId]);

  async function submit(e) {
    e.preventDefault();
    if (!text.trim() || !conversationId) return;
    const msg = await sendMessage(conversationId, text);
    setMessages((prev) => [...prev, msg]);
    setText('');
  }

  const active = conversations.find((c) => c.id === conversationId);

  return (
    <div className="flex-1 w-full">
      <div className="max-w-container-max mx-auto h-[calc(100vh-4rem)] flex">
        {/* Sticky conversation list */}
        <aside className="hidden md:flex flex-col w-72 lg:w-80 border-r border-outline-variant bg-surface shrink-0">
          <div className="px-4 py-3 border-b border-outline-variant flex items-center justify-between">
            <h2 className="text-headline-md text-on-surface">Inbox</h2>
            <button
              type="button"
              aria-label="Compose"
              className="p-2 rounded-full hover:bg-surface-container-high text-primary"
            >
              <Icon name="edit_square" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto scrollbar-thin divide-y divide-outline-variant">
            {conversations.map((c) => (
              <Link
                key={c.id}
                to={`/messages/${c.id}`}
                className={`flex gap-3 p-3 hover:bg-surface-container-low transition-colors ${
                  c.id === conversationId ? 'bg-surface-container-low' : ''
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
              </Link>
            ))}
          </div>
          <div className="p-4 border-t border-outline-variant">
            <div className="text-label-md text-on-surface-variant mb-2 uppercase tracking-wider">
              Quick Links
            </div>
            <div className="grid grid-cols-2 gap-2 text-body-sm">
              <Link to="/cart" className="p-2 rounded-lg hover:bg-surface-container-low flex items-center gap-2">
                <Icon name="shopping_cart" size={18} /> Cart
              </Link>
              <Link to="/wishlist" className="p-2 rounded-lg hover:bg-surface-container-low flex items-center gap-2">
                <Icon name="favorite" size={18} /> Wishlist
              </Link>
              <Link to="/policy" className="p-2 rounded-lg hover:bg-surface-container-low flex items-center gap-2">
                <Icon name="help" size={18} /> Help
              </Link>
              <Link to="/" className="p-2 rounded-lg hover:bg-surface-container-low flex items-center gap-2">
                <Icon name="home" size={18} /> Home
              </Link>
            </div>
          </div>
        </aside>

        {/* Chat window */}
        <section className="flex-1 flex flex-col min-w-0">
          {active ? (
            <>
              <header className="px-4 py-3 border-b border-outline-variant flex items-center gap-3 bg-surface">
                <button
                  type="button"
                  onClick={() => navigate('/messages')}
                  aria-label="Back"
                  className="md:hidden p-2 rounded-full hover:bg-surface-container-high"
                >
                  <Icon name="arrow_back" />
                </button>
                <img src={active.avatar} alt="" className="w-10 h-10 rounded-full object-cover" />
                <div className="flex-1 min-w-0">
                  <div className="text-label-md text-on-surface">{active.store}</div>
                  <div className="text-body-sm text-on-surface-variant">Online • typically replies within an hour</div>
                </div>
                <button
                  type="button"
                  aria-label="Call"
                  className="p-2 rounded-full hover:bg-surface-container-high"
                >
                  <Icon name="call" />
                </button>
                <button
                  type="button"
                  aria-label="More"
                  className="p-2 rounded-full hover:bg-surface-container-high"
                >
                  <Icon name="more_horiz" />
                </button>
              </header>

              <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-3 bg-surface-container-low">
                {messages.map((m) => (
                  <Message key={m.id} m={m} />
                ))}
              </div>

              <form
                onSubmit={submit}
                className="flex items-center gap-2 border-t border-outline-variant p-3 bg-surface"
              >
                <button
                  type="button"
                  aria-label="Attach"
                  className="p-2 rounded-full hover:bg-surface-container-high text-on-surface-variant"
                >
                  <Icon name="add_photo_alternate" />
                </button>
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  className="field flex-1 px-4 py-2 text-body-sm"
                  placeholder="Write a message…"
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
                <p className="mt-3 text-body-md">Select a conversation to start chatting</p>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Message({ m }) {
  const isUser = m.from === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] sm:max-w-[60%] flex flex-col ${
          isUser ? 'items-end' : 'items-start'
        }`}
      >
        <div
          className={`px-4 py-2 rounded-2xl text-body-sm ${
            isUser
              ? 'bg-primary text-on-primary rounded-br-md'
              : 'bg-surface text-on-surface border border-outline-variant rounded-bl-md'
          }`}
        >
          {m.text}
        </div>
        {m.attachment?.type === 'product' && (
          <div className="mt-2 bg-surface border border-outline-variant rounded-lg p-2 flex items-center gap-3 max-w-xs">
            <img src={m.attachment.image} alt="" className="w-12 h-12 rounded object-cover" />
            <div className="min-w-0">
              <div className="text-label-md text-on-surface truncate">{m.attachment.title}</div>
              <div className="text-body-sm text-primary">{m.attachment.price}</div>
            </div>
          </div>
        )}
        <span className="text-[11px] text-outline mt-1 px-1">{m.at}</span>
      </div>
    </div>
  );
}
