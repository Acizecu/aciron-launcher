import { Component, type ErrorInfo, type ReactNode } from "react";
import { reportUiCrash } from "../api";
import { t } from "../i18n";
import Icon from "./Icon";

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
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-accent/12 text-xl text-accent">
            <Icon cls="fa-solid fa-triangle-exclamation" />
          </div>
          <h2 className="text-[15px] font-medium text-text">{t("Лаунчер сломался")}</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">
            {t(
              "Что-то пошло не так на этом экране. Отчёт об ошибке сохранён — если отправка отчётов включена, он уйдёт разработчику."
            )}
          </p>
          <p className="selectable mt-3 break-words rounded-[12px] bg-white/[0.04] px-3 py-2 text-left font-mono text-[12px] text-muted">
            {error.message || String(error)}
          </p>
          <button
            onClick={() => this.setState({ error: null })}
            className="btn-accent mx-auto mt-4 rounded-[12px] px-5 py-2 text-sm font-semibold"
          >
            {t("Попробовать снова")}
          </button>
        </div>
      </div>
    );
  }
}
