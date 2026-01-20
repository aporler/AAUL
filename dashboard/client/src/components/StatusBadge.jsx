import React from "react";
import { useI18n } from "../lib/i18n.js";

const statusStyles = {
  OK: "bg-emerald-500/20 text-emerald-300",
  ERROR: "bg-red-500/20 text-red-300",
  QUEUED: "bg-yellow-500/20 text-yellow-300",
  IN_PROGRESS: "bg-blue-500/20 text-blue-300",
  DONE: "bg-emerald-500/20 text-emerald-300"
};

export default function StatusBadge({ label }) {
  const { t } = useI18n();
  if (!label) {
    return <span className="text-xs text-slate-500">-</span>;
  }
  const translations = {
    OK: t("status.ok"),
    ERROR: t("status.error"),
    QUEUED: t("status.queued"),
    IN_PROGRESS: t("status.inProgress"),
    DONE: t("status.done")
  };
  const display = translations[label] || label;
  const className = statusStyles[label] || "bg-slate-500/20 text-slate-300";
  return (
    <span className={`badge whitespace-nowrap text-[11px] ${className}`}>
      {display}
    </span>
  );
}
