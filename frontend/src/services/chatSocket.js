import { io } from 'socket.io-client';

const SOCKET_PATH = '/ws/chat';
const SOCKET_URL = import.meta.env.VITE_API_BASE_URL ?? '';

let socket = null;
let currentToken = null;

export function connect(token) {
  if (!token) return null;
  if (socket && currentToken === token && socket.connected) return socket;
  if (socket && currentToken !== token) {
    socket.disconnect();
    socket = null;
  }
  currentToken = token;
  socket = io(SOCKET_URL || undefined, {
    path: SOCKET_PATH,
    transports: ['websocket'],
    auth: { token },
    reconnection: true,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5000,
  });
  return socket;
}

export function disconnect() {
  if (socket) {
    socket.disconnect();
    socket = null;
    currentToken = null;
  }
}

export function getSocket() {
  return socket;
}

export function onMessage(handler) {
  if (!socket) return () => {};
  socket.on('message:new', handler);
  return () => socket?.off('message:new', handler);
}

export function onTyping(handler) {
  if (!socket) return () => {};
  const start = (p) => handler({ ...p, kind: 'start' });
  const stop = (p) => handler({ ...p, kind: 'stop' });
  socket.on('typing:start', start);
  socket.on('typing:stop', stop);
  return () => {
    socket?.off('typing:start', start);
    socket?.off('typing:stop', stop);
  };
}

export function onRead(handler) {
  if (!socket) return () => {};
  socket.on('read', handler);
  return () => socket?.off('read', handler);
}

export function onConnectionChange(handler) {
  if (!socket) return () => {};
  const onConn = () => handler(true);
  const onDis = () => handler(false);
  socket.on('connect', onConn);
  socket.on('disconnect', onDis);
  return () => {
    socket?.off('connect', onConn);
    socket?.off('disconnect', onDis);
  };
}

export function emitTyping(conversationId, start) {
  if (!socket) return;
  socket.emit(start ? 'typing:start' : 'typing:stop', { conversationId });
}

export function sendChatAction({ conversationId, action, preorderId, payload }) {
  if (!socket) return false;
  socket.emit('message:action', { conversationId, action, preorderId, payload });
  return true;
}
