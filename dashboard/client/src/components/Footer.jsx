import React from "react";
import { useI18n } from "../lib/i18n.js";
import { APP_VERSION } from "../lib/appVersion.js";

export default function Footer() {
  const { t } = useI18n();
  return (
    <footer className="mt-8 text-center text-xs text-slate-500">
      <div>{t("footer.version", { version: APP_VERSION })}</div>
      <div>{t("footer.by")}</div>
    </footer>
  );
}