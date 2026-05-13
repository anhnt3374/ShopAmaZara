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

  const typingTimers = useRef({});

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

  const ensureSystemChat = useCallback(async () => {
    const res = await apiOpenSystemChat();
    await refreshChats();
    return res.conversation.id;
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

  const unreadTotal = useMemo(
    () => chats.reduce((s, c) => s + (c.unread ?? 0), 0),
    [chats],
  );

  const value = useMemo(
    () => ({
      open, view, setView, openChat, closeChat, toggleChat,
      activeStoreChatId, setActiveStoreChatId,
      chats, refreshChats,
      messagesByChat, loadMessages,
      sendMessage, markRead,
      ensureSystemChat, ensureStoreChat,
      unreadTotal, typingByChat,
      emitTyping,
      connected,
    }),
    [
      open, view, openChat, closeChat, toggleChat,
      activeStoreChatId,
      chats, refreshChats,
      messagesByChat, loadMessages,
      sendMessage, markRead,
      ensureSystemChat, ensureStoreChat,
      unreadTotal, typingByChat,
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
