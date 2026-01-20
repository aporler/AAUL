import React, { useState } from "react";
import { apiFetch } from "../lib/api.js";
import { useI18n } from "../lib/i18n.js";

export default function NewAgent() {
  const { t } = useI18n();
  const [displayName, setDisplayName] = useState("");
  const [command, setCommand] = useState("");
  const [agentId, setAgentId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await apiFetch("/api/agents", {
        method: "POST",
        body: JSON.stringify({ displayName })
      });
      setCommand(data.installCommand);
      setAgentId(data.agentId);
      setDisplayName("");
    } catch (err) {
      setError(err.message || t("errors.addAgent"));
    } finally {
      setLoading(false);
    }
  };

  const copyCommand = async () => {
    if (!command) {
      return;
    }
    await navigator.clipboard.writeText(command);
  };

  return (
    <div className="space-y-6">
      <div className="card">
        <h2 className="text-2xl font-semibold text-white">{t("newAgent.title")}</h2>
        <p className="text-sm text-slate-400">{t("newAgent.subtitle")}</p>
      </div>

      <div className="card">
        <form onSubmit={onSubmit} className="space-y-4">
          <input
            className="input"
            placeholder={t("newAgent.displayName")}
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
          />
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading || !displayName}
          >
            {loading ? t("newAgent.creating") : t("newAgent.addAgent")}
          </button>
        </form>
      </div>

      {command ? (
        <div className="card">
          <p className="text-sm text-slate-400">{t("newAgent.agentId")}</p>
          <p className="font-mono text-sm text-slate-200">{agentId}</p>
          <p className="mt-4 text-sm text-slate-400">{t("newAgent.installCommand")}</p>
          <div className="mt-2 rounded-xl bg-ink-800 p-4 text-sm text-slate-100">
            <code className="break-all font-mono">{command}</code>
          </div>
          <button className="btn btn-secondary mt-4" onClick={copyCommand}>
            {t("newAgent.copyCommand")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
