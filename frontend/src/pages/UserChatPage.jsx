import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import { useChat } from '../context/ChatContext.jsx';
import { MessageBubble } from '../components/chat/MessageBubble.jsx';
import { StreamingBubble } from '../components/chat/StreamingBubble.jsx';
import {
  onMessageDelta,
  onMessageDone,
  onMessageError,
} from '../services/chatSocket.js';

export default function UserChatPage() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const {
    chats, refreshChats,
    messagesByChat, loadMessages, sendMessage, markRead,
    typingByChat, emitTyping,
  } = useChat();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const scrollRef = useRef(null);
  const typingTimerRef = useRef(null);

  useEffect(() => {
    refreshChats().then((items) => {
      if (!conversationId && items[0]) {
        navigate(`/messages/${items[0].id}`, { replace: true });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!conversationId) return;
    loadMessages(conversationId);
    markRead(conversationId);
    setStreamingText('');
  }, [conversationId, loadMessages, markRead]);

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

  const messages = conversationId ? messagesByChat[conversationId] ?? [] : [];

  const initialScrollDoneRef = useRef(false);
  useEffect(() => {
    initialScrollDoneRef.current = false;
  }, [conversationId]);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Wait one frame so the message list has actually laid out before we read
    // scrollHeight — otherwise React may not have committed the new bubbles yet.
    requestAnimationFrame(() => {
      if (!scrollRef.current) return;
      if (!initialScrollDoneRef.current && messages.length > 0) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        initialScrollDoneRef.current = true;
        return;
      }
      // After the initial jump, only auto-scroll when the user is near the
      // bottom so they don't lose their place while reading history.
      const node = scrollRef.current;
      const distance = node.scrollHeight - node.scrollTop - node.clientHeight;
      if (distance < 120) node.scrollTop = node.scrollHeight;
    });
  }, [conversationId, messages.length, streamingText]);

  const onChange = (e) => {
    setText(e.target.value);
    if (!conversationId) return;
    emitTyping(conversationId, true);
    clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => emitTyping(conversationId, false), 1500);
  };

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

  const active = chats.find((c) => c.id === conversationId);

  return (
    <div className="flex-1 w-full">
      <div className="max-w-container-max mx-auto h-[calc(100vh-4rem)] flex">
        <aside className="hidden md:flex flex-col w-72 lg:w-80 border-r border-outline-variant bg-surface shrink-0">
          <div className="px-4 py-3 border-b border-outline-variant">
            <h2 className="text-headline-md text-on-surface">Inbox</h2>
            <p className="text-body-sm text-on-surface-variant">
              {chats.length} conversation{chats.length === 1 ? '' : 's'}
            </p>
          </div>
          <div className="flex-1 overflow-y-auto scrollbar-thin divide-y divide-outline-variant">
            {chats.map((c) => (
              <Link
                key={c.id}
                to={`/messages/${c.id}`}
                className={`flex gap-3 p-3 hover:bg-surface-container-low transition-colors ${
                  c.id === conversationId ? 'bg-surface-container-low' : ''
                }`}
              >
                <div className="w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center">
                  <Icon name={c.kind === 'system' ? 'smart_toy' : 'storefront'} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-label-md text-on-surface truncate">
                      {c.kind === 'system'
                        ? 'AmaZara Assistant'
                        : c.counterpart?.name ?? `Store ${String(c.storeId ?? '').slice(0, 6)}`}
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
              </Link>
            ))}
          </div>
        </aside>

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
                <div className="w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center">
                  <Icon name={active.kind === 'system' ? 'smart_toy' : 'storefront'} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-label-md text-on-surface">
                    {active.kind === 'system'
                      ? 'AmaZara Assistant'
                      : active.counterpart?.name ?? `Store ${String(active.storeId ?? '').slice(0, 6)}`}
                  </div>
                  <div className="text-body-sm text-on-surface-variant">
                    {typingByChat[active.id] ? 'typing…' : 'Online'}
                  </div>
                </div>
              </header>

              <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-3 bg-surface-container-low">
                {messages.map((m) => (
                  <MessageBubble
                    key={m.id}
                    message={m}
                    conversationId={conversationId}
                  />
                ))}
                {streamingText && <StreamingBubble text={streamingText} />}
              </div>

              <form
                onSubmit={submit}
                className="flex items-center gap-2 border-t border-outline-variant p-3 bg-surface"
              >
                <input
                  value={text}
                  onChange={onChange}
                  className="field flex-1 px-4 py-2 text-body-sm"
                  placeholder="Write a message…"
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
                <p className="mt-3 text-body-md">Select a conversation to start chatting</p>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
