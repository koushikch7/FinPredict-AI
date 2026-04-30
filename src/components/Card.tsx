import type { ReactNode } from 'react';

interface Props {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClass?: string;
}

export function Card({ title, subtitle, action, children, className = '', bodyClass = '' }: Props) {
  return (
    <div className={`surface surface-hover ${className}`}>
      {(title || action) && (
        <div className="flex items-start justify-between gap-4 px-5 sm:px-6 pt-5 sm:pt-6">
          <div>
            {title && <h3 className="col-header">{title}</h3>}
            {subtitle && <p className="text-xs text-slate-500 mt-1">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      <div className={`p-5 sm:p-6 ${bodyClass}`}>{children}</div>
    </div>
  );
}

interface BadgeProps {
  variant?: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
  children: ReactNode;
}
export function Badge({ children, variant = 'neutral' }: BadgeProps) {
  const variants = {
    neutral: 'bg-slate-100 text-slate-700 ring-1 ring-slate-200',
    success: 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200',
    warning: 'bg-amber-50 text-amber-800 ring-1 ring-amber-200',
    danger: 'bg-rose-50 text-rose-800 ring-1 ring-rose-200',
    info: 'bg-sky-50 text-sky-800 ring-1 ring-sky-200',
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono uppercase tracking-tight ${variants[variant]}`}
    >
      {children}
    </span>
  );
}

export function Stat({
  label,
  value,
  hint,
  positive,
  negative,
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  positive?: boolean;
  negative?: boolean;
  icon?: ReactNode;
}) {
  const tone = positive ? 'is-positive' : negative ? 'is-negative' : '';
  return (
    <div className={`surface stat-card p-5 sm:p-6 ${tone}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="col-header">{label}</div>
        {icon && (
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-50 to-fuchsia-50 text-indigo-600 flex items-center justify-center">
            {icon}
          </div>
        )}
      </div>
      <div
        className={`text-2xl sm:text-3xl font-display font-black tracking-tighter ${
          positive ? 'text-emerald-700' : negative ? 'text-rose-700' : 'text-slate-900'
        }`}
      >
        {value}
      </div>
      {hint && <div className="text-[10px] text-slate-500 mt-2 uppercase tracking-widest">{hint}</div>}
    </div>
  );
}
