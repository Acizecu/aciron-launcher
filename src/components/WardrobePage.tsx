import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PlayerView from "./wardrobe/PlayerView";
import SkinThumb from "./wardrobe/SkinThumb";
import TexturePreview from "./wardrobe/TexturePreview";
import Modal from "./Modal";
import ConfirmModal from "./ConfirmModal";
import AddAccountModal from "./AddAccountModal";
import { useToast } from "../ToastContext";
import { cardInDelay } from "../anim";
import {
  ACIRON_ID_API,
  cachePeek,
  activeCapeUrl,
  activeSkinUrl,
  capeCatalog,
  capeCatalogApply,
  getAccounts,
  licenseCapeApply,
  licenseCapes,
  MAX_SKINS,
  readTexture,
  type ApplyResult,
  type CatalogCape,
  type CatalogSkin,
  type LicenseCapes,
  outfitAdd,
  outfitApply,
  outfitDelete,
  pickFile,
  skinCatalog,
  skinCatalogApply,
  textureUrl,
  wardrobeAdd,
  wardrobeApply,
  wardrobeCapeOff,
  wardrobeDelete,
  wardrobeList,
  wardrobeRename,
  type Outfit,
  type SkinModelId,
  type WardrobeData,
  type WardrobeItem,
} from "../api";

type Tab = "skins" | "outfits" | "capes";

const TABS: { id: Tab; label: string }[] = [
  { id: "skins", label: "Скины" },
  { id: "capes", label: "Плащи" },
  { id: "outfits", label: "Образы" },
];

function human(e: unknown): string {
  const m = String(e).replace(/^Error:\s*/, "");
  if (m === "SESSION_EXPIRED") return "Сессия Aciron ID истекла — войдите заново";
  if (m === "NO_ACIRON") return "Гардероб доступен с аккаунтом Aciron ID";
  return m;
}

const cardCls = (active: boolean) =>
  `group relative flex flex-col items-center gap-2 rounded-2xl border p-3 transition-colors ${
    active ? "border-accent bg-accent/10" : "border-border bg-card hover:border-accent/50"
  }`;

function TileButton({
  icon,
  label,
  index,
  active,
  disabled,
  title,
  onClick,
}: {
  icon: string;
  label: string;
  index: number;
  active?: boolean;
  disabled?: boolean;
  title?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{ animationDelay: `${cardInDelay(index)}ms` }}
      className={`card-in flex min-h-[196px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed p-3 text-center transition-colors ${
        disabled
          ? "cursor-not-allowed border-border bg-card/30 text-muted/50"
          : active
          ? "border-accent bg-accent/10 text-accent"
          : "border-border bg-card/50 text-muted hover:border-accent/60 hover:text-accent"
      }`}
    >
      <i className={`${icon} text-xl`} />
      <span className="text-xs">{label}</span>
    </button>
  );
}

type CapeOrigin = "license" | "own" | "mojang" | "aciron";

const ORIGIN_LABEL: Record<CapeOrigin, string> = {
  license: "На аккаунте",
  own: "Свой плащ",
  mojang: "Дизайн Mojang",
  aciron: "Дизайн Aciron",
};

type CapeEntry = {
  key: string;
  name: string;
  url: string;
  origin: CapeOrigin;
  active: boolean;
  apply: () => Promise<unknown>;

  remove?: () => void;
};

type Instant = {
  skinKey?: string;
  skinUrl?: string;
  model?: SkinModelId;
  capeKey?: string;
  capeUrl?: string | null;
};

