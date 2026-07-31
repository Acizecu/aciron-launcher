import { invoke } from "@tauri-apps/api/core";

export type Settings = {
  java_path: string;
  ram_mb: number;
  window_width: number;
  window_height: number;
  game_dir: string;
  versions_dir: string;
  builds_dir: string;
  username: string;
  hide_on_launch: boolean;
  background_anim: boolean | null;
  discord_rpc: boolean;
  autoadd_server: boolean;
  jvm_args: string;
  auto_update_check: boolean;
  fullscreen: boolean;

  ui_scale: number;

  notify_sound: boolean;
};

export const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

// Оборачивает промис в таймаут, чтобы вызов не мог висеть вечно (HNS-07)
export function withTimeout<T>(p: Promise<T>, ms = 20000): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error("TIMEOUT")), ms)),
  ]);
}

// ── Кэш read-only запросов: мгновенно из памяти/localStorage + фон ───────────
// cachePeek(key) — мгновенный первый рендер (в т.ч. ПОСЛЕ перезапуска лаунчера:
// избранные ключи хранятся в localStorage). cached(key, ttl, fetcher) —
// актуализация: свежее из кэша, иначе запрос; при ОШИБКЕ бросает, но прежнее
// сохранённое значение остаётся (UI показывает его + «не удалось обновить»).
type CacheBox<T> = { at: number; data: T; inflight?: Promise<T> };
const _cache = new Map<string, CacheBox<unknown>>();
const _subs = new Map<string, Set<() => void>>();

// Ключи, переживающие перезапуск лаунчера (localStorage).
const PERSIST = /^(wardrobe|skin-catalog|cape-catalog|license-capes|mc-versions|cats:|builds|friends)/;
const LS_PREFIX = "acache:";

function _loadLS<T>(key: string): CacheBox<T> | undefined {
  if (!PERSIST.test(key)) return undefined;
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    if (!raw) return undefined;
    const box = JSON.parse(raw) as CacheBox<T>;
    return box && box.data !== undefined ? box : undefined;
  } catch {
    return undefined;
  }
}
function _saveLS(key: string, box: CacheBox<unknown>): void {
  if (!PERSIST.test(key)) return;
  try {
    localStorage.setItem(LS_PREFIX + key, JSON.stringify({ at: box.at, data: box.data }));
  } catch {
    /* квота/сериализация — не критично */
  }
}

/** Синхронно достать сохранённое значение (память → localStorage) для мгновенного рендера. */
export function cachePeek<T>(key: string): T | undefined {
  let e = _cache.get(key) as CacheBox<T> | undefined;
  if (!e) {
    const ls = _loadLS<T>(key);
    if (ls) {
      _cache.set(key, ls);
      e = ls;
    }
  }
  return e?.data;
}

/** Сбросить кэш (память + localStorage) по точному ключу или префиксу. */
export function cacheBust(prefix: string): void {
  for (const k of [..._cache.keys()]) {
    if (k === prefix || k.startsWith(prefix)) _cache.delete(k);
  }
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith(LS_PREFIX + prefix)) localStorage.removeItem(k);
    }
  } catch {
    /* нет localStorage */
  }
  for (const k of [..._subs.keys()]) {
    if (k === prefix || k.startsWith(prefix)) _emit(k);
  }
}

/** Подписка на обновление ключа (компонент перерисуется после revalidate). */
export function cacheSubscribe(key: string, cb: () => void): () => void {
  let s = _subs.get(key);
  if (!s) {
    s = new Set();
    _subs.set(key, s);
  }
  s.add(cb);
  return () => s!.delete(cb);
}
function _emit(key: string): void {
  _subs.get(key)?.forEach((cb) => {
    try {
      cb();
    } catch {
      /* подписчик размонтирован */
    }
  });
}

/**
 * Свежее (< ttl) — сразу из кэша; иначе запрос (с дедупом). Успех — обновляет
 * память + localStorage. Ошибка — БРОСАЕТ, но прежнее сохранённое значение в кэше
 * остаётся (cachePeek его вернёт), поэтому UI показывает сохранённое + «не удалось
 * обновить», а не пустоту.
 */
export async function cached<T>(key: string, ttl: number, fetcher: () => Promise<T>): Promise<T> {
  let e = _cache.get(key) as CacheBox<T> | undefined;
  if (!e) {
    const ls = _loadLS<T>(key);
    if (ls) {
      _cache.set(key, ls);
      e = ls;
    }
  }
  const now = Date.now();
  if (e && e.data !== undefined && now - e.at < ttl) return e.data;
  if (e?.inflight) return e.inflight;
  const run = fetcher()
    .then((data) => {
      const box: CacheBox<T> = { at: Date.now(), data };
      _cache.set(key, box);
      _saveLS(key, box);
      _emit(key);
      return data;
    })
    .catch((err) => {
      const c = _cache.get(key) as CacheBox<T> | undefined;
      if (c) c.inflight = undefined; // прежнее значение остаётся, дадим повторить
      throw err;
    });
  if (e && e.data !== undefined) {
    e.inflight = run;
  } else {
    _cache.set(key, { at: 0, data: undefined as unknown as T, inflight: run });
  }
  return run;
}

