import { useCallback, useEffect, useRef, useState } from "react";
import RecentCard from "./RecentCard";
import FriendsPanel from "./FriendsPanel";
import { getRecents, removeRecent, type Recent } from "../api";
import { CARD_FALL_MS } from "../anim";
import { useFlip } from "../hooks/useFlip";
import { useLang } from "../i18n";

export default function Home() {
  const { t } = useLang();
  const [recents, setRecents] = useState<Recent[]>([]);
  const [dying, setDying] = useState<string[]>([]);
  const gridRef = useRef<HTMLDivElement>(null);

  useFlip(gridRef, recents.map((r) => r.id).join());

  const load = useCallback(() => {
    getRecents().then(setRecents).catch(() => {});
  }, []);

  useEffect(() => {
    load();

    window.addEventListener("focus", load);
    return () => window.removeEventListener("focus", load);
  }, [load]);

  const drop = (id: string) => {
    if (dying.includes(id)) return;
    setDying((d) => [...d, id]);
    setTimeout(() => {
      setRecents((list) => list.filter((r) => r.id !== id));
      setDying((d) => d.filter((x) => x !== id));
      removeRecent(id).catch(() => {});
    }, CARD_FALL_MS);
  };

  return (
    <div className="flex h-full min-h-0 gap-6 px-8 py-6">
      <section className="flex min-w-0 flex-1 flex-col">
        <h1 className="mb-5 text-[30px] font-light leading-none text-text">
          {t("Последние запуски")}
        </h1>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {recents.length === 0 ? (
            <div className="grid h-full place-items-center text-center">
              <div className="max-w-xs">
                <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-card text-xl text-accent">
                  <i className="fa-solid fa-clock-rotate-left" />
                </div>
                <p className="text-sm text-muted">
                  {t(
                    "Здесь появятся версии и сборки, в которые вы играли. Запустите игру снизу."
                  )}
                </p>
              </div>
            </div>
          ) : (
            <div ref={gridRef} className="flex flex-wrap gap-[18px] pb-2">
              {recents.map((r, i) => (
                <RecentCard
                  key={r.id}
                  recent={r}
                  index={i}
                  dying={dying.includes(r.id)}
                  onRemove={() => drop(r.id)}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      <FriendsPanel />
    </div>
  );
}
