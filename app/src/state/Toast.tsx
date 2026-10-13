import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type Kind = "info" | "success" | "error";
interface Toast { id: number; kind: Kind; text: string }
const Ctx = createContext<{ toast: (text: string, kind?: Kind) => void }>({ toast: () => undefined });
export const useToast = () => useContext(Ctx).toast;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const toast = useCallback((text: string, kind: Kind = "info") => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x.slice(-2), { id, kind, text }]);
    window.setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), kind === "error" ? 5000 : 3000);
  }, []);
  const value = useMemo(() => ({ toast }), [toast]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>)}
      </div>
    </Ctx.Provider>
  );
}
