import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PlayerView from "./wardrobe/PlayerView";
import SkinThumb from "./wardrobe/SkinThumb";
import Modal from "./Modal";
import ConfirmModal from "./ConfirmModal";
import AddAccountModal from "./AddAccountModal";
import { useToast } from "../ToastContext";
import { human, type CapeEntry, type CapeOrigin, type Instant } from "./wardrobe/types";
import { CapeCard, Loading, Notice, OutfitCard, SectionHeader, SkinCard, TileButton } from "./wardrobe/cards";

import { t, t as tr, ts } from "../i18n";
import {
  ACIRON_ID_API,
  activeCapeUrl,
  activeSkinUrl,
  cachePeek,
  capeCatalog,
  capeCatalogApply,
  CAPE_CATALOG_KEY,
  SKIN_CATALOG_KEY,
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
  { id: "skins", label: "Мои скины" },
  { id: "capes", label: "Плащи" },
  { id: "outfits", label: "Образы" },
];

function licenseError(raw: string): string {
  if (/fetch failed|ECONNRESET|ETIMEDOUT|ENETUNREACH/i.test(raw))
    return t("сервер Aciron сейчас не отвечает от Mojang, попробуйте позже");
  if (/401|403|token/i.test(raw)) return t("истёк вход в Microsoft — перепривяжите лицензию");
  return raw;
}

