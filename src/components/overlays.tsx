import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { IconCheck, IconXmark } from './icons';

// iOS-style alerts, pull-down menus, action sheets, toasts and modal sheets.

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
  /** Shown on the trailing edge, like an SF Symbol in a UIMenu. */
  icon?: ReactNode;
  /** Shows a leading checkmark column; true draws the check. */
  checked?: boolean;
  /** Starts a new group, separated by a thick divider. */
  divider?: boolean;
}

interface MenuRequest {
  title?: string;
  message?: string;
  actions: SheetAction<unknown>[];
  anchor: DOMRect | null;
  pointer: { x: number; y: number } | null;
  resolve: (v: unknown) => void;
}

interface UI {
  alert(title: string, message?: string): Promise<void>;
  confirm(opts: { title: string; message?: string; confirm: string; destructive?: boolean }): Promise<boolean>;
  /**
   * A menu of choices. With an anchor element it opens as a pull-down menu
   * next to it; without one it rises from the bottom as an action sheet.
   */
  actionSheet<T>(opts: {
    title?: string;
    message?: string;
    actions: SheetAction<T>[];
    anchor?: Element | null;
  }): Promise<T | null>;
  toast(message: string): void;
}

const UIContext = createContext<UI | null>(null);

export function useUI(): UI {
  const ui = useContext(UIContext);
  if (!ui) throw new Error('useUI must be used inside UIProvider');
  return ui;
}

// Where the last tap landed, so menus on wide rows open near the finger.
let lastPointer: { x: number; y: number } | null = null;
if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', (e) => (lastPointer = { x: e.clientX, y: e.clientY }), { capture: true, passive: true });
}

function useClosing(onDone: () => void, ms = 200) {
  const [closing, setClosing] = useState(false);
  const close = useCallback(() => {
    setClosing(true);
    setTimeout(onDone, ms);
  }, [onDone, ms]);
  return { closing, close };
}

function AlertView({ req, onDone }: { req: AlertRequest; onDone: () => void }) {
  const stacked = req.buttons.length > 2;
  // iOS puts the preferred action on the trailing side; stacked alerts put it first.
  const buttons = stacked ? [...req.buttons].reverse() : req.buttons;
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
            {buttons.map((b) => (
              <button
                key={b.label}
                className={[
                  b.style === 'destructive' ? 'destructive' : '',
                  b.style !== 'cancel' ? 'bold' : '',
                ].join(' ')}
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

function MenuView({ req, onDone }: { req: MenuRequest; onDone: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const result = useRef<unknown>(null);
  const [pos, setPos] = useState<CSSProperties | null>(null);
  const { closing, close } = useClosing(() => {
    req.resolve(result.current);
    onDone();
  }, req.anchor ? 160 : 230);
  const choose = (v: unknown) => {
    result.current = v;
    close();
  };

  useLayoutEffect(() => {
    const r = req.anchor;
    const el = ref.current;
    if (!r || !el) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);
    // Wide anchors (list rows) open under the finger; buttons align to their nearer edge.
    const wide = r.width > vw * 0.5;
    const cx = wide && req.pointer ? req.pointer.x : r.left + r.width / 2;
    const rawLeft = wide ? cx - w / 2 : r.left + r.width / 2 > vw / 2 ? r.right - w : r.left;
    const left = clamp(rawLeft, 12, vw - w - 12);
    let top: number;
    let originY: string;
    if (r.bottom + 8 + h <= vh - 12) {
      top = r.bottom + 8;
      originY = 'top';
    } else if (r.top - 8 - h >= 12) {
      top = r.top - 8 - h;
      originY = 'bottom';
    } else {
      top = clamp(vh - h - 12, 12, vh);
      originY = 'center';
    }
    setPos({ left, top, transformOrigin: `${clamp(cx - left, 0, w)}px ${originY}` });
  }, [req]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && choose(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const anchored = !!req.anchor;
  const hasChecks = req.actions.some((a) => a.checked !== undefined);
  return createPortal(
    <>
      <div className={`overlay ${anchored ? 'clear' : ''} ${closing ? 'closing' : ''}`} onClick={() => choose(null)} />
      <div
        ref={ref}
        role="menu"
        className={`menu ${anchored ? '' : 'bottom'} ${closing ? 'closing' : ''}`}
        style={anchored ? { ...(pos ?? { visibility: 'hidden', left: 0, top: 0 }) } : undefined}
      >
        {(req.title || req.message) && (
          <div className="menu-title" style={anchored ? undefined : { textAlign: 'center' }}>
            {req.title && <b>{req.title}</b>}
            {req.message}
          </div>
        )}
        {req.actions.map((a, i) => (
          <div key={`${a.label}-${i}`}>
            {a.divider ? <div className="menu-divider" /> : (i > 0 || req.title || req.message) && <div className="menu-sep" />}
            <button
              role="menuitem"
              className={`menu-item ${a.destructive ? 'destructive' : ''}`}
              disabled={a.disabled}
              onClick={() => choose(a.value)}
            >
              {hasChecks && anchored && <span className="menu-check">{a.checked && <IconCheck size={16} />}</span>}
              <span className="menu-label">{a.label}</span>
              {a.icon && anchored && <span className="menu-icon">{a.icon}</span>}
            </button>
          </div>
        ))}
        {!anchored && (
          <div className="menu-cancel">
            <button onClick={() => choose(null)}>Cancel</button>
          </div>
        )}
      </div>
    </>,
    document.body,
  );
}

export function UIProvider({ children }: { children: ReactNode }) {
  const [alerts, setAlerts] = useState<AlertRequest[]>([]);
  const [menu, setMenu] = useState<MenuRequest | null>(null);
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
    actionSheet: <T,>(opts: { title?: string; message?: string; actions: SheetAction<T>[]; anchor?: Element | null }) =>
      new Promise<T | null>((resolve) =>
        setMenu({
          title: opts.title,
          message: opts.message,
          actions: opts.actions as SheetAction<unknown>[],
          anchor: opts.anchor?.isConnected ? opts.anchor.getBoundingClientRect() : null,
          pointer: lastPointer,
          resolve: resolve as (v: unknown) => void,
        }),
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
      {menu && <MenuView req={menu} onDone={() => setMenu(null)} />}
      {alerts[0] && <AlertView key={alerts.length} req={alerts[0]} onDone={() => setAlerts((a) => a.slice(1))} />}
      {toast && createPortal(<div key={toast.id} className="toast" role="status">{toast.message}</div>, document.body)}
    </UIContext.Provider>
  );
}

/** A card-style modal sheet that floats up from the bottom, like iOS. */
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
      }, 260);
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
              <button className="nav-btn icon" onClick={onClose} aria-label="Close">
                <IconXmark />
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
