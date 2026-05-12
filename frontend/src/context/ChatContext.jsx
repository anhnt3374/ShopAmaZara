import { createContext, useContext, useMemo, useState, useCallback } from 'react';

const ChatContext = createContext(null);

export function ChatProvider({ children }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState('home'); // home | conversations | faq | conversation

  const openChat = useCallback((nextView = 'home') => {
    setOpen(true);
    setView(nextView);
  }, []);
  const closeChat = useCallback(() => setOpen(false), []);
  const toggleChat = useCallback(() => setOpen((v) => !v), []);

  const value = useMemo(
    () => ({ open, view, setView, openChat, closeChat, toggleChat }),
    [open, view, openChat, closeChat, toggleChat],
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat must be used within ChatProvider');
  return ctx;
}
