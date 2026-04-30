import { createContext, useContext, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, AlertCircle } from 'lucide-react';

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface Ctx {
  notify: (message: string, type?: Toast['type']) => void;
}

const ToastCtx = createContext<Ctx | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const notify = (message: string, type: Toast['type'] = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  };

  return (
    <ToastCtx.Provider value={{ notify }}>
      {children}
      <div className="fixed top-3 left-3 right-3 sm:top-6 sm:right-6 sm:left-auto z-[100] space-y-2 pointer-events-none flex flex-col items-end">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className={`pointer-events-auto px-4 py-3 rounded-xl border shadow-lg flex items-center gap-3 max-w-md w-full sm:w-auto backdrop-blur ${
                t.type === 'success'
                  ? 'bg-emerald-50/95 text-emerald-900 border-emerald-200'
                  : t.type === 'error'
                    ? 'bg-rose-50/95 text-rose-900 border-rose-200'
                    : 'bg-amber-50/95 text-amber-900 border-amber-200'
              }`}
            >
              {t.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
              <span className="text-xs font-bold tracking-wider">{t.message}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const c = useContext(ToastCtx);
  if (!c) throw new Error('useToast outside provider');
  return c;
}
