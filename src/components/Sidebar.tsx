

import { useMemo } from "react";
import { useChat } from "../chat";
import { t as tr, useLang } from "../i18n";
import Icon from "./Icon";

export type NavId =
  | "home"
  | "builds"
  | "mods"
  | "wardrobe"
  | "screenshots"
  | "friends"
  | "settings"
  | "servers";

const topItems: { id: NavId; label: string; icon: string }[] = [
  { id: "home", label: "Главная", icon: "fa-house" },
  { id: "builds", label: "Сборки", icon: "fa-cubes" },
  { id: "mods", label: "Моды", icon: "fa-puzzle-piece" },
  { id: "wardrobe", label: "Гардероб", icon: "fa-shirt" },
  { id: "screenshots", label: "Скриншоты", icon: "fa-images" },
  { id: "servers", label: "Сервера", icon: "fa-server" },
  { id: "friends", label: "Друзья", icon: "fa-comments" },
];

function Item({
  id,
  label,
  icon,
  active,
  onSelect,
  badge,
}: {
  id: NavId;
  label: string;
  icon: string;
  active: NavId;
  onSelect: (id: NavId) => void;
  badge: number;
}) {
  const isActive = active === id;
  const name = tr(label);
  return (
    <button
      onClick={() => onSelect(id)}
      title={badge > 0 ? tr("{name}: новых сообщений {n}", { name, n: badge }) : name}
      aria-current={isActive ? "page" : undefined}
      className={[
        "relative z-10 mx-auto flex h-10 w-10 items-center justify-center rounded-[12px] transition-colors",
        isActive ? "text-accent" : "text-muted hover:bg-white/[0.04] hover:text-text",
      ].join(" ")}
    >
      <Icon cls={`fa-solid ${icon} text-[17px]`} />
      {badge > 0 && (
        <span className="absolute right-2 top-2 min-w-[16px] rounded-full bg-accent px-1 text-[9px] font-medium leading-4 text-bg">
          {badge > 9 ? "9+" : badge}
        </span>
      )}
    </button>
  );
}

export default function Sidebar({
  active,
  onSelect,
}: {
  active: NavId;
  onSelect: (id: NavId) => void;
}) {

  useLang();
  const { unread } = useChat();

  const index = topItems.findIndex((i) => i.id === active);
  const unreadTotal = useMemo(
    () => Object.values(unread).reduce((a, b) => a + b, 0),
    [unread]
  );

  return (

    <aside className="relative flex w-14 shrink-0 flex-col border-r border-white/[0.06] bg-panel/45 backdrop-blur-2xl">
      <nav className="relative flex flex-col gap-1 pt-2">
        {}
        <span
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-2 h-10 w-10 rounded-[12px] bg-white/[0.07] transition-[transform,opacity] duration-500 ease-[var(--ease-out-quint)]"
          style={{
            transform: `translate(-50%, ${Math.max(index, 0) * 44}px)`,
            opacity: index < 0 ? 0 : 1,
          }}
        >
          <span className="absolute -left-[8px] top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-accent" />
        </span>
        {topItems.map((i) => (
          <Item
            key={i.id}
            {...i}
            active={active}
            onSelect={onSelect}
            badge={i.id === "friends" ? unreadTotal : 0}
          />
        ))}
      </nav>

      <div className={["relative mx-auto mb-2 mt-auto rounded-[12px] transition-colors", active === "settings" ? "bg-white/[0.07]" : ""].join(" ")}>
        {active === "settings" && (
          <span className="absolute -left-[8px] top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-accent" />
        )}
          {}
        <Item
          id="settings"
          label={tr("Настройка лаунчера")}
          icon="fa-gear"
          active={active}
          onSelect={onSelect}
          badge={0}
        />
      </div>
    </aside>
  );
}
