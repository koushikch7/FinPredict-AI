import { useState, useRef, useEffect } from 'react';
import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes, ReactNode } from 'react';

const fieldCls =
  'w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none transition-shadow focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 placeholder:text-slate-400';

/**
 * Small inline tooltip surfaced via a `?` info icon. Shows on hover, focus,
 * and click (the click toggle makes it work on touch devices and lets the
 * user read long copy without a hover timeout). Dismisses on outside click
 * or Escape.
 */
function InfoTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <span ref={ref} className="relative inline-block">
      <button
        type="button"
        aria-label={text}
        aria-expanded={open}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((v) => !v); }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-[#141414]/10 hover:bg-[#141414]/20 text-[10px] font-bold cursor-help select-none align-middle"
      >
        ?
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute z-50 left-1/2 -translate-x-1/2 top-full mt-1 w-64 max-w-xs bg-[#141414] text-white text-[11px] leading-snug font-normal normal-case tracking-normal rounded px-2.5 py-1.5 shadow-lg pointer-events-none whitespace-normal"
        >
          {text}
        </span>
      )}
    </span>
  );
}

export function Field({
  label,
  children,
  hint,
  tooltip,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  /** Long-form explanation surfaced via a real popover on hover/focus/click. */
  tooltip?: string;
}) {
  return (
    <label className="block">
      <span className="col-header mb-1 flex items-center gap-1">
        <span>{label}</span>
        {tooltip && <InfoTooltip text={tooltip} />}
      </span>
      {children}
      {hint && <span className="text-[10px] text-[#141414]/50 mt-1 block">{hint}</span>}
    </label>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${fieldCls} ${props.className ?? ''}`} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${fieldCls} ${props.className ?? ''}`} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${fieldCls} resize-y ${props.className ?? ''}`} />;
}
