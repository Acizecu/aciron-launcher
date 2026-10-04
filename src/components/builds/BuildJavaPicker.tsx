import Dropdown from "../Dropdown";
import Icon from "../Icon";
import { pickFile } from "../../api";
import { t } from "../../i18n";

export default function BuildJavaPicker({ runtime, path, onRuntime, onPath, disabled = false }: {
  runtime: string;
  path: string;
  onRuntime: (value: string) => void;
  onPath: (value: string) => void;
  disabled?: boolean;
}) {
  const browse = async () => {
    const file = await pickFile("Java", ["exe"], path || undefined);
    if (file) onPath(file);
  };
  return (
    <div>
      <span className="field-label">{t("Java для сборки")}</span>
      <Dropdown
        value={runtime}
        onChange={onRuntime}
        disabled={disabled}
        options={[
          { value: "", label: t("Автоматически — под версию Minecraft") },
          { value: "jre-legacy", label: "Java 8" },
          { value: "java-runtime-gamma", label: "Java 17" },
          { value: "java-runtime-delta", label: "Java 21" },
          { value: "java-runtime-epsilon", label: "Java 25" },
          { value: "custom", label: t("Своя Java — указать файл") },
        ]}
      />
      {runtime === "custom" && (
        <div className="mt-2 flex gap-2">
          <input
            aria-label={t("Путь к Java")}
            value={path}
            onChange={(event) => onPath(event.target.value)}
            placeholder="C:\\Program Files\\Java\\jdk-21\\bin\\javaw.exe"
            disabled={disabled}
            className="field h-11 min-w-0 flex-1 px-3 text-[13px]"
          />
          <button type="button" className="btn btn-ghost" onClick={browse} disabled={disabled} title={t("Выбрать файл Java")}>
            <Icon cls="fa-solid fa-folder-open" />
          </button>
        </div>
      )}
      <p className="mt-1.5 text-[12px] text-muted">
        {t("Выбранная Java используется только для этой сборки. Версии из списка скачиваются при первом запуске.")}
      </p>
    </div>
  );
}
