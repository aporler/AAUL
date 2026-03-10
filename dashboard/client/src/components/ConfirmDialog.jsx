import React from "react";
import Modal from "./Modal.jsx";
import { useI18n } from "../lib/i18n.js";

const TONE_BUTTON = {
  primary: "btn btn-primary",
  danger: "btn btn-danger",
  secondary: "btn btn-secondary"
};

/**
 * Reusable confirmation modal used instead of browser-native confirm/alert.
 */
export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onClose,
  tone = "primary",
  loading = false,
  hideCancel = false,
  size = "md"
}) {
  const { t } = useI18n();

  return (
    <Modal open={open} title={title} onClose={onClose} size={size}>
      <div className="space-y-5">
        {description ? (
          <div className="rounded-2xl border border-ink-700 bg-ink-900/55 px-4 py-4 text-sm leading-6 text-slate-300">
            {description}
          </div>
        ) : null}
        <div className="flex flex-wrap justify-end gap-3">
          {!hideCancel ? (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={loading}
            >
              {cancelLabel || t("common.cancel")}
            </button>
          ) : null}
          <button
            type="button"
            className={TONE_BUTTON[tone] || TONE_BUTTON.primary}
            onClick={onConfirm}
            disabled={loading}
          >
            {confirmLabel || t("common.confirm")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
