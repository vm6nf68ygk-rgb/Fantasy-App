import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

// iOS-style alerts, action sheets, toasts and modal sheets.

interface AlertButton {
  label: string;
  style?: 'default' | 'cancel' | 'destructive';
  value: boolean;
}

interface AlertRequest {
  title: string;
  message?: string;
  buttons: AlertButton[];
  resolve: (v: boolean) => void;
}

export interface SheetAction<T> {
  label: string;
  value: T;
  destructive?: boolean;
  disabled?: boolean;
}

interface ActionSheetRequest {
  title?: string;
  message?: string;
  actions: SheetAction<unknown>[];
  resolve: (v: unknown) => void;
}

interface UI {
  alert(title: string, message?: string): Promise<void>;
  confirm(opts: { title: string; message?: string; confirm: string; destructive?: boolean }): Promise<boolean>;
  actionSheet<T>(opts: { title?: string; message?: string; actions: SheetAction<T>[] }): Promise<T | null>;
  toast(message: string): void;
}

const UIContext = createContext<UI | null>(null);

export function useUI(): UI {
  const ui = useContext(UIContext);
  if (!ui) throw new Error('useUI must be used inside UIProvider');
  return ui;
}

function useClosing(onDone: () => void, ms = 240) {
  const [closing, setClosing] = useState(false);
  const close = useCallback(() => {
    setClosing(true);
    setTimeout(onDone, ms);
  }, [onDone, ms]);
  return { closing, close };
}

function AlertView({ req, onDone }: { req: AlertRequest; onDone: () => void }) {
  const stacked = req.buttons.length > 2;
  return createPortal(
    <>
      <div className="overlay" />
      <div className="alert-wrap" role="alertdialog" aria-modal="true" aria-label={req.title}>
        <div className="alert">
          <div className="alert-text">
            <div className="alert-title">{req.title}</div>
            {req.message && <div className="alert-message">{req.message}</div>}
          </div>
          <div className={`alert-actions ${stacked ? 'stacked' : ''}`}>
            {req.buttons.map((b) => (
              <button
                key={b.label}
                className={`${b.style === 'destructive' ? 'destructive' : ''} ${b.style !== 'cancel' && req.buttons.length > 1 ? 'bold' : ''} ${req.buttons.length === 1 ? 'bold' : ''}`}
                onClick={() => {
                  req.resolve(b.value);
                  onDone();
                }}
              >
                {b.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}

function ActionSheetView({ req, onDone }: { req: ActionSheetRequest; onDone: () => void }) {
  const result = useRef<unknown>(null);
  const { closing, close } = useClosing(() => {
    req.resolve(result.current);
    onDone();
  });
  const choose = (v: unknown) => {
    result.current = v;
    close();
  };
  return createPortal(
    <>
      <div className={`overlay ${closing ? 'closing' : ''}`} onClick={() => choose(null)} />
      <div className={`action-sheet ${closing ? 'closing' : ''}`} role="dialog" aria-modal="true">
        <div className="action-group">
          {(req.title || req.message) && (
            <div className="as-title">
              {req.title}
              {req.message && <small>{req.message}</small>}
            </div>
          )}
          {req.actions.map((a) => (
            <button
              key={a.label}
              className={a.destructive ? 'destructive' : ''}
              disabled={a.disabled}
              onClick={() => choose(a.value)}
            >
              {a.label}
            </button>
          ))}
        </div>
        <div className="action-group">
          <button className="cancel" onClick={() => choose(null)}>
            Cancel
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}

export function UIProvider({ children }: { children: ReactNode }) {
  const [alerts, setAlerts] = useState<AlertRequest[]>([]);
  const [sheet, setSheet] = useState<ActionSheetRequest | null>(null);
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null);

  const ui = useRef<UI>({
    alert: (title, message) =>
      new Promise<void>((resolve) =>
        setAlerts((a) => [...a, { title, message, buttons: [{ label: 'OK', value: true }], resolve: () => resolve() }]),
      ),
    confirm: ({ title, message, confirm, destructive }) =>
      new Promise<boolean>((resolve) =>
        setAlerts((a) => [
          ...a,
          {
            title,
            message,
            resolve,
            buttons: [
              { label: 'Cancel', style: 'cancel', value: false },
              { label: confirm, style: destructive ? 'destructive' : 'default', value: true },
            ],
          },
        ]),
      ),
    actionSheet: <T,>(opts: { title?: string; message?: string; actions: SheetAction<T>[] }) =>
      new Promise<T | null>((resolve) =>
        setSheet({ ...opts, actions: opts.actions as SheetAction<unknown>[], resolve: resolve as (v: unknown) => void }),
      ),
    toast: (message) => setToast({ id: Date.now(), message }),
  });

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <UIContext.Provider value={ui.current}>
      {children}
      {sheet && <ActionSheetView req={sheet} onDone={() => setSheet(null)} />}
      {alerts[0] && <AlertView key={alerts.length} req={alerts[0]} onDone={() => setAlerts((a) => a.slice(1))} />}
      {toast && createPortal(<div key={toast.id} className="toast" role="status">{toast.message}</div>, document.body)}
    </UIContext.Provider>
  );
}

/** A card-style modal sheet that slides up from the bottom, like iOS. */
export function Sheet({
  open,
  onClose,
  title,
  left,
  right,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  left?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
}) {
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
    } else if (mounted) {
      setClosing(true);
      const t = setTimeout(() => {
        setMounted(false);
        setClosing(false);
      }, 240);
      return () => clearTimeout(t);
    }
  }, [open, mounted]);
  useEffect(() => {
    if (!mounted) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mounted]);
  if (!mounted) return null;
  return createPortal(
    <>
      <div className={`overlay ${closing ? 'closing' : ''}`} onClick={onClose} />
      <div className={`sheet ${closing ? 'closing' : ''}`} role="dialog" aria-modal="true">
        <div className="sheet-grabber" />
        <div className="sheet-header">
          <div style={{ justifySelf: 'start' }}>{left}</div>
          <div className="sheet-title">{title}</div>
          <div style={{ justifySelf: 'end' }}>
            {right ?? (
              <button className="nav-btn bold" onClick={onClose}>
                Done
              </button>
            )}
          </div>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </>,
    document.body,
  );
}
