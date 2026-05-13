import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import {
  listStoreChats,
  listStoreMessages,
  markStoreRead,
  sendStoreMessage,
} from '../../services/chat.js';
import {
  connect,
  emitTyping,
  onConnectionChange,
  onMessage,
  onTyping,
} from '../../services/chatSocket.js';

export function useStoreChat() {
  const { token } = useAuth();
  const [chats, setChats] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [typing, setTyping] = useState(false);
  const [connected, setConnected] = useState(false);
  const typingTimer = useRef(null);

  const refresh = useCallback(async () => {
    const res = await listStoreChats();
    setChats(res.items ?? []);
    return res.items ?? [];
  }, []);

  const open = useCallback(async (id) => {
    setActiveId(id);
    const res = await listStoreMessages(id);
    setMessages(res.items ?? []);
    markStoreRead(id).catch(() => null);
  }, []);

  const send = useCallback(
    async (body) => {
      if (!activeId || !body.trim()) return;
      const res = await sendStoreMessage(activeId, body);
      setMessages((prev) => [...prev, ...(res.messages ?? [])]);
    },
    [activeId],
  );

  useEffect(() => {
    if (!token) return;
    connect(token);
    const offMsg = onMessage((p) => {
      if (p.conversationId === activeId) {
        setMessages((prev) => {
          if (prev.some((m) => String(m.id) === String(p.message.id))) return prev;
          return [...prev, p.message];
        });
      }
      refresh();
    });
    const offTyp = onTyping((p) => {
      if (p.conversationId !== activeId) return;
      if (p.party === 'store') return;
      setTyping(p.kind === 'start');
      if (p.kind === 'start') {
        clearTimeout(typingTimer.current);
        typingTimer.current = setTimeout(() => setTyping(false), 4000);
      }
    });
    const offConn = onConnectionChange(setConnected);
    refresh();
    return () => {
      offMsg();
      offTyp();
      offConn();
    };
  }, [token, activeId, refresh]);

  const emitMyTyping = useCallback(
    (start) => {
      if (activeId) emitTyping(activeId, start);
    },
    [activeId],
  );

  return {
    chats,
    activeId,
    messages,
    typing,
    connected,
    open,
    send,
    refresh,
    emitTyping: emitMyTyping,
  };
}