const mockSettings: Settings = {
  java_path: "C:\\Program Files\\Java\\jdk-21\\bin\\java.exe",
  ram_mb: 4096,
  window_width: 854,
  window_height: 480,
  game_dir: "C:\\Users\\you\\AppData\\Roaming\\.acironlauncher",
  versions_dir: "C:\\Users\\you\\AppData\\Roaming\\.acironlauncher\\versions",
  builds_dir: "C:\\Users\\you\\AppData\\Roaming\\.acironlauncher\\builds",
  username: "Player",
  hide_on_launch: false,
  background_anim: null,
  discord_rpc: true,
  autoadd_server: true,
  jvm_args: "",
  auto_update_check: true,
  fullscreen: false,
  ui_scale: 100,
  notify_sound: true,
};

export async function getSettings(): Promise<Settings> {
  if (!isTauri) return { ...mockSettings };
  return invoke<Settings>("get_settings");
}

export async function saveSettings(settings: Settings): Promise<void> {
  if (!isTauri) return;
  await invoke("save_settings", { settings });
}

export async function defaultSettings(): Promise<Settings> {
  if (!isTauri) return { ...mockSettings };
  return invoke<Settings>("default_settings");
}

export async function detectJava(): Promise<string> {
  if (!isTauri) return mockSettings.java_path;
  return invoke<string>("detect_java");
}

export async function hardwareCapable(): Promise<boolean> {
  if (!isTauri) return true;
  return invoke<boolean>("hardware_capable");
}

export async function totalRamMb(): Promise<number> {
  if (!isTauri) return 16384;
  return invoke<number>("total_ram_mb");
}

export async function pickFolder(defaultPath?: string): Promise<string | null> {
  if (!isTauri) return null;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const res = await open({ directory: true, defaultPath });
  return typeof res === "string" ? res : null;
}

export async function pickFile(
  name: string,
  extensions: string[],
  defaultPath?: string
): Promise<string | null> {
  if (!isTauri) return null;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const res = await open({
    directory: false,
    multiple: false,
    defaultPath,
    filters: [{ name, extensions }],
  });
  return typeof res === "string" ? res : null;
}

export async function openFolder(path: string): Promise<void> {
  if (!isTauri) return;
  await invoke("open_folder", { path });
}

export async function moveDirectories(moves: { from: string; to: string }[]): Promise<void> {
  if (!isTauri) return;
  await invoke("move_directories", { moves });
}

export async function dataMigrationPending(): Promise<boolean> {
  if (!isTauri) return false;
  return invoke<boolean>("data_migration_pending");
}

export async function migrateData(): Promise<void> {
  if (!isTauri) return;
  await invoke("migrate_data");
}

export async function openUrl(url: string): Promise<void> {
  if (!isTauri) {
    window.open(url, "_blank");
    return;
  }
  const { openUrl } = await import("@tauri-apps/plugin-opener");
  await openUrl(url);
}

export type UpdateInfo = {
  available: boolean;
  current: string;
  latest: string;
  url: string;
  notes: string;
};

export async function checkUpdate(): Promise<UpdateInfo> {
  const fallback: UpdateInfo = {
    available: false,
    current: "",
    latest: "",
    url: "",
    notes: "",
  };
  if (!isTauri) return fallback;
  try {
    return await invoke<UpdateInfo>("check_update");
  } catch {
    return fallback;
  }
}

export type ServerStatus = {
  online: boolean;
  players_online: number;
  players_max: number;
  motd: string;
  version: string;
  icon: string;
};

const STATUS_TTL = 60_000;
const statusCache = new Map<string, { at: number; data: ServerStatus }>();

export function cachedServerStatus(address: string): ServerStatus | null {
  return statusCache.get(address)?.data ?? null;
}

export async function serverStatus(address: string, force = false): Promise<ServerStatus> {
  const empty: ServerStatus = {
    online: false,
    players_online: 0,
    players_max: 0,
    motd: "",
    version: "",
    icon: "",
  };
  const cached = statusCache.get(address);
  if (!force && cached && Date.now() - cached.at < STATUS_TTL) return cached.data;
  if (!isTauri) return cached?.data ?? empty;
  try {
    const data = await invoke<ServerStatus>("server_status", { address });
    statusCache.set(address, { at: Date.now(), data });
    return data;
  } catch {

    return cached?.data ?? empty;
  }
}

export type AccountType = "offline" | "microsoft" | "aciron";

