import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
  size?: 'sm' | 'md' | 'lg';
  icon?: ReactNode;
  loading?: boolean;
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  icon,
  loading,
  disabled,
  className = '',
  ...rest
}: Props) {
  const base =
    'inline-flex items-center justify-center gap-2 font-medium uppercase tracking-wider rounded-lg transition-all active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-500';
  const sizes = {
    sm: 'px-3 py-1.5 text-[10px]',
    md: 'px-4 py-2 text-xs',
    lg: 'px-6 py-3 text-sm',
  };
  const variants = {
    primary:
      'text-white bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 hover:from-indigo-700 hover:via-violet-700 hover:to-fuchsia-700 shadow-md shadow-indigo-500/20 disabled:from-slate-400 disabled:via-slate-400 disabled:to-slate-400 disabled:shadow-none',
    secondary:
      'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 hover:border-slate-400 shadow-sm disabled:opacity-50',
    ghost: 'text-slate-700 hover:bg-slate-100 disabled:opacity-50',
    danger: 'text-white bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700 shadow-md shadow-rose-500/20',
    success:
      'text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-md shadow-emerald-500/20',
  };
  return (
    <button
      disabled={loading || disabled}
      className={`${base} ${sizes[size]} ${variants[variant]} ${className} ${
        disabled || loading ? 'cursor-not-allowed' : 'cursor-pointer'
      }`}
      {...rest}
    >
      {loading ? <span className="animate-pulse">…</span> : icon}
      {children}
    </button>
  );
}
