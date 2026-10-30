import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

type ToastAction = { label: string; onClick: () => void };
type ToastPayload = { message: string; action?: ToastAction; sticky?: boolean };

const ToastContext = createContext<(payload: ToastPayload) => void>(() => undefined);

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastPayload | null>(null);
  const timer = useRef<number | null>(null);

  const push = useCallback((payload: ToastPayload) => {
    if (timer.current) window.clearTimeout(timer.current);
    setToast(payload);
    if (!payload.sticky) {
      timer.current = window.setTimeout(() => setToast(null), 2600);
    }
  }, []);

  const value = useMemo(() => push, [push]);

  useEffect(() => {
    const handler = () =>
      push({
        message: "有新版本",
        action: { label: "刷新", onClick: () => location.reload() },
        sticky: true,
      });
    window.addEventListener("sw-update", handler);
    return () => window.removeEventListener("sw-update", handler);
  }, [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast && (
        <div className="toast">
          <span>{toast.message}</span>
          {toast.action && (
            <button type="button" onClick={toast.action.onClick}>
              {toast.action.label}
            </button>
          )}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function Dialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <div className="dialog" onMouseDown={(event) => event.stopPropagation()}>
        <div className="row between">
          <h2 style={{ margin: 0 }}>{title}</h2>
          <button type="button" className="btn ghost small" onClick={onClose}>
            关闭
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
