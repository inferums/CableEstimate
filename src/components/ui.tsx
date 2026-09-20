import { useEffect, useRef, useState, type ReactNode } from "react";
import { fmt } from "../lib/calc";

/* ================= modal ================= */
export function Modal({
  title,
  sub,
  onClose,
  children,
  footer,
  wide = false,
}: {
  title: string;
  sub?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", h);
      document.body.style.overflow = "";
    };
  }, [onClose]);
  return (
    <div
      className="modal-overlay no-print fixed inset-0 z-[60] bg-ink/45 backdrop-blur-[2px] flex items-start sm:items-center justify-center p-3 sm:p-6 overflow-y-auto"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`modal-card bg-surface border border-line rounded-xl shadow-pop w-full ${
          wide ? "max-w-5xl" : "max-w-xl"
        } my-auto`}
      >
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-line">
          <div>
            <h3 className="font-display text-base uppercase tracking-wide text-ink">{title}</h3>
            {sub && <p className="text-xs text-mut mt-0.5">{sub}</p>}
          </div>
          <button
            onClick={onClose}
            className="btn text-mut2 hover:text-ink hover:bg-well border border-transparent hover:border-line p-1.5 rounded-md"
            aria-label="Закрыть"
          >
            <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="px-5 py-4 max-h-[70vh] overflow-y-auto">{children}</div>
        {footer && <div className="px-5 py-3.5 border-t border-line bg-raise rounded-b-xl flex items-center justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

/* ================= scroll reveal ================= */
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            el.classList.add("revealed");
            io.disconnect();
          }
        }
      },
      { threshold: 0.06, rootMargin: "0px 0px -32px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return ref;
}

