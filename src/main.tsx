import React from "react";
import ReactDOM from "react-dom/client";
import "@fortawesome/fontawesome-free/css/all.min.css";
import "@fontsource-variable/geologica";
import App from "./App";
import Splash from "./components/Splash";
import "./index.css";
import { initThemeEarly } from "./ThemeContext";
import { initUiSounds } from "./sfx";
import { syncLangFromSettings } from "./i18n";

initThemeEarly();

initUiSounds();

void syncLangFromSettings();

const isSplash = new URLSearchParams(location.search).get("window") === "splash";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>{isSplash ? <Splash /> : <App />}</React.StrictMode>
);