export type Account = {
  id: string;
  username: string;
  uuid: string;
  type: AccountType;
  access_token: string;
  skin_url: string;

  aciron_name?: string;

  licensed?: boolean;
};

const ID_URL = import.meta.env.VITE_ACIRON_ID_URL || "https://example.invalid";

export const ACIRON_ID_WEB = ID_URL;

export const ACIRON_ID_API = ID_URL;

export type AccountsState = { accounts: Account[]; active: string };

const mockAccounts: AccountsState = {
  accounts: [
    { id: "1", username: "Steve", uuid: "", type: "offline", access_token: "0", skin_url: "" },
    { id: "2", username: "Notch", uuid: "", type: "offline", access_token: "0", skin_url: "" },
  ],
  active: "1",
};

export function accountsChanged() {
  // Смена аккаунта: сбрасываем кэш гардероба/каталогов/лицензии
  cacheBust("wardrobe");
  cacheBust("license-capes");
  cacheBust("skin-catalog");
  cacheBust("cape-catalog");
  window.dispatchEvent(new Event("aciron-account"));
}

export async function getAccounts(): Promise<AccountsState> {
  if (!isTauri) return { ...mockAccounts };
  return invoke<AccountsState>("get_accounts");
}

export async function addOfflineAccount(username: string): Promise<Account> {
  if (!isTauri) {
    return { id: String(Date.now()), username, uuid: "", type: "offline", access_token: "0", skin_url: "" };
  }
  return invoke<Account>("add_offline_account", { username });
}

export async function addMicrosoftAccount(): Promise<Account> {
  if (!isTauri) {
    await new Promise((r) => setTimeout(r, 2500));
    return { id: String(Date.now()), username: "MojangGamer", uuid: "", type: "microsoft", access_token: "mock", skin_url: "" };
  }
  return invoke<Account>("add_microsoft_account");
}

export async function acironLogin(
  login: string,
  password: string,
  code?: string
): Promise<Account> {
  if (!isTauri) {
    return {
      id: String(Date.now()),
      username: login,
      uuid: "",
      type: "aciron",
      access_token: "0",
      skin_url: "",
      aciron_name: login,
      licensed: false,
    };
  }
  const acc = await invoke<Account>("aciron_login", { login, password, code });
  accountsChanged();
  return acc;
}

export async function acironRegister(
  username: string,
  email: string,
  password: string
): Promise<string> {
  if (!isTauri) return email;
  return invoke<string>("aciron_register", { username, email, password });
}

export async function acironVerifyEmail(email: string, code: string): Promise<Account> {
  if (!isTauri) throw new Error("нет бэкенда");
  const acc = await invoke<Account>("aciron_verify_email", { email, code });
  accountsChanged();
  return acc;
}

export async function acironResendCode(email: string): Promise<void> {
  if (!isTauri) return;
  await invoke("aciron_resend_code", { email });
}

export async function acironLinkLicense(accountId: string): Promise<Account> {
  if (!isTauri) {
    await new Promise((r) => setTimeout(r, 1500));
    throw new Error("нет бэкенда");
  }
  return invoke<Account>("aciron_link_license", { accountId });
}

export async function removeAccount(id: string): Promise<void> {
  if (!isTauri) return;
  await invoke("remove_account", { id });
  accountsChanged();
}

export async function setActiveAccount(id: string): Promise<void> {
  if (!isTauri) return;
  await invoke("set_active_account", { id });
  accountsChanged();
}

export type PresenceStatus = "online" | "idle" | "dnd" | "invisible";

export type PresenceState = "online" | "idle" | "dnd" | "offline";

export type FriendPresence = {
  state: PresenceState;

  inLauncher?: boolean;
  inGame?: boolean;
  mcVersion?: string | null;
  buildName?: string | null;
  server?: string | null;
};

export type Friend = {
  id: string;
  username: string;
  hasSkin: boolean;
  presence: FriendPresence;
};

export type PendingUser = { id: string; username: string; hasSkin: boolean };

export type FriendsData = {
  me: { status: PresenceStatus; acceptRequests: boolean };
  friends: Friend[];
  incoming: PendingUser[];
  outgoing: PendingUser[];
};

const mockFriends: FriendsData = {
  me: { status: "online", acceptRequests: true },
  friends: [
    {
      id: "f1",
      username: "DrG4st3r",
      hasSkin: false,
      presence: { state: "online", inLauncher: true, inGame: true, mcVersion: "1.21.2", buildName: "SkyBlock" },
    },
    {
      id: "f2",
      username: "Stralitz",
      hasSkin: false,
      presence: { state: "idle", inLauncher: true },
    },
    { id: "f3", username: "PoS1tiveOnlyMe", hasSkin: false, presence: { state: "offline" } },
  ],
  incoming: [{ id: "f4", username: "Notch", hasSkin: false }],
  outgoing: [],
};

