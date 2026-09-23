import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconChevronLeft, IconChevronRight, IconSearch, IconXCircle } from './icons';

/** A screen with an iOS navigation bar and a large title that collapses on scroll. */
export function Page({
  title,
  large = true,
  subtitle,
  back,
  left,
  right,
  children,
  tabbar = true,
}: {
  title: string;
  large?: boolean;
  subtitle?: ReactNode;
  back?: string | true;
  left?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  tabbar?: boolean;
}) {
  const [scrolled, setScrolled] = useState(false);
  const navigate = useNavigate();
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > (large ? 36 : 2));
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [large]);
  useEffect(() => {
    document.title = title;
  }, [title]);

  return (
    <div className={`page ${tabbar ? '' : 'no-tabbar'}`}>
      <header className={`navbar ${scrolled ? 'scrolled' : ''} ${large ? '' : 'inline'}`}>
        <div className="navbar-inner">
          <div className="navbar-left">
            {back && (
              <button className="nav-btn" onClick={() => (back === true ? navigate(-1) : navigate(back))}>
                <IconChevronLeft />
                <span>Back</span>
              </button>
            )}
            {left}
          </div>
          <div className="navbar-title">{title}</div>
          <div className="navbar-right">{right}</div>
        </div>
      </header>
      {large && (
        <>
          <h1 className="large-title" style={{ margin: 0 }}>{title}</h1>
          {subtitle && <div className="large-subtitle">{subtitle}</div>}
        </>
      )}
      {!large && <div style={{ height: 12 }} />}
      {children}
    </div>
  );
}

export function Section({
  header,
  footer,
  children,
  prominent,
  action,
  flush,
}: {
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  prominent?: boolean;
  action?: ReactNode;
  flush?: boolean;
}) {
  return (
    <section className="section">
      {(header || action) && (
        <div className={`section-header ${prominent ? 'prominent' : ''}`}>
          <span>{header}</span>
          {action}
        </div>
      )}
      {flush ? children : <div className="list">{children}</div>}
      {footer && <div className="section-footer">{footer}</div>}
    </section>
  );
}

export function Row({
  title,
  subtitle,
  detail,
  leading,
  trailing,
  chevron,
  onClick,
  href,
  variant,
  className = '',
  leadingKind,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  detail?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  chevron?: boolean;
  onClick?: () => void;
  href?: string;
  variant?: 'destructive' | 'action' | 'muted';
  className?: string;
  leadingKind?: 'icon' | 'avatar' | 'slot';
}) {
  const navigate = useNavigate();
  const cls = `row ${variant ?? ''} ${leadingKind ? `has-${leadingKind}` : ''} ${className}`;
  const content = (
    <>
      {leading}
      <div className="row-body">
        <div className="row-title">{title}</div>
        {subtitle && <div className="row-subtitle">{subtitle}</div>}
      </div>
      {detail != null && <div className="row-detail">{detail}</div>}
      {trailing}
      {(chevron || href) && <IconChevronRight className="row-chevron" />}
    </>
  );
  if (onClick || href) {
    return (
      <button className={cls} onClick={onClick ?? (() => navigate(href!))}>
        {content}
      </button>
    );
  }
  return <div className={cls}>{content}</div>;
}

export function RowIcon({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span className="row-icon" style={{ background: color }}>
      {children}
    </span>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="segmented" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={o.value === value}
          className={o.value === value ? 'on' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SearchField({
  value,
  onChange,
  placeholder = 'Search',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="search">
      <IconSearch />
      <input
        type="search"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
      />
      {value && (
        <button onClick={() => onChange('')} aria-label="Clear search" style={{ display: 'flex' }}>
          <IconXCircle />
        </button>
      )}
    </label>
  );
}

export function Spinner({ inline }: { inline?: boolean }) {
  return <div className={`spinner ${inline ? 'inline' : ''}`} role="status" aria-label="Loading" />;
}

export function Empty({
  icon,
  title,
  message,
  action,
}: {
  icon?: ReactNode;
  title: string;
  message?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      {icon && <div className="empty-icon">{icon}</div>}
      <h3>{title}</h3>
      {message && <p>{message}</p>}
      {action}
    </div>
  );
}

export function ErrorNote({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <Empty
      title="Couldn't load"
      message={(error as Error)?.message ?? 'Something went wrong.'}
      action={
        retry && (
          <button className="btn small gray" onClick={retry} style={{ margin: '0 auto' }}>
            Try Again
          </button>
        )
      }
    />
  );
}
