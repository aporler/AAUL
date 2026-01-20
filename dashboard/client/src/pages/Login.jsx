import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../components/AuthProvider.jsx";
import { useI18n } from "../lib/i18n.js";
import LanguageToggle from "../components/LanguageToggle.jsx";
import Footer from "../components/Footer.jsx";

export default function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { t } = useI18n();

  const onSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(username, password);
      navigate("/dashboard");
    } catch (err) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="card w-full animate-float-in">
          <div className="mb-4 flex justify-end">
            <LanguageToggle />
          </div>
          <div className="mb-6">
            <p className="text-xs uppercase tracking-[0.35em] text-ocean-300">
              {t("login.secureConsole")}
            </p>
            <h1 className="text-2xl font-semibold text-white">{t("login.title")}</h1>
            <p className="text-sm text-slate-400">{t("login.subtitle")}</p>
          </div>
          <form onSubmit={onSubmit} className="space-y-4">
            <input
              className="input"
              placeholder={t("login.username")}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
            <input
              className="input"
              placeholder={t("login.password")}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            {error ? <p className="text-sm text-red-400">{error}</p> : null}
            <button type="submit" className="btn btn-primary w-full" disabled={loading}>
              {loading ? t("login.signingIn") : t("login.login")}
            </button>
          </form>
        </div>
        <Footer />
      </div>
    </div>
  );
}
