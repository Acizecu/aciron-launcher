import { useEffect, useMemo, useState } from "react";
import { serverStatus, cachedServerStatus, type ServerStatus } from "../api";
import { cardInDelay } from "../anim";
import { useLauncherCtx } from "../LauncherContext";
import { useToast } from "../ToastContext";
import { locale, t } from "../i18n";

type GameServer = {
  name: string;
  ip: string;
  version: string;
  desc?: string;
};

const SERVERS: GameServer[] = [

];

function fmt(n: number): string {
  return n.toLocaleString(locale());
}

function initials(name: string): string {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, " ").split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function ServerRow({ s, index }: { s: GameServer; index: number }) {

  const [st, setSt] = useState<ServerStatus | null>(() => cachedServerStatus(s.ip));
  const [loading, setLoading] = useState(() => cachedServerStatus(s.ip) === null);
  const [copied, setCopied] = useState(false);
  const { launch, status } = useLauncherCtx();
  const toast = useToast();

  const busy = status === "running";

  useEffect(() => {
    let alive = true;
    if (!cachedServerStatus(s.ip)) setLoading(true);

    serverStatus(s.ip)
      .then((r) => alive && setSt(r))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [s.ip]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(s.ip);
      setCopied(true);
      toast(t("Адрес {ip} скопирован", { ip: s.ip }), "info");
      setTimeout(() => setCopied(false), 1500);
    } catch {

    }
  };

  const connect = () => {
    if (busy) return;
    launch(s.version, s.ip);
    toast(t("Запуск {version} и подключение к {name}…", { version: s.version, name: s.name }), "success");
  };

  return (
    <div
      style={cardInDelay(index)}
      className="card-in flex items-center gap-4 rounded-[16px] border-1 border-[#232427]/65 bg-card p-3 transition-colors hover:border-accent/40"
    >
      {}
      <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-[12px] text-lg font-bold text-muted">
        {st?.icon ? (
          <img src={st.icon} alt="" className="h-full w-full object-cover" />
        ) : (
          initials(s.name)
        )}
      </div>

      {}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[15px] font-medium text-text">{s.name}</span>
          {loading ? (
            <span className="shrink-0 rounded-md bg-bg px-1.5 py-0.5 text-[10px] text-muted">
              <i className="fa-solid fa-spinner fa-spin" />
            </span>
          ) : (
            <span
              className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                st?.online ? "bg-[#22c55e]/15 text-[#22c55e]" : "bg-muted/15 text-muted"
              }`}
            >
              {st?.online ? t("онлайн") : t("оффлайн")}
            </span>
          )}
        </div>

        <div className="mt-0.5 truncate whitespace-pre-line text-[12px] text-[#818181]">
          {st?.motd || s.desc || s.ip}
        </div>

      </div>

      {}
      <div className="hidden shrink-0 text-right leading-tight sm:block">
        {st?.online ? (
          <>
            <div className="flex items-center justify-end gap-1.5 text-[13px]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#22c55e]" />
              <span className="font-semibold text-text">{fmt(st.players_online)}</span>
              <span className="text-muted">/ {fmt(st.players_max)}</span>
            </div>
            <div className="text-[11px] text-[#818181]">{s.version}</div>
          </>
        ) : (
          <div className="text-[11px] text-[#818181]">{s.version}</div>
        )}
      </div>

      <button
        onClick={connect}
        disabled={busy}
        title={t("Запустить {version} и зайти на сервер", { version: s.version })}
        className="h-9 w-[92px] shrink-0 rounded-[8px] bg-accent text-sm font-semibold text-bg transition-colors hover:bg-accent-hover active:bg-accent-active disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? <i className="fa-solid fa-spinner fa-spin" /> : t("Играть")}
      </button>

      <button
        onClick={copy}
        title={t("Скопировать адрес")}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-[8px] bg-bg text-muted transition-colors hover:text-accent"
      >
        <i className={`fa-solid ${copied ? "fa-check text-[#22c55e]" : "fa-copy"} text-sm`} />
      </button>
    </div>
  );
}

export default function ServersPage() {
  const [query, setQuery] = useState("");

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SERVERS;
    return SERVERS.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.ip.toLowerCase().includes(q)
    );
  }, [query]);

  return (
    <div className="flex h-full min-h-0 flex-col px-8 py-6">
      {}
      <div className="mb-5 flex items-baseline gap-3">
        <h1 className="text-[30px] font-light leading-none text-text">
          {t("Сервера")}
        </h1>
        <div className="ml-auto flex h-10 w-[260px] items-center gap-2 rounded-xl border border-border bg-card px-3">
          <i className="fa-solid fa-magnifying-glass text-xs text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("Поиск сервера")}
            className="w-full bg-transparent text-sm text-text outline-none placeholder:text-muted"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              title={t("Очистить")}
              className="shrink-0 text-muted transition-colors hover:text-text"
            >
              <i className="fa-solid fa-xmark text-xs" />
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto py-1 pr-1 pb-4">
        {SERVERS.length === 0 ? (
          <div className="grid h-full place-items-center text-center">
            <div className="max-w-xs">
              <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-card text-xl text-accent">
                <i className="fa-solid fa-server" />
              </div>
              <p className="text-sm text-muted">
                {t("Список пуст. Хочешь попасть сюда? Покупай слот на https:")}
              </p>
            </div>
          </div>
        ) : list.length === 0 ? (
          <div className="rounded-[16px] bg-card p-4 text-center text-xs text-muted">
            {t("Ничего не нашлось")}
          </div>
        ) : (
          list.map((s, i) => <ServerRow key={s.ip} s={s} index={i} />)
        )}
      </div>
    </div>
  );
}
