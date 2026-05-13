import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import Icon from '../components/Icon.jsx';

const ToastContext = createContext(null);
const DEFAULT_DURATION = 2500;

let nextId = 1;

const KIND_STYLES = {
  success: {
    container: 'bg-emerald-600 text-white border border-emerald-700',
    icon: 'check_circle',
  },
  error: {
    container: 'bg-error text-on-error border border-error',
    icon: 'error',
  },
  info: {
    container: 'bg-surface text-on-surface border border-outline-variant',
    icon: 'info',
  },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const show = useCallback(
    (opts) => {
      const id = nextId++;
      const toast = {
        id,
        kind: opts.kind ?? 'info',
        message: opts.message,
        duration: opts.duration ?? DEFAULT_DURATION,
      };
      setToasts((prev) => [...prev, toast]);
      if (toast.duration > 0) {
        const timer = setTimeout(() => dismiss(id), toast.duration);
        timersRef.current.set(id, timer);
      }
      return id;
    },
    [dismiss],
  );

  useEffect(() => {
    return () => {
      for (const timer of timersRef.current.values()) clearTimeout(timer);
      timersRef.current.clear();
    };
  }, []);

  const value = useMemo(
    () => ({
      show,
      dismiss,
      success: (message, opts = {}) => show({ ...opts, kind: 'success', message }),
      error: (message, opts = {}) => show({ ...opts, kind: 'error', message }),
      info: (message, opts = {}) => show({ ...opts, kind: 'info', message }),
    }),
    [show, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function ToastViewport({ toasts, onDismiss }) {
  if (typeof document === 'undefined') return null;
  return (
    <div
      aria-live="polite"
      className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 max-w-sm w-[min(92vw,360px)] pointer-events-none"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }) {
  const style = KIND_STYLES[toast.kind] ?? KIND_STYLES.info;
  return (
    <div
      role="status"
      onClick={() => onDismiss(toast.id)}
      className={`pointer-events-auto rounded-lg shadow-lifted px-4 py-3 flex items-center gap-3 cursor-pointer animate-toast-in ${style.container}`}
    >
      <Icon name={style.icon} size={20} />
      <span className="text-body-sm flex-1 min-w-0 break-words">{toast.message}</span>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={(e) => {
          e.stopPropagation();
          onDismiss(toast.id);
        }}
        className="-mr-1 p-1 rounded-full hover:bg-black/10 transition-colors"
      >
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