export async function friendsList(): Promise<FriendsData> {
  if (!isTauri) return structuredClone(mockFriends);
  return cached("friends", 5_000, () => invoke<FriendsData>("friends_list"));
}

export async function friendRequest(username: string): Promise<"requested" | "accepted"> {
  if (!isTauri) return "requested";
  const r = await invoke<"requested" | "accepted">("friend_request", { username });
  cacheBust("friends");
  return r;
}

export async function friendRespond(user_id: string, accept: boolean): Promise<void> {
  if (!isTauri) return;
  await invoke("friend_respond", { userId: user_id, accept });
  cacheBust("friends");
}

export async function friendCancel(user_id: string): Promise<void> {
  if (!isTauri) return;
  await invoke("friend_cancel", { userId: user_id });
  cacheBust("friends");
}

export async function friendRemove(user_id: string): Promise<void> {
  if (!isTauri) return;
  await invoke("friend_remove", { userId: user_id });
  cacheBust("friends");
}

export async function setPresenceStatus(status: PresenceStatus): Promise<void> {
  if (!isTauri) return;
  await invoke("set_presence_status", { status });
  cacheBust("friends");
}

export async function setAcceptRequests(enabled: boolean): Promise<void> {
  if (!isTauri) return;
  await invoke("set_accept_requests", { enabled });
  cacheBust("friends");
}

export async function setPresencePrivacy(showGame: boolean, showServer: boolean): Promise<void> {
  if (!isTauri) return;
  await invoke("set_presence_privacy", { showGame, showServer });
}

export type SkinModelId = "classic" | "slim";

export type WardrobeItem = {
  id: string;
  kind: "skin" | "cape";
  name: string;
  model: SkinModelId;

  url: string;
  createdAt: number;
};

export type Outfit = {
  id: string;
  name: string;
  skinId: string | null;
  capeId: string | null;
  model: SkinModelId;
  createdAt: number;
};

export type WardrobeData = {
  skins: WardrobeItem[];
  capes: WardrobeItem[];
  outfits: Outfit[];
  active: {
    skinId: string | null;

    skinCatalogId: string | null;
    capeId: string | null;

    capeCatalogId: string | null;
    model: SkinModelId;
    hasSkin: boolean;
    hasCape: boolean;
  };
  licensed: boolean;
};

export type ApplyResult = { synced: boolean; error?: string | null };

export function textureUrl(item: Pick<WardrobeItem, "url">): string {
  return `${ACIRON_ID_API}${item.url}`;
}

export function activeSkinUrl(nick: string, bust = 0): string {
  return `${ACIRON_ID_API}/skins/${encodeURIComponent(nick.toLowerCase())}.png?v=${bust}`;
}
export function activeCapeUrl(nick: string, bust = 0): string {
  return `${ACIRON_ID_API}/capes/${encodeURIComponent(nick.toLowerCase())}.png?v=${bust}`;
}

export async function wardrobeList(): Promise<WardrobeData> {
  if (!isTauri) {
    return {
      skins: [],
      capes: [],
      outfits: [],
      active: {
        skinId: null,
        skinCatalogId: null,
        capeId: null,
        capeCatalogId: null,
        model: "classic",
        hasSkin: false,
        hasCape: false,
      },
      licensed: false,
    };
  }
  // Кэш + таймаут: мгновенная отдача при повторном заходе, ревалидация в фоне
  return cached("wardrobe", 30_000, () => withTimeout(invoke<WardrobeData>("wardrobe_list")));
}

export async function wardrobeAdd(
  path: string,
  kind: "skin" | "cape",
  name: string,
  model: SkinModelId = "classic"
): Promise<WardrobeItem> {
  if (!isTauri) throw new Error("нет бэкенда");
  const item = await invoke<WardrobeItem>("wardrobe_add", { path, kind, name, model });
  cacheBust("wardrobe");
  return item;
}

export async function readTexture(path: string): Promise<string> {
  if (!isTauri) throw new Error("нет бэкенда");
  return invoke<string>("read_texture", { path });
}

export const MAX_SKINS = 10;

export async function wardrobeApply(id: string): Promise<ApplyResult> {
  if (!isTauri) throw new Error("нет бэкенда");
  const r = await invoke<ApplyResult>("wardrobe_apply", { id });
  cacheBust("wardrobe");
  return r;
}

export async function wardrobeDelete(id: string): Promise<void> {
  if (!isTauri) return;
  await invoke("wardrobe_delete", { id });
  cacheBust("wardrobe");
}

export async function wardrobeRename(
  id: string,
  name: string,
  model: SkinModelId
): Promise<void> {
  if (!isTauri) return;
  await invoke("wardrobe_rename", { id, name, model });
  cacheBust("wardrobe");
}