export default function WardrobePage() {
  const [tab, setTab] = useState<Tab>("skins");

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

  const [stock, setStock] = useState<CatalogSkin[] | null>(
    () => cachePeek<CatalogSkin[]>("skin-catalog") ?? null
  );
  const [catalog, setCatalog] = useState<CatalogCape[] | null>(
    () => cachePeek<CatalogCape[]>("cape-catalog") ?? null
  );
  const [lic, setLic] = useState<LicenseCapes | null>(
    () => cachePeek<LicenseCapes>("license-capes") ?? null
  );

  const [licError, setLicError] = useState("");
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      const d = await wardrobeList();

      if (!d.active.model) d.active.model = "classic";
      setData(d);
      setError("");
      setStale(false);
    } catch (e) {
      const msg = ts(String(e));

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
    let alive = true;
    setStock((s) => s ?? cachePeek<CatalogSkin[]>(SKIN_CATALOG_KEY) ?? null);
    skinCatalog(true)
      .then((list) => alive && setStock(list))

      .catch(() => alive && setStock((s) => s ?? []));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (tab !== "capes") return;
    let alive = true;
    setCatalog((c) => c ?? cachePeek<CatalogCape[]>(CAPE_CATALOG_KEY) ?? null);
    capeCatalog(true)
      .then((list) => alive && setCatalog(list))
      .catch(() => alive && setCatalog((c) => c ?? []));
    licenseCapes()
      .then((r) => {
        if (!alive) return;
        setLic(r);
        setLicError("");
      })
      .catch((e) => {
        if (!alive) return;

        setLic((l) => l ?? { linked: false, capes: [] });
        setLicError(human(e));
      });
    return () => {
      alive = false;
    };
  }, [tab]);

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
        if (r && r.error)
          toast(t("На лицензию не применилось: {msg}", { msg: licenseError(r.error) }), "warning");
      }
      if (p.cape) await p.cape();
      await load();
      setBust(Date.now());
      setDirty(false);
      toast(t("Сохранено"), "success");
    } catch (e) {
      setInstant(null);
      setBust(Date.now());
      toast(human(e), "error");
      void load();
    } finally {
      setBusy("");
    }
  };

  const patchData = (mut: (d: WardrobeData) => WardrobeData): WardrobeData | null => {
    if (!data) return null;
    const prev = data;

    setData(mut(prev));
    return prev;
  };

  const pickSkinFile = async () => {
    const path = await pickFile(t("Текстура PNG"), ["png"]);
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
    void act("upload", () => wardrobeAdd(path, "skin", name.trim() || t("Скин"), model), t("Скин добавлен")).then(
      () => setAddSkin(null)
    );
  };

  const uploadCape = async () => {
    const path = await pickFile(t("Текстура плаща PNG 64×32"), ["png"]);
    if (!path) return;
    const name = (path.split(/[\\/]/).pop() || "cape.png").replace(/\.png$/i, "");
    await act("upload", () => wardrobeAdd(path, "cape", name, "classic"), t("Плащ добавлен"));
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
          outfitName.trim() || t("Образ"),
          data?.active.skinId ?? null,
          data?.active.capeId ?? null,
          data?.active.skinCatalogId ?? null,
          data?.active.capeCatalogId ?? null,
          data?.active.model ?? "classic"
        ),
      t("Образ сохранён")
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
    const ownSkin = data?.skins.find((s) => s.id === o.skinId);
    const catSkin = o.skinCatalogId ? stock?.find((s) => s.id === o.skinCatalogId) : undefined;
    const ownCape = data?.capes.find((c) => c.id === o.capeId);
    const catCape = o.capeCatalogId ? catalog?.find((c) => c.id === o.capeCatalogId) : undefined;
    setInstant({
      skinKey: ownSkin?.id ?? catSkin?.id,
      skinUrl: ownSkin ? textureUrl(ownSkin) : catSkin ? `${ACIRON_ID_API}${catSkin.url}` : undefined,
      model: o.model,
      capeKey: ownCape ? `own:${ownCape.id}` : catCape ? `cat:${catCape.id}` : "off",
      capeUrl: ownCape ? textureUrl(ownCape) : catCape ? `${ACIRON_ID_API}${catCape.url}` : null,
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
          <h2 className="text-xl font-light text-text">{t("Гардероб")}</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            {error === "SESSION_EXPIRED"
              ? tr("Сессия Aciron ID истекла — войдите заново, чтобы вернуть свои скины и плащи.")
              : tr("Скины и плащи хранятся в аккаунте Aciron ID. Войдите, чтобы собрать свой гардероб.")}
          </p>
          <button
            onClick={() => setSignIn(true)}
            className="mt-4 rounded-lg bg-accent px-5 py-2.5 text-sm font-bold text-bg transition-colors hover:bg-accent-hover"
          >
            {t("Войти в Aciron ID")}
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
      <h1 className="mb-5 text-[30px] font-light leading-none text-text">
        {t("Гардероб")}
      </h1>

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
              <div className="grid h-full place-items-center text-sm text-muted">{t("Нет аккаунта")}</div>
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
                {m === "classic" ? tr("Клаcсический") : tr("Тонкий")}
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
                {t("Сохранение…")}
              </>
            ) : dirty ? (
              <>
                <i className="fa-solid fa-floppy-disk mr-2" />
                {t("Сохранить")}
              </>
            ) : (
              <>
                <i className="fa-solid fa-check mr-2" />
                {t("Сохранено")}
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
                className={`text-[20px] font-light transition-colors ${
                  tab === t.id ? "text-text" : "text-muted hover:text-text"
                }`}
              >
                {tr(t.label)}
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
                  <Notice text={t("Не удалось обновить данные — показаны сохранённые. Проверьте соединение с Aciron ID.")} />
                )}
                {tab === "skins" && (
                  <>
                    <Notice text={t("Скины видны только игрокам, зашедшим в игру через лаунчер Aciron.")} />
                    {(stock?.length ?? 0) > 0 && <SectionHeader label={t("Каталог Aciron")} />}
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
                    <SectionHeader label={t("Мои скины")} />
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
                      label={skinsFull ? tr("Максимум {n} скинов", { n: MAX_SKINS }) : tr("Добавить скин")}
                      index={(stock?.length ?? 0) + skinCount}
                      disabled={skinsFull}
                      title={
                        skinsFull ? t("Удалите один из своих скинов, чтобы добавить новый") : undefined
                      }
                      onClick={() => setAddSkin({ path: "", name: "", model: "classic", preview: "" })}
                    />
                  </>
                )}

                {tab === "capes" && (
                  <>
                    {}
                    <SectionHeader label={t("С лицензии Minecraft")} />
                    {lic && (licError || !lic.linked) && (
                      <Notice
                        text={
                          licError
                            ? t("Плащи с аккаунта Minecraft не загрузились: {msg}", { msg: licError })
                            : data?.licensed
                            ? t("Плащи с аккаунта Minecraft не видны: лицензия привязана без доступа к профилю — переподключите её в меню аккаунта.")
                            : t("Плащей с аккаунта Minecraft нет: лицензия не привязана к Aciron ID. Привязать можно в меню аккаунта.")
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
                      <Notice text={t("На аккаунте Minecraft нет плащей.")} />
                    )}

                    {}
                    <SectionHeader label={t("Кастом (Aciron)")} />
                    <Notice text={t("Кастомные плащи видят только игроки, зашедшие в игру через лаунчер Aciron.")} />
                    <TileButton
                      icon="fa-solid fa-ban"
                      label={t("Без плаща")}
                      index={0}
                      active={noCape}
                      onClick={() => void capeOff()}
                    />
                    <TileButton
                      icon="fa-solid fa-arrow-up-from-bracket"
                      label={t("Загрузить")}
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
                        stock={stock}
                        catalog={catalog}
                        index={i}
                        busy={busy === o.id}
                        onApply={() => wearOutfit(o)}
                        onDelete={() => setConfirm({ kind: "outfit", id: o.id, name: o.name })}
                      />
                    ))}
                    <TileButton
                      icon="fa-solid fa-plus"
                      label={t("Сохранить текущий образ")}
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
          title={confirm.kind === "outfit" ? tr("Удалить образ") : tr("Удалить из гардероба")}
          message={tr("Удалить «{name}»? Файл текстуры будет стёрт с сервера.", { name: confirm.name })}
          onConfirm={() => {

            if (instant?.skinKey === confirm.id || instant?.capeKey === `own:${confirm.id}`)
              setInstant(null);
            const { kind, id } = confirm;

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
          title={t("Новый скин")}
          subtitle={t("PNG 64×64 или 64×32")}
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
                    {addSkin.path ? t("Читаю файл…") : t("Выберите PNG, чтобы увидеть скин")}
                  </span>
                )}
              </div>

              <div className="flex min-w-0 flex-1 flex-col justify-center">
                <span className="mb-1.5 block text-xs text-muted">{t("Файл")}</span>
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
                    {addSkin.path ? addSkin.path.split(/[\\/]/).pop() : t("Выбрать PNG…")}
                  </span>
                </button>
              </div>
            </div>

            <div>
              <span className="mb-1.5 block text-xs text-muted">{t("Тип рук")}</span>
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
                    {m === "classic" ? tr("Стив — 4 px") : tr("Алекс — 3 px")}
                  </button>
                ))}
              </div>
            </div>

            <label className="block">
              <span className="mb-1.5 block text-xs text-muted">{t("Название")}</span>
              <input
                value={addSkin.name}
                onChange={(e) => setAddSkin({ ...addSkin, name: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && saveNewSkin()}
                placeholder={t("Например: зимний")}
                maxLength={64}
                className="w-full rounded-lg border border-border bg-bg px-3 py-2.5 text-sm text-text outline-none transition-colors placeholder:text-muted/60 focus:border-accent"
              />
            </label>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setAddSkin(null)}
                className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-muted transition-colors hover:text-text"
              >
                {t("Отмена")}
              </button>
              <button
                onClick={saveNewSkin}
                disabled={!addSkin.path || busy === "upload"}
                className="rounded-lg bg-accent px-5 py-2.5 text-sm font-bold text-bg transition-colors hover:bg-accent-hover disabled:opacity-60"
              >
                {t("Добавить")}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {edit && (
        <Modal
          title={edit.item.kind === "cape" ? tr("Плащ") : tr("Скин")}
          subtitle={t("Название видно только вам")}
          onClose={() => setEdit(null)}
        >
          <div className="space-y-4 p-5">
            <label className="block">
              <span className="mb-1.5 block text-xs text-muted">{t("Название")}</span>
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
                <span className="mb-1.5 block text-xs text-muted">{t("Тип рук")}</span>
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
                      {m === "classic" ? tr("Стив — 4 px") : tr("Алекс — 3 px")}
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
                {t("Отмена")}
              </button>
              <button
                onClick={saveEdit}
                disabled={busy === edit.item.id}
                className="rounded-lg bg-accent px-5 py-2.5 text-sm font-bold text-bg transition-colors hover:bg-accent-hover disabled:opacity-60"
              >
                {t("Сохранить")}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {newOutfit && (
        <Modal title={t("Новый образ")} subtitle={t("Запомнит текущий скин, плащ и модель")} onClose={() => setNewOutfit(false)}>
          <div className="space-y-4 p-5">
            <label className="block">
              <span className="mb-1.5 block text-xs text-muted">{t("Название")}</span>
              <input
                autoFocus
                value={outfitName}
                onChange={(e) => setOutfitName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveOutfit()}
                placeholder={t("Например: зимний")}
                maxLength={64}
                className="w-full rounded-lg border border-border bg-bg px-3 py-2.5 text-sm text-text outline-none transition-colors placeholder:text-muted/60 focus:border-accent"
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setNewOutfit(false)}
                className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-muted transition-colors hover:text-text"
              >
                {t("Отмена")}
              </button>
              <button
                onClick={saveOutfit}
                disabled={busy === "outfit"}
                className="rounded-lg bg-accent px-5 py-2.5 text-sm font-bold text-bg transition-colors hover:bg-accent-hover disabled:opacity-60"
              >
                {t("Сохранить")}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
