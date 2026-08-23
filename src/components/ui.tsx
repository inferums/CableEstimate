import { useEffect, useRef, useState, type ReactNode } from "react";
import { fmt } from "../lib/calc";

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
      { threshold: 0.08, rootMargin: "0px 0px -40px 0px" },
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

/* ================= section shell ================= */
export function Section({
  num,
  title,
  sub,
  children,
  className = "",
  hideHeaderOnPrint = false,
}: {
  num: string;
  title: string;
  sub?: string;
  children: ReactNode;
  className?: string;
  hideHeaderOnPrint?: boolean;
}) {
  const hdr = hideHeaderOnPrint ? "print-hide" : "";
  return (
    <Reveal className={className}>
      <section className="relative">
        <div className={`mb-4 flex items-baseline gap-4 ${hdr}`}>
          <span className="font-mono text-sm font-semibold tracking-widest text-amber border border-amber/50 px-2 py-0.5 bg-amber/10">
            {num}
          </span>
          <h2 className="font-display text-xl sm:text-2xl uppercase tracking-wide text-white">
            {title}
          </h2>
          <span className="hidden sm:block flex-1 border-t border-dashed border-line2 relative top-[-4px]" />
        </div>
        {sub && <p className={`-mt-2 mb-4 text-sm text-mut ${hdr}`}>{sub}</p>}
        {children}
      </section>
    </Reveal>
  );
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`corners border border-line bg-panel ${className}`}>{children}</div>
  );
}

/* ================= inputs ================= */
export function NumInput({
  value,
  onChange,
  step = 0.1,
  min = 0,
  className = "",
  placeholder,
  suffix,
}: {
  value: number;
  onChange: (n: number) => void;
  step?: number;
  min?: number;
  className?: string;
  placeholder?: string;
  suffix?: string;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => {
    setDraft((d) => {
      const parsed = parseFloat(d.replace(",", "."));
      return parsed === value ? d : String(value);
    });
  }, [value]);

  return (
    <div className={`relative ${className}`}>
      <input
        type="number"
        inputMode="decimal"
        step={step}
        min={min}
        placeholder={placeholder}
        className="w-full bg-panel2 border border-line2 px-3 py-2 pr-9 font-mono text-sm text-cyan2 outline-none transition-colors focus:border-amber/70 hover:border-line2/90 placeholder:text-mut2"
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          const n = parseFloat(e.target.value.replace(",", "."));
          if (!Number.isNaN(n)) onChange(Math.max(min, n));
        }}
      />
      {suffix && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-xs text-mut2 pointer-events-none">
          {suffix}
        </span>
      )}
    </div>
  );
}

export function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="block mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-mut">
        {label}
      </span>
      {children}
    </label>
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
      className={`w-full bg-panel2 border border-line2 px-3 py-2 pr-8 font-mono text-sm text-cyan2 outline-none cursor-pointer transition-colors hover:border-line2/90 focus:border-amber/70 ${className}`}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value} className="bg-panel text-white">
          {o.label}
        </option>
      ))}
    </select>
  );
}

/* ================= buttons ================= */
export function BtnPrimary({
  onClick,
  children,
  disabled,
  className = "",
}: {
  onClick?: () => void;
  children: ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`btn inline-flex items-center justify-center gap-2 bg-amber text-deep font-semibold text-sm px-4 py-2.5 border border-amber hover:bg-amber2 disabled:opacity-40 disabled:pointer-events-none shadow-[0_4px_18px_-6px_rgba(245,165,36,0.55)] ${className}`}
    >
      {children}
    </button>
  );
}

export function BtnGhost({
  onClick,
  children,
  className = "",
  title,
}: {
  onClick?: () => void;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`btn inline-flex items-center justify-center gap-2 bg-transparent text-mut font-medium text-sm px-4 py-2.5 border border-line2 hover:text-amber2 hover:border-amber/60 ${className}`}
    >
      {children}
    </button>
  );
}

