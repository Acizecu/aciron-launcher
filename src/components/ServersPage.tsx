import { useCallback, useEffect, useMemo, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { acironServers, isTauri, serverStatus, cachedServerStatus, type ServerStatus } from "../api";
import { cardInDelay } from "../anim";
import { useLauncherCtx } from "../LauncherContext";
import { useToast } from "../ToastContext";
import { locale, t } from "../i18n";
import Icon from "./Icon";

type GameServer = {
  name: string;
  ip: string;

  version: string;
  desc?: string;
  icon?: string;
};

function launchVersion(s: GameServer, st: ServerStatus | null): string | null {
  if (s.version) return s.version;
  const found = st?.version.match(/\d+\.\d+(\.\d+)?/g);
  return found?.length ? found[found.length - 1] : null;
}

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

  const version = launchVersion(s, st);

  const connect = () => {
    if (busy) return;
    if (!version) {
      toast(t("У сервера не указана версия игры"), "error");
      return;
    }
    launch(version, s.ip);
    toast(t("Запуск {version} и подключение к {name}…", { version, name: s.name }), "success");
  };

  return (
    <div
      style={cardInDelay(index)}
      className="card-in list-row flex items-center gap-4 px-3 py-3"
    >
      {}
      <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-[14px] bg-raised text-lg font-semibold text-muted">
        {s.icon || st?.icon ? (
          <img src={s.icon || st?.icon} alt="" className="h-full w-full object-cover" />
        ) : (
          initials(s.name)
        )}
      </div>

      {}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[15px] font-medium text-text">{s.name}</span>
          {loading ? (
            <span className="tag shrink-0">
              <Icon cls="fa-solid fa-spinner fa-spin" />
            </span>
          ) : (
            <span
              className={`tag shrink-0 ${st?.online ? "tag-ok" : ""}`}
            >
              {st?.online ? t("онлайн") : t("оффлайн")}
            </span>
          )}
        </div>

        <div className="mt-0.5 truncate whitespace-pre-line text-[12px] text-muted">
          {s.desc || st?.motd || s.ip}
        </div>

      </div>

      {}
      <div className="hidden shrink-0 text-right leading-tight sm:block">
        {st?.online ? (
          <>
            <div className="flex items-center justify-end gap-1.5 text-[13px]">
              <span className="h-1.5 w-1.5 rounded-full bg-ok" />
              <span className="font-semibold text-text">{fmt(st.players_online)}</span>
              <span className="text-muted">/ {fmt(st.players_max)}</span>
            </div>
            <div className="text-[12px] text-muted">{version}</div>
          </>
        ) : (
          <div className="text-[12px] text-muted">{version}</div>
        )}
      </div>

      <button
        onClick={connect}
        disabled={busy}
        title={t("Запустить {version} и зайти на сервер", { version: version ?? "" })}
        className="btn btn-sm btn-secondary w-[96px] shrink-0"
      >
        {busy ? <Icon cls="fa-solid fa-spinner fa-spin" /> : t("Играть")}
      </button>

      <button
        onClick={copy}
        title={t("Скопировать адрес")}
        className="btn btn-sm btn-ghost btn-icon shrink-0"
      >
        <Icon cls={`fa-solid ${copied ? "fa-check text-ok" : "fa-copy"} text-sm`} />
      </button>
    </div>
  );
}

let lastServers: GameServer[] | null = null;

export default function ServersPage() {
  const [query, setQuery] = useState("");
  const [servers, setServers] = useState<GameServer[] | null>(lastServers);

  const load = useCallback(async () => {
    const list = await acironServers();
    const mapped = list.map((s) => ({
      name: s.name,
      ip: s.address,
      version: s.version ?? "",
      desc: s.description ?? undefined,
      icon: s.iconUrl ?? undefined,
    }));
    lastServers = mapped;
    setServers(mapped);
  }, []);

  useEffect(() => {
    void load();
    if (!isTauri) return;

    let un: (() => void) | undefined;
    let alive = true;
    void listen("servers-changed", () => void load()).then((f) => {
      if (alive) un = f;
      else f();
    });
    return () => {
      alive = false;
      un?.();
    };
  }, [load]);

  const all = servers ?? [];
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.ip.toLowerCase().includes(q)
    );
  }, [query, all]);

  return (
    <div className="flex h-full min-h-0 flex-col px-8 py-6">
      {}
      <div className="mb-5 flex items-baseline gap-3">
        <h1 className="text-[26px] font-semibold tracking-[-0.03em] leading-none text-text">
          {t("Сервера")}
        </h1>
        <div className="field-wrap ml-auto flex h-10 w-[260px] items-center gap-2 px-3.5">
          <Icon cls="fa-solid fa-magnifying-glass text-[12.5px] text-muted" />
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
              <Icon cls="fa-solid fa-xmark text-[12.5px]" />
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto py-1 pr-1 pb-4">
        {servers === null ? (
          <div className="grid h-full place-items-center text-muted">
            <Icon cls="fa-solid fa-spinner fa-spin" />
          </div>
        ) : all.length === 0 ? (
          <div className="grid h-full place-items-center text-center">
            <div className="max-w-xs">
              <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-[18px] bg-white/[0.04] text-xl text-accent">
                <Icon cls="fa-solid fa-server" />
              </div>
              <p className="text-sm text-muted">
                {t("Список пуст. Хочешь попасть сюда? Покупай слот на https:")}
              </p>
            </div>
          </div>
        ) : list.length === 0 ? (
          <div className="py-6 text-center text-[13px] text-muted">
            {t("Ничего не нашлось")}
          </div>
        ) : (
          list.map((s, i) => <ServerRow key={s.ip} s={s} index={i} />)
        )}
      </div>
    </div>
  );
}