export async function wardrobeCapeOff(): Promise<void> {
  if (!isTauri) return;
  await invoke("wardrobe_cape_off");
  cacheBust("wardrobe");
}

export type CatalogCape = { id: string; name: string; url: string; by: string };

export async function capeCatalog(): Promise<CatalogCape[]> {
  if (!isTauri) return [];
  return cached("cape-catalog", 1_800_000, () => withTimeout(invoke<CatalogCape[]>("cape_catalog")));
}

export async function capeCatalogApply(id: string): Promise<void> {
  if (!isTauri) return;
  await invoke("cape_catalog_apply", { id });
  cacheBust("wardrobe");
}

export type CatalogSkin = { id: string; name: string; url: string; model: SkinModelId };

export async function skinCatalog(): Promise<CatalogSkin[]> {
  if (!isTauri) return [];
  return cached("skin-catalog", 1_800_000, () => withTimeout(invoke<CatalogSkin[]>("skin_catalog")));
}

export async function skinCatalogApply(id: string): Promise<ApplyResult> {
  if (!isTauri) throw new Error("нет бэкенда");
  const r = await invoke<ApplyResult>("skin_catalog_apply", { id });
  cacheBust("wardrobe");
  return r;
}

export type LicenseCape = { id: string; name: string; url: string; active: boolean };
export type LicenseCapes = { linked: boolean; capes: LicenseCape[] };

export async function licenseCapes(): Promise<LicenseCapes> {
  if (!isTauri) return { linked: false, capes: [] };
  return cached("license-capes", 60_000, () => withTimeout(invoke<LicenseCapes>("license_capes")));
}

export async function licenseCapeApply(cape_id: string | null): Promise<void> {
  if (!isTauri) return;
  await invoke("license_cape_apply", { capeId: cape_id });
  cacheBust("license-capes");
  cacheBust("wardrobe");
}

export async function outfitAdd(
  name: string,
  skin_id: string | null,
  cape_id: string | null,
  model: SkinModelId
): Promise<Outfit> {
  if (!isTauri) throw new Error("нет бэкенда");
  const o = await invoke<Outfit>("outfit_add", { name, skinId: skin_id, capeId: cape_id, model });
  cacheBust("wardrobe");
  return o;
}

export async function outfitApply(id: string): Promise<void> {
  if (!isTauri) return;
  await invoke("outfit_apply", { id });
  cacheBust("wardrobe");
}

export async function outfitDelete(id: string): Promise<void> {
  if (!isTauri) return;
  await invoke("outfit_delete", { id });
  cacheBust("wardrobe");
}

export function friendSkinUrl(f: { username: string; hasSkin: boolean }): string {
  return f.hasSkin ? `${ACIRON_ID_API}/skins/${encodeURIComponent(f.username.toLowerCase())}.png` : "";
}

export type InstalledVersion = { id: string; type: string };

const INSTALLED_KEY = "aciron:installed";

export async function getInstalledVersions(): Promise<InstalledVersion[]> {
  if (!isTauri) {
    try {
      return JSON.parse(localStorage.getItem(INSTALLED_KEY) || "[]");
    } catch {
      return [];
    }
  }
  return invoke<InstalledVersion[]>("get_installed_versions");
}

export async function addInstalledVersion(id: string, type = "release"): Promise<void> {
  if (!isTauri) {
    const list: InstalledVersion[] = JSON.parse(localStorage.getItem(INSTALLED_KEY) || "[]");
    if (!list.some((v) => v.id === id)) {
      list.push({ id, type });
      localStorage.setItem(INSTALLED_KEY, JSON.stringify(list));
    }
    return;
  }
  await invoke("add_installed_version", { id, kind: type });
}

export async function removeInstalledVersion(id: string): Promise<void> {
  if (!isTauri) {
    const list: InstalledVersion[] = JSON.parse(localStorage.getItem(INSTALLED_KEY) || "[]");
    localStorage.setItem(INSTALLED_KEY, JSON.stringify(list.filter((v) => v.id !== id)));
    return;
  }
  await invoke("remove_installed_version", { id });
}

export type Recent = {

  id: string;

  kind: string;
  name: string;
  mc_version: string;

  last_played: number;
  playtime_secs: number;
};

export async function getRecents(): Promise<Recent[]> {
  if (!isTauri) {

    const now = Date.now() / 1000;
    return [
      { id: "26.2", kind: "version", name: "26.2", mc_version: "26.2", last_played: now - 3600, playtime_secs: 5 * 3600 },
      { id: "build:demo", kind: "build", name: "Сборка SkyBlock", mc_version: "1.21.1", last_played: now - 86400, playtime_secs: 511 * 3600 },
      { id: "1.12.2", kind: "version", name: "1.12.2", mc_version: "1.12.2", last_played: now - 3 * 86400, playtime_secs: 40 },
    ];
  }
  return invoke<Recent[]>("get_recents");
}