/* ================= custom inline icons ================= */
const S = "stroke-current";
export const IconGnb = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg viewBox="0 0 32 32" fill="none" className={className}>
    <path d="M2 11h28" className={S} strokeWidth="1.8" />
    <path d="M6 11v-3M11 11V6M16 11V4.5M21 11V6M26 11V8" className={S} strokeWidth="1.4" opacity="0.5" />
    <path d="M5 18c4-4 18-4 22 0" className={S} strokeWidth="1.8" strokeLinecap="round" />
    <circle cx="27.5" cy="18.6" r="2.2" className={S} strokeWidth="1.6" />
    <path d="M5 18v4m22 .6V26" className={S} strokeWidth="1.4" strokeDasharray="2 3" />
  </svg>
);
export const IconBlock = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg viewBox="0 0 32 32" fill="none" className={className}>
    <path d="M2 8h28" className={S} strokeWidth="1.8" />
    <rect x="7" y="12" width="18" height="14" className={S} strokeWidth="1.7" />
    <circle cx="12.5" cy="17" r="2.1" className={S} strokeWidth="1.5" />
    <circle cx="19.5" cy="17" r="2.1" className={S} strokeWidth="1.5" />
    <circle cx="16" cy="22.5" r="2.1" className={S} strokeWidth="1.5" />
  </svg>
);
export const IconLotok = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg viewBox="0 0 32 32" fill="none" className={className}>
    <path d="M2 8h28" className={S} strokeWidth="1.8" />
    <path d="M8 13v9h16v-9" className={S} strokeWidth="1.8" />
    <path d="M5 11.5h22" className={S} strokeWidth="2.2" />
    <path d="M12 18.5h8" className={S} strokeWidth="1.4" strokeDasharray="2.5 2.5" />
  </svg>
);
export const IconOpen = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg viewBox="0 0 32 32" fill="none" className={className}>
    <path d="M2 9h10m8 0h10" className={S} strokeWidth="1.8" />
    <path d="M12 9l3 14h2l3-14" className={S} strokeWidth="1.8" />
    <circle cx="16" cy="20" r="1.9" className={S} strokeWidth="1.5" />
    <path d="M4 12l2 2m20-2l-2 2" className={S} strokeWidth="1.3" opacity="0.6" />
  </svg>
);
export const IconDownload = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg viewBox="0 0 20 20" fill="none" className={className}>
    <path d="M10 3v9m0 0l-3.5-3.5M10 12l3.5-3.5M3.5 15.5h13" className={S} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
export const IconPrint = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg viewBox="0 0 20 20" fill="none" className={className}>
    <path d="M5.5 7V3.5h9V7" className={S} strokeWidth="1.6" />
    <rect x="3" y="7" width="14" height="6.5" className={S} strokeWidth="1.6" />
    <rect x="5.5" y="11.5" width="9" height="5" className={S} strokeWidth="1.6" />
  </svg>
);
export const IconPlus = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg viewBox="0 0 20 20" fill="none" className={className}>
    <path d="M10 4v12M4 10h12" className={S} strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);
export const IconTrash = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg viewBox="0 0 20 20" fill="none" className={className}>
    <path d="M4 6h12M8 6V4.5h4V6M6 6l.8 10.5h6.4L14 6M8.3 9v5m3.4-5v5" className={S} strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);
export const IconWarn = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg viewBox="0 0 20 20" fill="none" className={className}>
    <path d="M10 3L2.5 16.5h15L10 3z" className={S} strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M10 8v4m0 2.4v.1" className={S} strokeWidth="1.7" strokeLinecap="round" />
  </svg>
);
export const Logo = ({ className = "w-9 h-9" }: { className?: string }) => (
  <svg viewBox="0 0 40 40" fill="none" className={className}>
    <rect x="1" y="1" width="38" height="38" className={S} strokeWidth="2" />
    <path d="M6 13h28" stroke="var(--color-amber)" strokeWidth="2.4" />
    <circle cx="14.5" cy="24" r="5" stroke="var(--color-cyan)" strokeWidth="2" />
    <circle cx="27" cy="24" r="5" stroke="var(--color-cyan)" strokeWidth="2" />
    <circle cx="14.5" cy="24" r="1.6" fill="var(--color-cyan)" />
    <circle cx="27" cy="24" r="1.6" fill="var(--color-cyan)" />
    <path d="M6 9h6M30 9h4" className={S} strokeWidth="1.4" opacity="0.6" />
  </svg>
);
