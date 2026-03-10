import React from "react";

const USED_COLOR = "#4ea1ff";
const FREE_COLOR = "#33f0b5";

export default function DonutChart({
  used,
  total,
  usedLabel,
  freeLabel,
  usedValue,
  freeValue,
  size = 96,
  thickness = 10,
  layout = "row"
}) {
  const safeTotal = Number.isFinite(total) && total > 0 ? total : 0;
  const safeUsed =
    Number.isFinite(used) && used >= 0 ? Math.min(used, safeTotal) : 0;
  const percent = safeTotal ? Math.round((safeUsed / safeTotal) * 100) : 0;
  const hole = Math.max(size - thickness * 2, 0);
  const wrapperClass =
    layout === "stacked"
      ? "flex flex-col items-start gap-3"
      : "flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4";

  return (
    <div className={wrapperClass}>
      <div
        className="relative flex items-center justify-center"
        style={{ width: size, height: size }}
      >
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: `conic-gradient(${USED_COLOR} 0 ${percent}%, ${FREE_COLOR} ${percent}% 100%)`
          }}
        />
        <div
          className="absolute rounded-full bg-ink-900"
          style={{ width: hole, height: hole }}
        />
        <div className="relative text-xs font-semibold text-slate-100">
          {percent}%
        </div>
      </div>
      <div className="space-y-1 text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-ocean-400" />
          <span>
            {usedLabel}: {usedValue}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-neon-500" />
          <span>
            {freeLabel}: {freeValue}
          </span>
        </div>
      </div>
    </div>
  );
}
