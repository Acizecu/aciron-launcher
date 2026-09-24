import Dropdown from "./Dropdown";
import { ModrinthIcon, CurseForgeIcon, FtbIcon } from "./Icons";
import { t } from "../i18n";
import Icon from "./Icon";

export type Source = "modrinth" | "curseforge" | "ftb";

export const SOURCES: {
  id: Source;
  label: string;
  Icon: (p: { size?: number; className?: string }) => React.ReactElement;
  ready: boolean;
}[] = [
  { id: "modrinth", label: "Modrinth", Icon: ModrinthIcon, ready: true },
  { id: "curseforge", label: "CurseForge", Icon: CurseForgeIcon, ready: true },
  { id: "ftb", label: "FTB", Icon: FtbIcon, ready: true },
];

export default function SourceMenu({
  value,
  onChange,
  allow,
}: {
  value: Source;
  onChange: (s: Source) => void;
  allow?: Source[];
}) {
  const sources = allow ? SOURCES.filter((s) => allow.includes(s.id)) : SOURCES;
  const options = sources.map((s) => ({
    value: s.id,
    label: s.label,
    node: <s.Icon size={16} />,
  }));

  return (
    <Dropdown
      value={value}
      options={options}
      onChange={(v) => onChange(v as Source)}
      align="right"
      className="w-44"
    />
  );
}

export function SourceComingSoon({ source }: { source: Source }) {
  const s = SOURCES.find((x) => x.id === source)!;
  return (
    <div className="grid flex-1 place-items-center px-6 text-center">
      <div className="max-w-sm">
        <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-[18px] bg-white/[0.04]">
          <s.Icon size={34} />
        </div>
        <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-[12.5px] font-medium text-accent">
          <Icon cls="fa-solid fa-hammer text-[11.5px]" />
          {t("В разработке")}
        </div>
        <h2 className="text-lg font-semibold text-text">{s.label}</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          {t(
            "Загрузка из {source} появится в одном из ближайших обновлений. Пока используйте Modrinth.",
            { source: s.label }
          )}
        </p>
      </div>
    </div>
  );
}
