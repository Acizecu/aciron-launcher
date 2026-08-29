import React from "react";
import ReactDOM from "react-dom/client";
import "@fortawesome/fontawesome-free/css/all.min.css";
import "@fontsource-variable/geologica";
import App from "./App";
import Splash from "./components/Splash";
import ErrorBoundary from "./components/ErrorBoundary";
import "./index.css";
import { initThemeEarly } from "./ThemeContext";
import { initUiSounds } from "./sfx";
import { syncLangFromSettings } from "./i18n";
import { reportUiCrash } from "./api";

initThemeEarly();

initUiSounds();

void syncLangFromSettings();

const isSplash = new URLSearchParams(location.search).get("window") === "splash";

window.addEventListener("error", (e) => {
  reportUiCrash(
    e.message || "ошибка без сообщения",
    e.error instanceof Error ? (e.error.stack ?? "") : "",
    `${e.filename ?? ""}:${e.lineno ?? 0}`
  );
});
window.addEventListener("unhandledrejection", (e) => {
  const r = e.reason;
  reportUiCrash(
    r instanceof Error ? r.message : String(r),
    r instanceof Error ? (r.stack ?? "") : "",
    "promise"
  );
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>{isSplash ? <Splash /> : <App />}</ErrorBoundary>
  </React.StrictMode>
);