export async function removeRecent(id: string): Promise<void> {
  if (!isTauri) return;
  await invoke("remove_recent", { id });
}

export type VersionInfo = { id: string; type: string; release_time: string };

export async function listVersions(): Promise<VersionInfo[]> {
  if (!isTauri) {

    return [
      { id: "1.21.4", type: "release", release_time: "2024-12-03" },
      { id: "1.21.3", type: "release", release_time: "2024-10-23" },
      { id: "1.20.6", type: "release", release_time: "2024-04-29" },
      { id: "1.20.1", type: "release", release_time: "2023-06-12" },
      { id: "1.19.4", type: "release", release_time: "2023-03-14" },
      { id: "1.18.2", type: "release", release_time: "2022-02-28" },
      { id: "1.16.5", type: "release", release_time: "2021-01-15" },
      { id: "1.12.2", type: "release", release_time: "2017-09-18" },
      { id: "1.8.9", type: "release", release_time: "2015-12-09" },
    ];
  }
  return cached("mc-versions", 21_600_000, () => invoke<VersionInfo[]>("list_versions"));
}

export function headSkinUrl(account: Pick<Account, "username" | "skin_url">): string {
  if (account.skin_url) return account.skin_url;
  return `https://mc-heads.net/skin/${encodeURIComponent(account.username)}`;
}

export type Loader = "fabric" | "forge" | "neoforge" | "quilt";

export type ContentKind = "mod" | "resourcepack" | "shader";

export type InstalledMod = {
  project_id: string;
  version_id: string;
  name: string;
  filename: string;
  icon_url: string;
  enabled: boolean;
  kind: ContentKind;
};

export type Build = {
  id: string;
  name: string;
  mc_version: string;
  loader: Loader;
  loader_version: string;
  mods: InstalledMod[];
  created: number;
  dir: string;

  banner: string;
  image: string;
  icon_url: string;
  playtime_secs: number;
};

export async function getBuilds(): Promise<Build[]> {
  if (!isTauri) return [];
  return invoke<Build[]>("get_builds");
}

export async function createBuild(name: string, mc_version: string, loader: Loader): Promise<Build> {
  if (!isTauri) {
    return { id: String(Date.now()), name, mc_version, loader, loader_version: "", mods: [], created: Date.now() / 1000, dir: "", banner: "", image: "", icon_url: "", playtime_secs: 0 };
  }
  return invoke<Build>("create_build", { name, mcVersion: mc_version, loader });
}

export async function setBuildImage(build_id: string, src_path: string): Promise<Build> {
  if (!isTauri) throw new Error("нет бэкенда");
  return invoke<Build>("set_build_image", { buildId: build_id, srcPath: src_path });
}

export async function setBuildBanner(build_id: string, src_path: string): Promise<Build> {
  if (!isTauri) throw new Error("нет бэкенда");
  return invoke<Build>("set_build_banner", { buildId: build_id, srcPath: src_path });
}

export async function getBuildBanner(build_id: string): Promise<string | null> {
  if (!isTauri) return null;
  return invoke<string | null>("get_build_banner", { buildId: build_id });
}

export async function getBuildImage(build_id: string): Promise<string | null> {
  if (!isTauri) return null;
  return invoke<string | null>("get_build_image", { buildId: build_id });
}

export async function changeBuildVersion(build_id: string, mc_version: string): Promise<Build> {
  if (!isTauri) throw new Error("нет бэкенда");
  return invoke<Build>("change_build_version", { buildId: build_id, mcVersion: mc_version });
}

export async function renameBuild(build_id: string, name: string): Promise<Build> {
  if (!isTauri) throw new Error("нет бэкенда");
  return invoke<Build>("rename_build", { buildId: build_id, name });
}

export async function deleteBuild(id: string): Promise<void> {
  if (!isTauri) return;
  await invoke("delete_build", { id });
}

export async function openBuildFolder(id: string): Promise<void> {
  if (!isTauri) return;
  await invoke("open_build_folder", { id });
}

export async function removeMod(build_id: string, project_id: string): Promise<Build> {
  if (!isTauri) throw new Error("нет бэкенда");
  return invoke<Build>("remove_mod", { buildId: build_id, projectId: project_id });
}

export async function toggleMod(build_id: string, project_id: string): Promise<Build> {
  if (!isTauri) throw new Error("нет бэкенда");
  return invoke<Build>("toggle_mod", { buildId: build_id, projectId: project_id });
}

export async function refreshBuildContent(build_id: string): Promise<Build> {
  if (!isTauri) throw new Error("нет бэкенда");
  return invoke<Build>("refresh_build_content", { buildId: build_id });
}

export async function matchLocalMods(build_id: string): Promise<Build> {
  if (!isTauri) throw new Error("нет бэкенда");
  return invoke<Build>("match_local_mods", { buildId: build_id });
}

