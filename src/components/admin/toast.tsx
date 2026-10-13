'use client';

import { X } from 'lucide-react';
import { useEffect } from 'react';

export interface ToastData {
  id: number;
  message: string;
  action?: { label: string; run: () => void };
}

/** A short-lived message in the corner, with an optional action (Undo). */
export function Toast({ toast, onClose }: { toast: ToastData | null; onClose: () => void }) {
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(onClose, 12_000);
    return () => window.clearTimeout(timer);
  }, [toast, onClose]);

  return (
    <div aria-live="polite" className="fixed right-4 bottom-4 z-50 max-w-[calc(100%-2rem)]">
      {toast && (
        <div
          role="status"
          className="flex items-center gap-3 rounded-lg border border-border bg-text py-2 pr-2 pl-4 text-bg shadow-xl"
        >
          <span className="text-sm">{toast.message}</span>
          {toast.action && (
            <button
              type="button"
              onClick={() => {
                toast.action?.run();
                onClose();
              }}
              className="min-h-11 rounded-md px-3 text-sm font-bold underline-offset-4 hover:underline"
            >
              {toast.action.label}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Dismiss"
            className="inline-flex size-11 items-center justify-center rounded-md opacity-80 hover:opacity-100"
          >
            <X aria-hidden className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}
