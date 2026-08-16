
export const DEV = false;

export const ACIRON_LOGIN_ENABLED = true;

export const APP_VERSION: string =
  typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev";
export const APP_CHANNEL: string =
  typeof __APP_CHANNEL__ !== "undefined" ? __APP_CHANNEL__ : "local";

export const APP_STAGE = "beta";

export const DEBUG_TOOLS: boolean = APP_CHANNEL !== "stable";

export const GITHUB_URL =
  APP_CHANNEL === "dev"
    ? "https://github.com/Aciron-Team/aciron-launcher-dev"
    : "https://github.com/Acizecu/aciron-launcher";