export async function importMrpack(path: string): Promise<Build> {
  if (!isTauri) throw new Error("нет бэкенда");
  return invoke<Build>("import_mrpack", { path });
}

export type ExternalInstance = {
  source: string;
  source_label: string;
  path: string;
  name: string;
  mc_version: string;
  loader: string;
  mods_count: number;
};

export async function scanExternalInstances(): Promise<ExternalInstance[]> {
  if (!isTauri) return [];
  return invoke<ExternalInstance[]>("scan_external_instances");
}

export async function importExternalInstance(path: string, source: string): Promise<Build> {
  if (!isTauri) throw new Error("нет бэкенда");
  return invoke<Build>("import_external_instance", { path, source });
}

export async function firstRunPending(): Promise<boolean> {
  if (!isTauri) return false;
  return invoke<boolean>("first_run_pending");
}

export async function completeFirstRun(): Promise<void> {
  if (!isTauri) return;
  await invoke("complete_first_run");
}

export type ModHit = {
  project_id: string;
  slug: string;
  title: string;
  description: string;
  icon_url: string;
  downloads: number;
  categories: string[];
  author: string;
};

export type ModSearch = { hits: ModHit[]; total_hits: number; offset: number; limit: number };

export async function modrinthSearch(
  query: string,
  loader: string,
  game_version: string,
  categories: string[],
  index: string,
  offset: number,
  limit: number,
  project_type = "mod"
): Promise<ModSearch> {
  if (!isTauri) return { hits: [], total_hits: 0, offset: 0, limit };
  const key = "search:modrinth:" + JSON.stringify([query, loader, game_version, [...categories].sort(), index, offset, limit, project_type]);
  return cached(key, 120_000, () => invoke<ModSearch>("modrinth_search", {
    query,
    loader,
    gameVersion: game_version,
    categories,
    index,
    offset,
    limit,
    projectType: project_type,
  }));
}

export async function installModpack(project_id: string, version_id?: string): Promise<Build> {
  if (!isTauri) throw new Error("нет бэкенда");
  return invoke<Build>("install_modpack", { projectId: project_id, versionId: version_id ?? null });
}

export async function modrinthCategories(): Promise<string[]> {
  if (!isTauri) return ["adventure", "optimization", "utility", "worldgen", "library"];
  return cached("cats:modrinth", 86_400_000, () => invoke<string[]>("modrinth_categories"));
}

export async function modrinthInstall(build_id: string, project_id: string): Promise<Build> {
  if (!isTauri) throw new Error("нет бэкенда");
  return invoke<Build>("modrinth_install", { buildId: build_id, projectId: project_id });
}

export async function checkBuildUpdates(build_id: string): Promise<string[]> {
  if (!isTauri) return [];
  return invoke<string[]>("check_build_updates", { buildId: build_id });
}

export type GalleryImage = { url: string; title?: string; description?: string; featured?: boolean };

export type ModProject = {
  title: string;
  slug: string;
  description: string;
  body: string;
  categories: string[];
  downloads: number;
  followers: number;
  icon_url: string;
  gallery: GalleryImage[];
  source_url?: string;
  issues_url?: string;
  wiki_url?: string;
  discord_url?: string;
  website_url?: string;
};

export async function modrinthProject(project_id: string): Promise<ModProject> {
  return cached("proj:modrinth:" + project_id, 600_000, () =>
    invoke<ModProject>("modrinth_project", { projectId: project_id }));
}

export type ModVersion = {
  id: string;
  name: string;
  version_number: string;
  version_type: string;
  game_versions: string[];
  loaders: string[];
  date_published: string;
  downloads: number;
};

export async function projectVersions(project_id: string): Promise<ModVersion[]> {
  if (!isTauri) return [];
  return cached("vers:modrinth:" + project_id, 600_000, () =>
    invoke<ModVersion[]>("project_versions", { projectId: project_id }));
}

export async function modrinthInstallVersion(
  build_id: string,
  project_id: string,
  version_id: string
): Promise<Build> {
  if (!isTauri) throw new Error("нет бэкенда");
  return invoke<Build>("modrinth_install_version", {
    buildId: build_id,
    projectId: project_id,
    versionId: version_id,
  });
}

export async function curseforgeSearch(
  query: string,
  loader: string,
  game_version: string,
  categories: string[],
  index: string,
  offset: number,
  limit: number,
  project_type = "mod"
): Promise<ModSearch> {
  if (!isTauri) return { hits: [], total_hits: 0, offset: 0, limit };
  const key = "search:curseforge:" + JSON.stringify([query, loader, game_version, [...categories].sort(), index, offset, limit, project_type]);
  return cached(key, 120_000, () => invoke<ModSearch>("curseforge_search", {
    query,
    loader,
    gameVersion: game_version,
    categories,
    index,
    offset,
    limit,
    projectType: project_type,
  }));
}