export default function WardrobePage() {
  const [tab, setTab] = useState<Tab>("skins");
  // Мгновенный первый рендер из кэша при повторном заходе, ревалидация в load()
  const [data, setData] = useState<WardrobeData | null>(() => cachePeek<WardrobeData>("wardrobe") ?? null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(() => !cachePeek<WardrobeData>("wardrobe"));
  const [stale, setStale] = useState(false);
  const [nick, setNick] = useState("");
  const [signIn, setSignIn] = useState(false);
  const [busy, setBusy] = useState("");

  const [bust, setBust] = useState(0);
  const [confirm, setConfirm] = useState<{ kind: "item" | "outfit"; id: string; name: string } | null>(null);
  const [newOutfit, setNewOutfit] = useState(false);
  const [outfitName, setOutfitName] = useState("");

  const [edit, setEdit] = useState<{ item: WardrobeItem; name: string; model: SkinModelId } | null>(
    null
  );

  const [addSkin, setAddSkin] = useState<{
    path: string;
    name: string;
    model: SkinModelId;

    preview: string;
  } | null>(null);
  const [instant, setInstant] = useState<Instant | null>(null);

  const [stock, setStock] = useState<CatalogSkin[] | null>(() => cachePeek<CatalogSkin[]>("skin-catalog") ?? null);
  const [catalog, setCatalog] = useState<CatalogCape[] | null>(() => cachePeek<CatalogCape[]>("cape-catalog") ?? null);
  const [lic, setLic] = useState<LicenseCapes | null>(() => cachePeek<LicenseCapes>("license-capes") ?? null);

  const [licError, setLicError] = useState("");
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      const d = await wardrobeList();
      // Защита от кривого ответа сервера: модель должна быть задана (SC-4)
      if (!d.active.model) d.active.model = "classic";
      setData(d);
      setError("");
      setStale(false);
    } catch (e) {
      const msg = String(e).replace(/^Error:\s*/, "");
      // Экран входа — только для NO_ACIRON/SESSION_EXPIRED или когда данных нет вовсе.
      // Иначе НЕ стираем сохранённое: показываем баннер «не удалось обновить».
      if (msg === "NO_ACIRON" || msg === "SESSION_EXPIRED" || !cachePeek<WardrobeData>("wardrobe")) {
        setError(msg);
      } else {
        setStale(true);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    getAccounts()
      .then((s) => {
        const a = s.accounts.find((x) => x.id === s.active) ?? s.accounts[0];
        setNick(a?.aciron_name || a?.username || "");
      })
      .catch(() => {});
    void load();
  }, [load]);

  useEffect(() => {
    skinCatalog()
      .then(setStock)
      .catch(() => setStock([]));
  }, []);

  useEffect(() => {
    if (tab !== "capes" || catalog) return;
    capeCatalog().then(setCatalog).catch(() => setCatalog([]));
    licenseCapes()
      .then((r) => {
        setLic(r);
        setLicError("");
      })
      .catch((e) => {
        setLic({ linked: false, capes: [] });
        setLicError(human(e));
      });
  }, [tab, catalog]);

  const needLogin = error === "NO_ACIRON" || error === "SESSION_EXPIRED";

  const act = async (key: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(key);
    try {
      await fn();
      if (ok) toast(ok, "success");
      await load();
    } catch (e) {
      toast(human(e), "error");
    } finally {
      setBusy("");
    }
  };

  // Клик по скину/плащу/модели только СТАВИТ выбор (превью), применение — по
  // кнопке «Сохранить». pending хранит, что применить; dirty — есть ли что сохранять.
  const pending = useRef<{ skin?: () => Promise<unknown>; cape?: () => Promise<unknown> }>({});
  const [dirty, setDirty] = useState(false);

  const save = async () => {
    const p = pending.current;
    if (!p.skin && !p.cape) return;
    pending.current = {};
    setBusy("save");
    try {
      if (p.skin) {
        const r = (await p.skin()) as ApplyResult | undefined;
        if (r && r.error) toast(`На лицензию не применилось: ${r.error}`, "warning");
      }
      if (p.cape) await p.cape();
      await load();
      setBust(Date.now());
      setDirty(false);
      toast("Сохранено", "success");
    } catch (e) {
      setInstant(null);
      setBust(Date.now());
      toast(human(e), "error");
      void load();
    } finally {
      setBusy("");
    }
  };

  // Оптимистичное изменение данных гардероба: применяем сразу, возвращаем токен отката.
  const patchData = (mut: (d: WardrobeData) => WardrobeData): WardrobeData | null => {
    if (!data) return null;
    const prev = data;
    setData(mut(structuredClone(data)));
    return prev;
  };

  const pickSkinFile = async () => {
    const path = await pickFile("Текстура PNG", ["png"]);
    if (!path) return;
    const name = (path.split(/[\\/]/).pop() || "skin.png").replace(/\.png$/i, "");
    setAddSkin((s) => ({
      path,
      name: s?.name?.trim() ? s.name : name,
      model: s?.model ?? "classic",
      preview: "",
    }));
    try {
      const preview = await readTexture(path);
      setAddSkin((s) => (s && s.path === path ? { ...s, preview } : s));
    } catch (e) {
      toast(human(e), "error");
    }
  };

  const saveNewSkin = () => {
    if (!addSkin?.path) return;
    const { path, name, model } = addSkin;
    void act("upload", () => wardrobeAdd(path, "skin", name.trim() || "Скин", model), "Скин добавлен").then(
      () => setAddSkin(null)
    );
  };

  const uploadCape = async () => {
    const path = await pickFile("Текстура плаща PNG 64×32", ["png"]);
    if (!path) return;
    const name = (path.split(/[\\/]/).pop() || "cape.png").replace(/\.png$/i, "");
    await act("upload", () => wardrobeAdd(path, "cape", name, "classic"), "Плащ добавлен");
  };

  const wearSkin = (key: string, url: string, model: SkinModelId, apply: () => Promise<ApplyResult>) => {
    setInstant((s) => ({ ...s, skinKey: key, skinUrl: url, model }));
    pending.current.skin = apply;
    setDirty(true);
  };

  const wearCape = (key: string, url: string | null, apply: () => Promise<unknown>) => {
    setInstant((s) => ({ ...s, capeKey: key, capeUrl: url }));
    pending.current.cape = apply;
    setDirty(true);
  };

  const setModel = (model: SkinModelId) => {
    const id = data?.active.skinId;
    if (!id || model === (instant?.model ?? data?.active.model ?? "classic")) return;
    const item = data.skins.find((s) => s.id === id);
    if (!item) return;
    setInstant((s) => ({ ...s, model }));
    pending.current.skin = async () => {
      await wardrobeRename(item.id, item.name, model);
      await wardrobeApply(item.id);
    };
    setDirty(true);
  };

  const saveEdit = () => {
    if (!edit) return;
    const { item, name, model } = edit;
    const newName = name.trim() || item.name;
    // Оптимистично: имя/модель меняются сразу, запрос — в фоне, откат через load().
    patchData((d) => ({
      ...d,
      skins: d.skins.map((s) => (s.id === item.id ? { ...s, name: newName, model } : s)),
      capes: d.capes.map((c) => (c.id === item.id ? { ...c, name: newName } : c)),
    }));
    setEdit(null);
    void (async () => {
      await wardrobeRename(item.id, newName, model);
      if (item.kind === "skin" && data?.active.skinId === item.id && model !== item.model)
        await wardrobeApply(item.id);
    })().catch((e) => {
      toast(human(e), "error");
      void load();
    });
  };

  const saveOutfit = () =>
    act(
      "outfit",
      () =>
        outfitAdd(
          outfitName.trim() || "Образ",
          data?.active.skinId ?? null,
          data?.active.capeId ?? null,
          data?.active.model ?? "classic"
        ),
      "Образ сохранён"
    ).then(() => {
      setNewOutfit(false);
      setOutfitName("");
    });

  const capes = useMemo<CapeEntry[]>(() => {
    const out: CapeEntry[] = [];

    for (const c of lic?.capes ?? [])
      out.push({
        key: `lic:${c.id}`,
        name: c.name,
        url: c.url,
        origin: "license",
        active: c.active,
        apply: async () => {
          await licenseCapeApply(c.id);
          setLic(await licenseCapes());
        },
      });

    for (const it of data?.capes ?? [])
      out.push({
        key: `own:${it.id}`,
        name: it.name,
        url: textureUrl(it),
        origin: "own",
        active: data?.active.capeId === it.id,
        apply: () => wardrobeApply(it.id),
        remove: () => setConfirm({ kind: "item", id: it.id, name: it.name }),
      });

    const byOrigin = (c: CatalogCape): CapeOrigin => (c.by === "mojang" ? "mojang" : "aciron");
    const stockCapes = (catalog ?? []).slice().sort((a, b) => {
      const rank = (c: CatalogCape) => (byOrigin(c) === "mojang" ? 0 : 1);
      return rank(a) - rank(b);
    });
    for (const c of stockCapes)
      out.push({
        key: `cat:${c.id}`,
        name: c.name,
        url: `${ACIRON_ID_API}${c.url}`,
        origin: byOrigin(c),
        active: data?.active.capeCatalogId === c.id,
        apply: () => capeCatalogApply(c.id),
      });

    return out;
  }, [lic, data, catalog]);

  const wearOutfit = (o: Outfit) => {
    const skin = data?.skins.find((s) => s.id === o.skinId);
    const cape = data?.capes.find((c) => c.id === o.capeId);
    setInstant({
      skinKey: skin?.id,
      skinUrl: skin ? textureUrl(skin) : undefined,
      model: o.model,
      capeKey: cape ? `own:${cape.id}` : "off",
      capeUrl: cape ? textureUrl(cape) : null,
    });
    pending.current = { skin: () => outfitApply(o.id) };
    setDirty(true);
  };

  const capeOff = () =>
    wearCape("off", null, async () => {
      await wardrobeCapeOff();
      if (lic?.linked) {
        await licenseCapeApply(null).catch(() => {});
        setLic(await licenseCapes().catch(() => lic));
      }
    });

  const serverSkinUrl =
    data?.active.hasSkin && nick
      ? activeSkinUrl(nick, bust)
      : nick
      ? `https://mc-heads.net/skin/${encodeURIComponent(nick)}`
      : "";
  const skinUrl = instant?.skinUrl ?? serverSkinUrl;
  const capeUrl =
    instant?.capeKey !== undefined
      ? instant.capeUrl ?? null
      : data?.active.hasCape && nick
      ? activeCapeUrl(nick, bust)
      : null;
  const shownModel = instant?.model ?? data?.active.model ?? "classic";

  const skinActive = (key: string) =>
    instant?.skinKey !== undefined
      ? instant.skinKey === key
      : data?.active.skinId === key || data?.active.skinCatalogId === key;
  const capeActive = (c: CapeEntry) =>
    instant?.capeKey !== undefined ? instant.capeKey === c.key : c.active;
  const noCape =
    instant?.capeKey !== undefined
      ? instant.capeKey === "off"
      : !data?.active.hasCape && !capes.some((c) => c.origin === "license" && c.active);

  const skinCount = data?.skins.length ?? 0;
  const skinsFull = skinCount >= MAX_SKINS;

  if (needLogin) {
    return (
      <div className="grid h-full place-items-center px-6 text-center">
        <div className="max-w-sm">
          <div className="mx-auto mb-4 grid h-20 w-20 place-items-center rounded-3xl bg-card text-3xl text-accent">
            <i className="fa-solid fa-shirt" />
          </div>
          <h2 className="text-xl font-light text-text">Гардероб</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            {error === "SESSION_EXPIRED"
              ? "Сессия Aciron ID истекла — войдите заново, чтобы вернуть свои скины и плащи."
              : "Скины и плащи хранятся в аккаунте Aciron ID. Войдите, чтобы собрать свой гардероб."}
          </p>
          <button
            onClick={() => setSignIn(true)}
            className="mt-4 rounded-lg bg-accent px-5 py-2.5 text-sm font-bold text-bg transition-colors hover:bg-accent-hover"
          >
            Войти в Aciron ID
          </button>
        </div>
        {signIn && (
          <AddAccountModal
            initialStep="aciron"
            onAdded={() => void load()}
            onClose={() => setSignIn(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col px-8 py-6">
      <h1 className="mb-5 text-[30px] font-light leading-none text-text">Гардероб</h1>

      <div className="flex min-h-0 flex-1 gap-6">
        {}
        <section className="flex w-[36%] min-w-[300px] max-w-[460px] shrink-0 flex-col">
          <div className="min-h-0 flex-1 overflow-hidden rounded-2xl bg-card/40">
            {skinUrl ? (
              <PlayerView
                skinUrl={skinUrl}
                capeUrl={capeUrl}
                model={shownModel}
                className="h-full w-full"
              />
            ) : (
              <div className="grid h-full place-items-center text-sm text-muted">Нет аккаунта</div>
            )}
          </div>

          <div className="mt-3 flex gap-2">
            {(["classic", "slim"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setModel(m)}
                disabled={!data?.active.skinId}
                className={`flex-1 rounded-3xl border py-2.5 text-sm transition-colors disabled:opacity-50 ${
                  shownModel === m
                    ? "border-accent bg-accent/10 font-semibold text-accent"
                    : "border-none bg-transparent text-text hover:border-accent/40 hover:bg-accent/10"
                }`}
              >
                {m === "classic" ? "Клаcсический" : "Тонкий"}
              </button>
            ))}
          </div>

          {}
          <button
            onClick={() => void save()}
            disabled={!dirty || busy === "save"}
            className={`mt-3 w-full rounded-3xl py-3 text-sm font-bold transition-colors ${
              dirty && busy !== "save"
                ? "bg-accent text-bg hover:bg-accent-hover"
                : "cursor-default bg-card text-muted"
            }`}
          >
            {busy === "save" ? (
              <>
                <i className="fa-solid fa-spinner fa-spin mr-2" />
                Сохранение…
              </>
            ) : dirty ? (
              <>
                <i className="fa-solid fa-floppy-disk mr-2" />
                Сохранить
              </>
            ) : (
              <>
                <i className="fa-solid fa-check mr-2" />
                Сохранено
              </>
            )}
          </button>
        </section>

        {}
        <section className="flex min-w-0 flex-1 flex-col">
          <div className="mb-4 flex items-baseline justify-start gap-4">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`text-[17px] font-light transition-colors ${
                  tab === t.id ? "text-text" : "text-muted hover:text-text"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            {loading ? (
              <div className="grid h-full place-items-center text-muted">
                <i className="fa-solid fa-spinner fa-spin text-xl" />
              </div>
            ) : error ? (
              <div className="rounded-xl bg-card p-4 text-center text-sm text-muted">{error}</div>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-4 pb-2">
                {stale && (
                  <Notice text="Не удалось обновить данные — показаны сохранённые. Проверьте соединение с Aciron ID." />
                )}
                {tab === "skins" && (
                  <>
                    <Notice text="Скины видны только игрокам, зашедшим в игру через лаунчер Aciron." />
                    {(stock?.length ?? 0) > 0 && <SectionHeader label="Каталог Aciron" />}
                    {(stock ?? []).map((s, i) => (
                      <SkinCard
                        key={`stock:${s.id}`}
                        name={s.name}
                        url={`${ACIRON_ID_API}${s.url}`}
                        model={s.model}
                        index={i}
                        active={skinActive(s.id)}
                        onApply={() =>
                          wearSkin(s.id, `${ACIRON_ID_API}${s.url}`, s.model, () =>
                            skinCatalogApply(s.id)
                          )
                        }
                      />
                    ))}
                    <SectionHeader label="Мои скины" />
                    {(data?.skins ?? []).map((it, i) => (
                      <SkinCard
                        key={it.id}
                        name={it.name}
                        url={textureUrl(it)}
                        model={it.model}
                        index={(stock?.length ?? 0) + i}
                        active={skinActive(it.id)}
                        onApply={() =>
                          wearSkin(it.id, textureUrl(it), it.model, () => wardrobeApply(it.id))
                        }
                        onEdit={() => setEdit({ item: it, name: it.name, model: it.model })}
                        onDelete={() => setConfirm({ kind: "item", id: it.id, name: it.name })}
                      />
                    ))}
                    <TileButton
                      icon={skinsFull ? "fa-solid fa-lock" : "fa-solid fa-plus"}
                      label={skinsFull ? `Максимум ${MAX_SKINS} скинов` : "Добавить скин"}
                      index={(stock?.length ?? 0) + skinCount}
                      disabled={skinsFull}
                      title={
                        skinsFull ? "Удалите один из своих скинов, чтобы добавить новый" : undefined
                      }
                      onClick={() => setAddSkin({ path: "", name: "", model: "classic", preview: "" })}
                    />
                  </>
                )}

                {tab === "capes" && (
                  <>
                    {/* Плащи с лицензии Minecraft — их видят ВСЕ игроки (это настоящий плащ аккаунта) */}
                    <SectionHeader label="С лицензии Minecraft" />
                    {lic && (licError || !lic.linked) && (
                      <Notice
                        text={
                          licError
                            ? `Плащи с аккаунта Minecraft не загрузились: ${licError}`
                            : data?.licensed
                            ? "Плащи с аккаунта Minecraft не видны: лицензия привязана без доступа к профилю — переподключите её в меню аккаунта."
                            : "Плащей с аккаунта Minecraft нет: лицензия не привязана к Aciron ID. Привязать можно в меню аккаунта."
                        }
                      />
                    )}
                    {capes
                      .filter((c) => c.origin === "license")
                      .map((c, i) => (
                        <CapeCard
                          key={c.key}
                          entry={c}
                          active={capeActive(c)}
                          index={i}
                          onApply={() => wearCape(c.key, c.url, c.apply)}
                        />
                      ))}
                    {lic?.linked && !licError && !capes.some((c) => c.origin === "license") && (
                      <Notice text="На аккаунте Minecraft нет плащей." />
                    )}

                    {/* Кастомные плащи — видны только игрокам, зашедшим через лаунчер Aciron */}
                    <SectionHeader label="Кастом (Aciron)" />
                    <Notice text="Кастомные плащи видят только игроки, зашедшие в игру через лаунчер Aciron." />
                    <TileButton
                      icon="fa-solid fa-ban"
                      label="Без плаща"
                      index={0}
                      active={noCape}
                      onClick={() => void capeOff()}
                    />
                    <TileButton
                      icon="fa-solid fa-arrow-up-from-bracket"
                      label="Загрузить"
                      index={1}
                      onClick={() => void uploadCape()}
                    />
                    {capes
                      .filter((c) => c.origin !== "license")
                      .map((c, i) => (
                        <CapeCard
                          key={c.key}
                          entry={c}
                          active={capeActive(c)}
                          index={i + 2}
                          onApply={() => wearCape(c.key, c.url, c.apply)}
                        />
                      ))}
                    {catalog === null && <Loading />}
                  </>
                )}

                {tab === "outfits" && (
                  <>
                    {(data?.outfits ?? []).map((o, i) => (
                      <OutfitCard
                        key={o.id}
                        outfit={o}
                        data={data!}
                        index={i}
                        busy={busy === o.id}
                        onApply={() => wearOutfit(o)}
                        onDelete={() => setConfirm({ kind: "outfit", id: o.id, name: o.name })}
                      />
                    ))}
                    <TileButton
                      icon="fa-solid fa-plus"
                      label="Сохранить текущий образ"
                      index={(data?.outfits.length ?? 0) + 1}
                      onClick={() => setNewOutfit(true)}
                    />
                  </>
                )}
              </div>
            )}
          </div>
        </section>
      </div>

      {confirm && (
        <ConfirmModal
          title={confirm.kind === "outfit" ? "Удалить образ" : "Удалить из гардероба"}
          message={`Удалить «${confirm.name}»? Файл текстуры будет стёрт с сервера.`}
          onConfirm={() => {
            if (instant?.skinKey === confirm.id || instant?.capeKey === `own:${confirm.id}`)
              setInstant(null);
            const { kind, id } = confirm;
            // Оптимистично убираем карточку, удаляем в фоне, откат при ошибке.
            const prev = patchData((d) => ({
              ...d,
              skins: d.skins.filter((s) => s.id !== id),
              capes: d.capes.filter((c) => c.id !== id),
              outfits: d.outfits.filter((o) => o.id !== id),
            }));
            setConfirm(null);
            (kind === "outfit" ? outfitDelete(id) : wardrobeDelete(id)).catch((e) => {
              if (prev) setData(prev);
              toast(human(e), "error");
            });
          }}
          onClose={() => setConfirm(null)}
        />
      )}

      {addSkin && (
        <Modal
          title="Новый скин"
          subtitle="PNG 64×64 или 64×32"
          onClose={() => setAddSkin(null)}
        >
          <div className="space-y-4 p-5">
            <div className="flex gap-4">
              {}
              <div className="grid h-[190px] w-[140px] shrink-0 place-items-center overflow-hidden rounded-xl bg-card/60">
                {addSkin.preview ? (
                  <SkinThumb
                    url={addSkin.preview}
                    model={addSkin.model}
                    shot="full"
                    className="h-[186px] w-auto"
                  />
                ) : (
                  <span className="px-3 text-center text-[11px] leading-snug text-muted">
                    {addSkin.path ? "Читаю файл…" : "Выберите PNG, чтобы увидеть скин"}
                  </span>
                )}
              </div>

              <div className="flex min-w-0 flex-1 flex-col justify-center">
                <span className="mb-1.5 block text-xs text-muted">Файл</span>
                <button
                  onClick={() => void pickSkinFile()}
                  className={`flex w-full items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                    addSkin.path
                      ? "border-border bg-bg text-text hover:border-accent/60"
                      : "border-dashed border-border bg-bg text-muted hover:border-accent/60 hover:text-accent"
                  }`}
                >
                  <i className="fa-solid fa-file-image shrink-0" />
                  <span className="truncate">
                    {addSkin.path ? addSkin.path.split(/[\\/]/).pop() : "Выбрать PNG…"}
                  </span>
                </button>
              </div>
            </div>

            <div>
              <span className="mb-1.5 block text-xs text-muted">Тип рук</span>
              <div className="flex gap-2">
                {(["classic", "slim"] as SkinModelId[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setAddSkin({ ...addSkin, model: m })}
                    className={`flex-1 rounded-lg border px-3 py-2 text-sm transition-colors ${
                      addSkin.model === m
                        ? "border-accent bg-accent/10 text-text"
                        : "border-border text-muted hover:text-text"
                    }`}
                  >
                    {m === "classic" ? "Стив — 4 px" : "Алекс — 3 px"}
                  </button>
                ))}
              </div>
            </div>

            <label className="block">
              <span className="mb-1.5 block text-xs text-muted">Название</span>
              <input
                value={addSkin.name}
                onChange={(e) => setAddSkin({ ...addSkin, name: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && saveNewSkin()}
                placeholder="Например: зимний"
                maxLength={64}
                className="w-full rounded-lg border border-border bg-bg px-3 py-2.5 text-sm text-text outline-none transition-colors placeholder:text-muted/60 focus:border-accent"
              />
            </label>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setAddSkin(null)}
                className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-muted transition-colors hover:text-text"
              >
                Отмена
              </button>
              <button
                onClick={saveNewSkin}
                disabled={!addSkin.path || busy === "upload"}
                className="rounded-lg bg-accent px-5 py-2.5 text-sm font-bold text-bg transition-colors hover:bg-accent-hover disabled:opacity-60"
              >
                Добавить
              </button>
            </div>
          </div>
        </Modal>
      )}

      {edit && (
        <Modal
          title={edit.item.kind === "cape" ? "Плащ" : "Скин"}
          subtitle="Название видно только вам"
          onClose={() => setEdit(null)}
        >
          <div className="space-y-4 p-5">
            <label className="block">
              <span className="mb-1.5 block text-xs text-muted">Название</span>
              <input
                autoFocus
                value={edit.name}
                onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                maxLength={64}
                className="w-full rounded-lg border border-border bg-bg px-3 py-2.5 text-sm text-text outline-none transition-colors placeholder:text-muted/60 focus:border-accent"
              />
            </label>

            {edit.item.kind === "skin" && (
              <div>
                <span className="mb-1.5 block text-xs text-muted">Тип рук</span>
                <div className="flex gap-2">
                  {(["classic", "slim"] as SkinModelId[]).map((m) => (
                    <button
                      key={m}
                      onClick={() => setEdit({ ...edit, model: m })}
                      className={`flex-1 rounded-lg border px-3 py-2 text-sm transition-colors ${
                        edit.model === m
                          ? "border-accent bg-accent/10 text-text"
                          : "border-border text-muted hover:text-text"
                      }`}
                    >
                      {m === "classic" ? "Стив — 4 px" : "Алекс — 3 px"}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setEdit(null)}
                className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-muted transition-colors hover:text-text"
              >
                Отмена
              </button>
              <button
                onClick={saveEdit}
                disabled={busy === edit.item.id}
                className="rounded-lg bg-accent px-5 py-2.5 text-sm font-bold text-bg transition-colors hover:bg-accent-hover disabled:opacity-60"
              >
                Сохранить
              </button>
            </div>
          </div>
        </Modal>
      )}

      {newOutfit && (
        <Modal title="Новый образ" subtitle="Запомнит текущий скин, плащ и модель" onClose={() => setNewOutfit(false)}>
          <div className="space-y-4 p-5">
            <label className="block">
              <span className="mb-1.5 block text-xs text-muted">Название</span>
              <input
                autoFocus
                value={outfitName}
                onChange={(e) => setOutfitName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveOutfit()}
                placeholder="Например: зимний"
                maxLength={64}
                className="w-full rounded-lg border border-border bg-bg px-3 py-2.5 text-sm text-text outline-none transition-colors placeholder:text-muted/60 focus:border-accent"
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setNewOutfit(false)}
                className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-muted transition-colors hover:text-text"
              >
                Отмена
              </button>
              <button
                onClick={saveOutfit}
                disabled={busy === "outfit"}
                className="rounded-lg bg-accent px-5 py-2.5 text-sm font-bold text-bg transition-colors hover:bg-accent-hover disabled:opacity-60"
              >
                Сохранить
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Loading() {
  return (
    <div className="grid min-h-[196px] place-items-center text-muted">
      <i className="fa-solid fa-spinner fa-spin" />
    </div>
  );
}

function Notice({ text }: { text: string }) {
  return (
    <div className="col-span-full flex items-start gap-2.5 rounded-xl bg-card px-4 py-3 text-xs leading-relaxed text-muted">
      <i className="fa-solid fa-circle-info mt-0.5 shrink-0 text-accent/80" />
      <span>{text}</span>
    </div>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="col-span-full mt-2 text-[11px] font-semibold uppercase tracking-wide text-muted first:mt-0">
      {label}
    </div>
  );
}

function ActiveBadge({ text = "Используется" }: { text?: string }) {
  return (
    <span className="absolute left-2 top-2 rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold text-bg">
      {text}
    </span>
  );
}

function CardTools({ onEdit, onDelete }: { onEdit?: () => void; onDelete?: () => void }) {
  if (!onEdit && !onDelete) return null;
  return (
    <div className="absolute right-1.5 top-1.5 flex opacity-0 transition-opacity group-hover:opacity-100">
      {onEdit && (
        <button
          onClick={onEdit}
          title="Переименовать"
          className="grid h-7 w-7 place-items-center rounded-lg text-muted transition-colors hover:text-accent"
        >
          <i className="fa-solid fa-pen text-xs" />
        </button>
      )}
      {onDelete && (
        <button
          onClick={onDelete}
          title="Удалить"
          className="grid h-7 w-7 place-items-center rounded-lg text-muted transition-colors hover:text-[#ef4444]"
        >
          <i className="fa-solid fa-trash-can text-xs" />
        </button>
      )}
    </div>
  );
}

function SkinCard({
  name,
  url,
  model,
  index,
  active,
  onApply,
  onEdit,
  onDelete,
}: {
  name: string;
  url: string;
  model: SkinModelId;
  index: number;
  active: boolean;
  onApply: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div style={{ animationDelay: `${cardInDelay(index)}ms` }} className={`card-in ${cardCls(active)}`}>
      <button onClick={onApply} className="flex w-full flex-col items-center gap-2">
        <div className="grid h-[140px] w-full place-items-center">
          <SkinThumb url={url} model={model} className="max-h-[140px] w-full object-contain" />
        </div>
        <span className="line-clamp-1 max-w-full text-xs font-semibold text-text">{name}</span>
      </button>
      {active && <ActiveBadge />}
      <CardTools onEdit={onEdit} onDelete={onDelete} />
    </div>
  );
}

function CapeCard({
  entry,
  active,
  index,
  onApply,
}: {
  entry: CapeEntry;
  active: boolean;
  index: number;
  onApply: () => void;
}) {
  return (
    <div style={{ animationDelay: `${cardInDelay(index)}ms` }} className={`card-in ${cardCls(active)}`}>
      <button onClick={onApply} className="flex w-full flex-col items-center gap-2">
        <div className="grid h-[140px] place-items-center">
          <div className="overflow-hidden rounded-lg">
            <TexturePreview url={entry.url} kind="cape" scale={8} />
          </div>
        </div>
        <div className="w-full text-center">
          <div className="line-clamp-1 text-xs font-semibold text-text">{entry.name}</div>
          <div className="mt-0.5 line-clamp-1 text-[11px] text-muted">
            {ORIGIN_LABEL[entry.origin]}
          </div>
        </div>
      </button>
      {active && <ActiveBadge text="в игре" />}
      <CardTools onDelete={entry.remove} />
    </div>
  );
}

function OutfitCard({
  outfit,
  data,
  index,
  busy,
  onApply,
  onDelete,
}: {
  outfit: Outfit;
  data: WardrobeData;
  index: number;
  busy: boolean;
  onApply: () => void;
  onDelete: () => void;
}) {
  const skin = data.skins.find((s) => s.id === outfit.skinId);
  const cape = data.capes.find((c) => c.id === outfit.capeId);
  return (
    <div style={{ animationDelay: `${cardInDelay(index)}ms` }} className={`card-in ${cardCls(false)}`}>
      <button onClick={onApply} disabled={busy} className="flex w-full flex-col items-center gap-2">
        <div className="relative grid h-[140px] w-full place-items-center">
          {busy ? (
            <i className="fa-solid fa-spinner fa-spin text-accent" />
          ) : skin ? (
            <SkinThumb url={textureUrl(skin)} model={outfit.model} className="h-[140px] w-auto" />
          ) : (
            <i className="fa-solid fa-shirt text-2xl text-muted" />
          )}
          {}
          {cape && !busy && (
            <div className="absolute bottom-0 right-0 overflow-hidden rounded-md border border-border bg-bg p-0.5">
              <TexturePreview url={textureUrl(cape)} kind="cape" scale={2} />
            </div>
          )}
        </div>
        <span className="line-clamp-1 max-w-full text-xs font-semibold text-text">{outfit.name}</span>
      </button>
      <CardTools onDelete={onDelete} />
    </div>
  );
}
