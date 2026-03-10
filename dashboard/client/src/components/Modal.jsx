import React from "react";

const SIZE_MAP = {
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl"
};

export default function Modal({ open, title, onClose, children, size = "lg" }) {
  if (!open) {
    return null;
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/78 p-4 backdrop-blur-sm">
      <div className={`card w-full ${SIZE_MAP[size] || SIZE_MAP.lg} animate-float-in border border-ink-600/90 bg-[linear-gradient(160deg,rgba(14,24,46,0.96),rgba(7,13,30,0.98))] shadow-[0_30px_90px_rgba(2,6,23,0.55)]`}>
        <div className="mb-4 flex items-start justify-between gap-4 border-b border-ink-700/80 pb-4">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.34em] text-ocean-300/80">
              AAUL
            </p>
            <h2 className="mt-2 text-lg font-semibold text-white">{title}</h2>
          </div>
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-ink-600 bg-ink-900/70 text-slate-400 transition hover:border-ink-500 hover:text-slate-200"
              aria-label="Close dialog"
            >
              x
            </button>
          ) : null}
        </div>
        <div>{children}</div>
      </div>
    </div>
  );
}
