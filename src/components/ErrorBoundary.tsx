import { Component, type ErrorInfo, type ReactNode } from "react";
import { reportUiCrash } from "../api";
import { t } from "../i18n";

export default class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {

    reportUiCrash(
      error.message || String(error),
      `${error.stack ?? ""}\n--- дерево ---${info.componentStack ?? ""}`,
      "react"
    );
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="grid h-full w-full place-items-center bg-bg px-8 text-center">
        <div className="max-w-md">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-card text-xl text-accent">
            <i className="fa-solid fa-triangle-exclamation" />
          </div>
          <h2 className="text-[15px] font-medium text-text">{t("Лаунчер сломался")}</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">
            {t(
              "Что-то пошло не так на этом экране. Отчёт об ошибке сохранён — если отправка отчётов включена, он уйдёт разработчику."
            )}
          </p>
          <p className="selectable mt-3 break-words rounded-lg bg-card px-3 py-2 text-left font-mono text-[11px] text-muted">
            {error.message || String(error)}
          </p>
          <button
            onClick={() => this.setState({ error: null })}
            className="mx-auto mt-4 rounded-lg bg-accent px-5 py-2 text-sm font-bold text-bg transition-colors hover:bg-accent-hover active:bg-accent-active"
          >
            {t("Попробовать снова")}
          </button>
        </div>
      </div>
    );
  }
}