export async function curseforgeCategories(): Promise<string[]> {
  if (!isTauri) return [];
  return cached("cats:curseforge", 86_400_000, () => invoke<string[]>("curseforge_categories"));
}

export async function curseforgeInstall(build_id: string, project_id: string): Promise<Build> {
  if (!isTauri) throw new Error("нет бэкенда");
  return invoke<Build>("curseforge_install", { buildId: build_id, projectId: project_id });
}

export async function curseforgeProject(project_id: string): Promise<ModProject> {
  return cached("proj:curseforge:" + project_id, 600_000, () =>
    invoke<ModProject>("curseforge_project", { projectId: project_id }));
}

export async function curseforgeProjectVersions(project_id: string): Promise<ModVersion[]> {
  if (!isTauri) return [];
  return cached("vers:curseforge:" + project_id, 600_000, () =>
    invoke<ModVersion[]>("curseforge_project_versions", { projectId: project_id }));
}

export async function curseforgeInstallVersion(
  build_id: string,
  project_id: string,
  version_id: string
): Promise<Build> {
  if (!isTauri) throw new Error("нет бэкенда");
  return invoke<Build>("curseforge_install_version", {
    buildId: build_id,
    projectId: project_id,
    versionId: version_id,
  });
}

export async function curseforgeInstallModpack(project_id: string, version_id?: string): Promise<Build> {
  if (!isTauri) throw new Error("нет бэкенда");
  return invoke<Build>("curseforge_install_modpack", {
    projectId: project_id,
    versionId: version_id ?? null,
  });
}

export async function ftbSearch(query: string, offset: number, limit: number): Promise<ModSearch> {
  if (!isTauri) return { hits: [], total_hits: 0, offset: 0, limit };
  const key = "search:ftb:" + JSON.stringify([query, offset, limit]);
  return cached(key, 120_000, () => invoke<ModSearch>("ftb_search", { query, offset, limit }));
}

export async function ftbProject(project_id: string): Promise<ModProject> {
  return cached("proj:ftb:" + project_id, 600_000, () =>
    invoke<ModProject>("ftb_project", { projectId: project_id }));
}

export async function ftbProjectVersions(project_id: string): Promise<ModVersion[]> {
  if (!isTauri) return [];
  return cached("vers:ftb:" + project_id, 600_000, () =>
    invoke<ModVersion[]>("ftb_project_versions", { projectId: project_id }));
}

export async function ftbInstallModpack(project_id: string, version_id?: string): Promise<Build> {
  if (!isTauri) throw new Error("нет бэкенда");
  return invoke<Build>("ftb_install_modpack", {
    projectId: project_id,
    versionId: version_id ?? null,
  });
}

export type SourceId = "modrinth" | "curseforge" | "ftb";

export function searchContent(
  source: SourceId,
  query: string,
  loader: string,
  game_version: string,
  categories: string[],
  index: string,
  offset: number,
  limit: number,
  project_type = "mod"
): Promise<ModSearch> {
  if (source === "ftb") return ftbSearch(query, offset, limit);
  return source === "curseforge"
    ? curseforgeSearch(query, loader, game_version, categories, index, offset, limit, project_type)
    : modrinthSearch(query, loader, game_version, categories, index, offset, limit, project_type);
}

export function contentCategories(source: SourceId): Promise<string[]> {
  return source === "curseforge" ? curseforgeCategories() : modrinthCategories();
}

export function installContent(source: SourceId, build_id: string, project_id: string): Promise<Build> {
  return source === "curseforge"
    ? curseforgeInstall(build_id, project_id)
    : modrinthInstall(build_id, project_id);
}

export function contentProject(source: SourceId, project_id: string): Promise<ModProject> {
  if (source === "ftb") return ftbProject(project_id);
  return source === "curseforge" ? curseforgeProject(project_id) : modrinthProject(project_id);
}

export function contentVersions(source: SourceId, project_id: string): Promise<ModVersion[]> {
  if (source === "ftb") return ftbProjectVersions(project_id);
  return source === "curseforge" ? curseforgeProjectVersions(project_id) : projectVersions(project_id);
}

export function installModpackContent(
  source: SourceId,
  project_id: string,
  version_id?: string
): Promise<Build> {
  if (source === "ftb") return ftbInstallModpack(project_id, version_id);
  return source === "curseforge"
    ? curseforgeInstallModpack(project_id, version_id)
    : installModpack(project_id, version_id);
}

export function installContentVersion(
  source: SourceId,
  build_id: string,
  project_id: string,
  version_id: string
): Promise<Build> {
  return source === "curseforge"
    ? curseforgeInstallVersion(build_id, project_id, version_id)
    : modrinthInstallVersion(build_id, project_id, version_id);
}
