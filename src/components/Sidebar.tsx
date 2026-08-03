

import { useMemo } from "react";
import { useChat } from "../chat";

export type NavId = "home" | "builds" | "wardrobe" | "friends" | "settings" | "servers";

const topItems: { id: NavId; label: string; icon: string }[] = [
  { id: "home", label: "Главная", icon: "fa-house" },
  { id: "wardrobe", label: "Гардероб", icon: "fa-shirt" },
  { id: "builds", label: "Сборки", icon: "fa-cubes" },
  { id: "servers", label: "Сервера", icon: "fa-server" },
  { id: "friends", label: "Друзья", icon: "fa-comments" },
];

// Item вынесен на уровень модуля: раньше он объявлялся внутри тела Sidebar,
// поэтому был новым типом компонента на каждый рендер и React размонтировал/
// монтировал все кнопки заново вместо диффа. Разметка и поведение идентичны.
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
  return (
    <button
      onClick={() => onSelect(id)}
      title={badge > 0 ? `${label}: новых сообщений ${badge}` : label}
      className={[
        "relative flex h-12 w-full items-center justify-center transition-colors",
        isActive ? "text-accent" : "text-muted hover:text-text",
        "hover:bg-card rounded-[4px]",
      ].join(" ")}
    >
      {isActive && (
        <span className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r bg-accent" />
      )}
      <i className={`fa-solid ${icon} text-[18px]`} />
      {badge > 0 && (
        <span className="absolute right-2 top-2 min-w-[16px] rounded-full bg-accent px-1 text-[9px] font-bold leading-4 text-bg">
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

  const { unread } = useChat();
  const unreadTotal = useMemo(
    () => Object.values(unread).reduce((a, b) => a + b, 0),
    [unread]
  );

  return (
    <aside className="flex w-14 shrink-0 flex-col bg-bg">
      <nav className="flex flex-col pt-2">
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

      <div className="mt-auto pb-2">
          {}
        <Item
          id="settings"
          label="Настройка лаунчера"
          icon="fa-gear"
          active={active}
          onSelect={onSelect}
          badge={0}
        />
      </div>
    </aside>
  );
}
