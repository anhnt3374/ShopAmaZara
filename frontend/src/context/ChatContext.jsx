import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useAuth } from './AuthContext.jsx';
import {
  listChats,
  listMessages,
  markRead as apiMarkRead,
  openStoreChat as apiOpenStoreChat,
  openSystemChat as apiOpenSystemChat,
  sendMessage as apiSendMessage,
} from '../services/chat.js';
import {
  connect,
  disconnect,
  emitTyping,
  onConnectionChange,
  onMessage,
  onRead,
  onTyping,
} from '../services/chatSocket.js';

const ChatContext = createContext(null);

export function ChatProvider({ children }) {
  const { token, isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState('system'); // 'system' | 'stores' | 'faq'
  const [activeStoreChatId, setActiveStoreChatId] = useState(null);

  const [chats, setChats] = useState([]);
  const [messagesByChat, setMessagesByChat] = useState({});
  const [typingByChat, setTypingByChat] = useState({});
  const [connected, setConnected] = useState(false);
  // Snapshot of each conversation's lastReadAt taken when it was opened, used
  // to draw the "New messages" divider. Captured before markRead so it survives
  // the read refresh; overwritten on each fresh open (server lastReadAt advances).
  const [readBoundaryByChat, setReadBoundaryByChat] = useState({});

  const typingTimers = useRef({});
  // Cached promise for the single system (assistant) conversation; collapses
  // concurrent/repeat opens (StrictMode double-mount) into one request.
  const systemChatPromise = useRef(null);
  // Live mirrors so openConversation stays referentially stable (must not
  // re-fire effects when messages change, or the divider boundary would reset).
  const chatsRef = useRef([]);
  const loadMessagesRef = useRef(null);

  const openChat = useCallback((nextView = 'system') => {
    setOpen(true);
    setView(nextView);
  }, []);
  const closeChat = useCallback(() => setOpen(false), []);
  const toggleChat = useCallback(() => setOpen((v) => !v), []);

  const refreshChats = useCallback(async () => {
    if (!isAuthenticated) {
      setChats([]);
      return [];
    }
    try {
      const res = await listChats();
      setChats(res.items ?? []);
      return res.items ?? [];
    } catch {
      return [];
    }
  }, [isAuthenticated]);

  const loadMessages = useCallback(
    async (conversationId, { force = false } = {}) => {
      if (!conversationId) return [];
      if (!force && messagesByChat[conversationId]) {
        return messagesByChat[conversationId];
      }
      const res = await listMessages(conversationId);
      setMessagesByChat((prev) => ({ ...prev, [conversationId]: res.items ?? [] }));
      return res.items ?? [];
    },
    [messagesByChat],
  );

  const sendMessage = useCallback(
    async (conversationId, body) => {
      if (!body.trim()) return;
      const res = await apiSendMessage(conversationId, body);
      setMessagesByChat((prev) => {
        const existing = prev[conversationId] ?? [];
        const ids = new Set(existing.map((m) => String(m.id)));
        const additions = (res.messages ?? []).filter((m) => !ids.has(String(m.id)));
        return { ...prev, [conversationId]: [...existing, ...additions] };
      });
      setChats((prev) =>
        prev.map((c) =>
          c.id === conversationId
            ? { ...c, updatedAt: new Date().toISOString() }
            : c,
        ),
      );
      return res.messages;
    },
    [],
  );

  const markRead = useCallback(async (conversationId) => {
    try {
      await apiMarkRead(conversationId);
      setChats((prev) =>
        prev.map((c) => (c.id === conversationId ? { ...c, unread: 0 } : c)),
      );
    } catch {
      /* swallow */
    }
  }, []);

  // Keep refs fresh so openConversation can be a stable callback.
  useEffect(() => {
    chatsRef.current = chats;
  }, [chats]);
  useEffect(() => {
    loadMessagesRef.current = loadMessages;
  }, [loadMessages]);

  // Open a conversation: snapshot the read boundary (for the unread divider)
  // BEFORE marking it read, then load messages and mark read. Stable identity.
  const openConversation = useCallback(
    async (conversationId) => {
      if (!conversationId) return;
      const summary = chatsRef.current.find((c) => c.id === conversationId);
      setReadBoundaryByChat((prev) => ({
        ...prev,
        [conversationId]: summary?.lastReadAt ?? null,
      }));
      await loadMessagesRef.current?.(conversationId);
      markRead(conversationId);
    },
    [markRead],
  );

  const ensureSystemChat = useCallback(async () => {
    if (systemChatPromise.current) return systemChatPromise.current;
    const p = (async () => {
      const res = await apiOpenSystemChat();
      await refreshChats();
      return res.conversation.id;
    })();
    systemChatPromise.current = p;
    try {
      return await p;
    } catch (err) {
      systemChatPromise.current = null; // allow retry on failure
      throw err;
    }
  }, [refreshChats]);

  const ensureStoreChat = useCallback(
    async (storeId) => {
      const res = await apiOpenStoreChat(storeId);
      await refreshChats();
      return res.conversation.id;
    },
    [refreshChats],
  );

  const handleIncomingMessage = useCallback((payload) => {
    const { conversationId, message } = payload;
    setMessagesByChat((prev) => {
      const existing = prev[conversationId] ?? [];
      if (existing.some((m) => String(m.id) === String(message.id))) return prev;
      return { ...prev, [conversationId]: [...existing, message] };
    });
    setChats((prev) => {
      const idx = prev.findIndex((c) => c.id === conversationId);
      if (idx === -1) return prev;
      const next = [...prev];
      const isFromOther = message.senderKind !== 'buyer';
      next[idx] = {
        ...next[idx],
        lastMessage: {
          body: message.body,
          senderKind: message.senderKind,
          createdAt: message.createdAt,
        },
        updatedAt: message.createdAt,
        unread: isFromOther ? (next[idx].unread ?? 0) + 1 : next[idx].unread,
      };
      return next;
    });
  }, []);

  const handleTyping = useCallback((payload) => {
    const { conversationId, kind } = payload;
    setTypingByChat((prev) => ({ ...prev, [conversationId]: kind === 'start' }));
    if (kind === 'start') {
      clearTimeout(typingTimers.current[conversationId]);
      typingTimers.current[conversationId] = setTimeout(() => {
        setTypingByChat((prev) => ({ ...prev, [conversationId]: false }));
      }, 4000);
    }
  }, []);

  const handleRead = useCallback(() => {
    refreshChats();
  }, [refreshChats]);

  useEffect(() => {
    if (!token) {
      disconnect();
      setConnected(false);
      systemChatPromise.current = null; // a different user must resolve their own
      return;
    }
    const s = connect(token);
    if (!s) return;
    const offMsg = onMessage(handleIncomingMessage);
    const offTyp = onTyping(handleTyping);
    const offRead = onRead(handleRead);
    const offConn = onConnectionChange(setConnected);
    refreshChats();
    return () => {
      offMsg();
      offTyp();
      offRead();
      offConn();
    };
  }, [token, handleIncomingMessage, handleTyping, handleRead, refreshChats]);

  useEffect(() => {
    if (!connected) return;
    if (activeStoreChatId) loadMessages(activeStoreChatId, { force: true });
    const sysId = chats.find((c) => c.kind === 'system')?.id;
    if (sysId) loadMessages(sysId, { force: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  const unreadSystem = useMemo(
    () =>
      chats
        .filter((c) => c.kind === 'system')
        .reduce((s, c) => s + (c.unread ?? 0), 0),
    [chats],
  );
  const unreadStores = useMemo(
    () =>
      chats
        .filter((c) => c.kind === 'store')
        .reduce((s, c) => s + (c.unread ?? 0), 0),
    [chats],
  );
  const unreadTotal = unreadSystem + unreadStores;

  const value = useMemo(
    () => ({
      open, view, setView, openChat, closeChat, toggleChat,
      activeStoreChatId, setActiveStoreChatId,
      chats, refreshChats,
      messagesByChat, loadMessages,
      sendMessage, markRead, openConversation,
      readBoundaryByChat,
      ensureSystemChat, ensureStoreChat,
      unreadTotal, unreadSystem, unreadStores, typingByChat,
      emitTyping,
      connected,
    }),
    [
      open, view, openChat, closeChat, toggleChat,
      activeStoreChatId,
      chats, refreshChats,
      messagesByChat, loadMessages,
      sendMessage, markRead, openConversation,
      readBoundaryByChat,
      ensureSystemChat, ensureStoreChat,
      unreadTotal, unreadSystem, unreadStores, typingByChat,
      connected,
    ],
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat must be used within ChatProvider');
  return ctx;
}
