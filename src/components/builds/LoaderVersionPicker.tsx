import { useEffect, useMemo, useRef, useState } from "react";
import Dropdown from "../Dropdown";
import { loaderVersions, type Loader, type LoaderVersion } from "../../api";
import { t } from "../../i18n";
import Icon from "../Icon";

export default function LoaderVersionPicker({
  loader,
  mcVersion,
  value,
  onChange,
  disabled,
}: {
  loader: Loader;
  mcVersion: string;

  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const [list, setList] = useState<LoaderVersion[] | null>(null);
  const [failed, setFailed] = useState(false);
  const key = `${loader}|${mcVersion}`;
  const prevKey = useRef(key);

  useEffect(() => {
    if (prevKey.current !== key) {
      prevKey.current = key;
      onChange("");
    }
    if (!mcVersion) return;
    let alive = true;
    setList(null);
    setFailed(false);
    loaderVersions(loader, mcVersion)
      .then((v) => alive && setList(v))
      .catch(() => {
        if (!alive) return;
        setList([]);
        setFailed(true);
      });
    return () => {
      alive = false;
    };

  }, [key, loader, mcVersion]);

  const options = useMemo(() => {
    const head = { value: "", label: t("Последняя (обновляется сама)") };
    const rest = (list ?? []).map((v) => ({
      value: v.version,
      label: v.stable ? t("{version}, рекомендуется", { version: v.version }) : v.version,
    }));

    if (value && !rest.some((o) => o.value === value)) {
      rest.unshift({ value, label: t("{version}, нет в списке", { version: value }) });
    }
    return [head, ...rest];
  }, [list, value]);

  if (list === null && mcVersion) {
    return (
      <div className="flex h-10 items-center gap-2 rounded-[14px] border border-line bg-white/[0.04] px-3 text-sm text-muted">
        <Icon cls="fa-solid fa-spinner fa-spin text-[12px]" />
        {t("Загрузка версий")}
      </div>
    );
  }

  return (
    <>
      <Dropdown
        value={value}
        onChange={onChange}
        options={options}
        disabled={disabled || !mcVersion}
        placeholder={t("Последняя (обновляется сама)")}
      />
      {failed && (
        <p className="mt-1.5 text-[12px] text-muted">
          {t("Список версий ядра не загрузился — будет поставлена последняя.")}
        </p>
      )}
    </>
  );
}