export function Reveal({
  children,
  className = "",
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useReveal<HTMLDivElement>();
  return (
    <div ref={ref} className={`reveal ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

/* ================= flash on change ================= */
export function FlashValue({
  value,
  decimals = 2,
  className = "",
}: {
  value: number;
  decimals?: number;
  className?: string;
}) {
  const [key, setKey] = useState(0);
  const prev = useRef(value);
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (prev.current !== value) {
      prev.current = value;
      setKey((k) => k + 1);
    }
  }, [value]);
  return (
    <span key={key} className={`vflash ${className}`}>
      {fmt(value, decimals)}
    </span>
  );
}

/* ================= section card ================= */
export function Section({
  num,
  title,
  sub,
  children,
  className = "",
  hideHeaderOnPrint = false,
  id,
  actions,
}: {
  num: string;
  title: string;
  sub?: string;
  children: ReactNode;
  className?: string;
  hideHeaderOnPrint?: boolean;
  id?: string;
  actions?: ReactNode;
}) {
  const hdr = hideHeaderOnPrint ? "print-hide" : "";
  return (
    <Reveal className={className}>
      <section id={id} className="bg-surface border border-line rounded-xl shadow-card scroll-mt-24">
        <div className={`px-5 sm:px-6 pt-5 ${hdr}`}>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-mono text-[11px] font-bold text-accent bg-accent-soft border border-accent-100 rounded-md px-2 py-1 leading-none">
              {num}
            </span>
            <h2 className="font-display font-semibold text-lg sm:text-xl tracking-tight text-ink">
              {title}
            </h2>
            <span className="hidden sm:block flex-1 border-t border-dashed border-line" />
            {actions && <div className="flex items-center gap-2 no-print">{actions}</div>}
          </div>
          {sub && <p className="mt-2 text-[13px] text-mut leading-relaxed">{sub}</p>}
        </div>
        <div className="p-5 sm:p-6">{children}</div>
      </section>
    </Reveal>
  );
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`bg-surface border border-line rounded-xl shadow-card ${className}`}>{children}</div>;
}

/* ================= inputs ================= */
export function NumInput({
  value,
  onChange,
  step = 0.1,
  min,
  max,
  suffix,
  center,
  className = "",
}: {
  value: number;
  onChange: (n: number) => void;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
  center?: boolean;
  className?: string;
}) {
  const [text, setText] = useState(String(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(String(value));
  }, [value]);
  return (
    <div className={`relative ${className}`}>
      <input
        type="number"
        inputMode="decimal"
        step={step}
        min={min ?? 0}
        max={max}
        value={text}
        onFocus={() => (focused.current = true)}
        onBlur={() => {
          focused.current = false;
          setText(String(value));
        }}
        onChange={(e) => {
          setText(e.target.value);
          const n = parseFloat(e.target.value.replace(",", "."));
          if (Number.isFinite(n) && n >= 0) onChange(n);
        }}
        className={`w-full h-10 bg-raise border border-line rounded-lg font-mono text-sm font-medium text-ink outline-none transition-all focus:bg-surface focus:border-accent focus:ring-4 focus:ring-accent/10 hover:border-line2 ${suffix ? "pl-3 pr-12" : "px-3"} ${center ? "text-center" : ""}`}
      />
      {suffix && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[11px] font-medium text-mut2 pointer-events-none">
          {suffix}
        </span>
      )}
    </div>
  );
}

export function Sel({
  value,
  onChange,
  options,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`sel w-full h-10 bg-raise border border-line rounded-lg pl-3 pr-8 text-sm font-medium text-ink outline-none cursor-pointer transition-all focus:bg-surface focus:border-accent focus:ring-4 focus:ring-accent/10 hover:border-line2 ${className}`}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="block mb-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-mut">
        {label}
      </span>
      {children}
    </label>
  );
}

/* ================= buttons ================= */
export function BtnPrimary({
  children,
  onClick,
  className = "",
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`btn inline-flex items-center justify-center gap-2 bg-accent text-white text-sm font-semibold rounded-lg px-4 h-10 shadow-[0_1px_2px_rgba(29,78,216,0.4),inset_0_1px_0_rgba(255,255,255,0.15)] hover:bg-accent-deep disabled:opacity-40 disabled:pointer-events-none ${className}`}
    >
      {children}
    </button>
  );
}

export function BtnGhost({
  children,
  onClick,
  className = "",
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`btn inline-flex items-center justify-center gap-2 bg-surface text-body text-sm font-semibold rounded-lg px-4 h-10 border border-line hover:border-accent/50 hover:text-accent disabled:opacity-40 disabled:pointer-events-none ${className}`}
    >
      {children}
    </button>
  );
}

/* ================= brand ================= */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="none" aria-hidden>
      <rect width="32" height="32" rx="7" fill="#2563EB" />
      <path
        d="M6 20c4-8 8 4 12-4 2-4 5-4 8-2"
        stroke="#fff"
        strokeWidth="2.4"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="6" cy="20" r="2" fill="#93C5FD" />
      <circle cx="26" cy="14" r="2" fill="#93C5FD" />
    </svg>
  );
}

/* ================= trench type icons (custom) ================= */
export const IconGnb = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M2 7h20" />
    <path d="M5 7c0 6 3 9 7 9s7-3 7-9" strokeDasharray="3 3" />
    <circle cx="12" cy="16" r="2.4" />
    <path d="M2 20h20" opacity=".4" />
  </svg>
);

export const IconBlock = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M2 6h20" />
    <path d="M4 6l3 12h10l3-12" />
    <circle cx="10" cy="14" r="1.7" />
    <circle cx="14" cy="14" r="1.7" />
    <circle cx="12" cy="10.4" r="1.7" />
  </svg>
);

export const IconLotok = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M2 6h20" />
    <path d="M5 6v12h14V6" />
    <path d="M8 9h8v6H8z" />
    <path d="M2 21h20" opacity=".4" />
  </svg>
);

export const IconOpen = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M2 6h20" />
    <path d="M4 6l4 13h8l4-13" />
    <path d="M8.5 14.5h7" strokeDasharray="2.5 2.5" />
  </svg>
);

/* ================= misc icons ================= */
export const IconTrash = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6.5 7l1 12a1.5 1.5 0 0 0 1.5 1.4h6a1.5 1.5 0 0 0 1.5-1.4l1-12M10 11v6M14 11v6" />
  </svg>
);

export const IconPlus = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={className}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const IconDownload = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M12 4v11m0 0 4-4m-4 4-4-4M5 19h14" />
  </svg>
);

export const IconUpload = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M12 16V5m0 0 4 4m-4-4-4 4M5 19h14" />
  </svg>
);

export const IconPrint = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M7 8V4h10v4M7 17H5a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-2M7 14h10v6H7z" />
  </svg>
);

export const IconWarn = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M12 4 2.8 20h18.4L12 4ZM12 10v4m0 3v.2" />
  </svg>
);

/* ================= nav icons ================= */
export const IconBolt = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M13 2 5 13h6l-1 9 9-12h-6l0-8Z" />
  </svg>
);

export const IconLayers = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="m12 3 9 5-9 5-9-5 9-5Z" />
    <path d="m3 13 9 5 9-5" opacity=".55" />
    <path d="m3 17 9 5 9-5" opacity=".3" />
  </svg>
);

export const IconSliders = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" className={className}>
    <path d="M4 8h9M17 8h3M4 16h3M11 16h9" />
    <circle cx="15" cy="8" r="2.2" />
    <circle cx="9" cy="16" r="2.2" />
  </svg>
);

export const IconRoute = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="6" cy="5" r="2.2" />
    <circle cx="18" cy="19" r="2.2" />
    <path d="M8 5h7a4 4 0 0 1 0 8H9a4 4 0 0 0 0 8h7" strokeDasharray="3.5 3" />
  </svg>
);

export const IconDoc = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M6 3h8l4 4v14H6V3Z" />
    <path d="M14 3v4h4" />
    <path d="M9 12h6M9 15.5h6M9 8.5h2" />
  </svg>
);

export const IconShield = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M12 3 5 6v5c0 5 3 8 7 10 4-2 7-5 7-10V6l-7-3Z" />
    <path d="m9 12 2.2 2.2L15.5 10" />
  </svg>
);
