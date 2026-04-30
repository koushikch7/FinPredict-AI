import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';

/**
 * Lightweight Add-to-Home-Screen prompt.
 *
 * - On Chromium/Edge/Android we capture the `beforeinstallprompt` event and
 *   surface a button that fires the native install dialog.
 * - On iOS Safari (which has no programmatic API) we show a one-time hint
 *   explaining the Share → Add to Home Screen flow.
 * - Once installed (or dismissed), we stay quiet for 30 days.
 */
const DISMISS_KEY = 'finpredict.pwa.installDismissedAt';
const DISMISS_DAYS = 30;

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  // iOS uses navigator.standalone; everyone else uses the media query.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const iosStandalone = (window.navigator as any).standalone === true;
  return iosStandalone || window.matchMedia('(display-mode: standalone)').matches;
}

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios|edgios/i.test(navigator.userAgent);
}

function recentlyDismissed(): boolean {
  try {
    const v = localStorage.getItem(DISMISS_KEY);
    if (!v) return false;
    const ts = Number(v);
    return Number.isFinite(ts) && Date.now() - ts < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

export function InstallPWA() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (isStandalone() || recentlyDismissed()) return;

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setDeferred(null);
      setShowIosHint(false);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);

    // iOS has no API — show the hint after a short delay.
    if (isIOS()) {
      const t = setTimeout(() => setShowIosHint(true), 2500);
      return () => {
        clearTimeout(t);
        window.removeEventListener('beforeinstallprompt', onBeforeInstall);
        window.removeEventListener('appinstalled', onInstalled);
      };
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* storage may be unavailable; in-memory dismissal is fine */
    }
    setDismissed(true);
  };

  if (dismissed) return null;
  if (!deferred && !showIosHint) return null;

  return (
    <div
      className="fixed left-3 right-3 bottom-20 md:bottom-6 md:left-auto md:right-6 md:max-w-sm z-50
                 rounded-2xl border border-indigo-200 bg-white shadow-2xl shadow-indigo-500/10 p-4 pr-3
                 flex items-start gap-3"
      role="dialog"
      aria-label="Install FinPredict-AI"
    >
      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-emerald-500 flex items-center justify-center shrink-0">
        <Download size={18} className="text-white" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold text-slate-900">Install FinPredict</div>
        {deferred ? (
          <p className="text-xs text-slate-600 mt-0.5">Add the app to your home screen for faster access and offline shell.</p>
        ) : (
          <p className="text-xs text-slate-600 mt-0.5">
            Tap <span className="font-semibold">Share</span> → <span className="font-semibold">Add to Home Screen</span> to install.
          </p>
        )}
        {deferred && (
          <button
            onClick={async () => {
              try {
                await deferred.prompt();
                await deferred.userChoice;
              } finally {
                setDeferred(null);
                dismiss();
              }
            }}
            className="mt-2 text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
          >
            Install
          </button>
        )}
      </div>
      <button
        onClick={dismiss}
        aria-label="Dismiss install prompt"
        className="text-slate-400 hover:text-slate-700 p-1 -mt-1 -mr-1"
      >
        <X size={16} />
      </button>
    </div>
  );
}
