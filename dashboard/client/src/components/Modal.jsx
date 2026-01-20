import React from "react";

export default function Modal({ open, title, onClose, children }) {
  if (!open) {
    return null;
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="card w-full max-w-lg animate-float-in">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            X
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
