import { lazy, Suspense, useEffect, useLayoutEffect, useState } from "react";
import TitleBar from "./components/TitleBar";
import ResizeHandles from "./components/ResizeHandles";
import DownloadOrb from "./components/DownloadOrb";
import Sidebar, { type NavId } from "./components/Sidebar";
import PlayBar from "./components/PlayBar";
import DownloadBar from "./components/DownloadBar";
import Home from "./components/Home";
import BuildsPage from "./components/BuildsPage";
import FriendsPage from "./components/FriendsPage";

const WardrobePage = lazy(() => import("./components/WardrobePage"));
import ServersPage from "./components/ServersPage";
import SettingsModal from "./components/SettingsModal";
import BackgroundCubes from "./components/BackgroundCubes";
import FirstRunImport from "./components/FirstRunImport";
import DataMigrationModal from "./components/DataMigrationModal";
import Onboarding from "./components/Onboarding";
import Tooltip from "./components/Tooltip";
import { DEBUG_TOOLS, DEV } from "./config";
import { LauncherProvider } from "./LauncherContext";
import { ToastProvider } from "./ToastContext";
import FriendRequestToasts from "./components/FriendRequestToasts";
import ChatToasts from "./components/ChatToasts";
import { ThemeProvider } from "./ThemeContext";
import { t, useLang } from "./i18n";
import {
  getSettings,
  hardwareCapable,
  firstRunPending,
  isTauri,
  openUrl,
  scanExternalInstances,
  dataMigrationPending,
  pendingPack,
  type ExternalInstance,
} from "./api";

const DEBUG_INSTANCES: ExternalInstance[] = [
  {
    source: "prism",
    source_label: "Prism Launcher",
    path: "C:\\Users\\you\\AppData\\Roaming\\PrismLauncher\\instances\\Fabulously",
    name: "Fabulously Optimized",
    mc_version: "1.21.1",
    loader: "fabric",
    mods_count: 87,
  },
  {
    source: "modrinth",
    source_label: "Modrinth App",
    path: "C:\\Users\\you\\AppData\\Roaming\\ModrinthApp\\profiles\\Create",
    name: "Create: Above and Beyond",
    mc_version: "1.18.2",
    loader: "forge",
    mods_count: 142,
  },
];

function AppInner() {

  useLang();
  const [active, setActive] = useState<NavId>("home");
  const [anim, setAnim] = useState(false);
  const [uiScale, setUiScale] = useState(100);
  const [importList, setImportList] = useState<ExternalInstance[] | null>(null);
  const [migratePrompt, setMigratePrompt] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notifySound, setNotifySound] = useState(true);
  const [onboarding, setOnboarding] = useState(false);

  const showBottomBar =
    active !== "builds" && active !== "servers" && active !== "wardrobe" && active !== "friends";

  const requestNav = (id: NavId) => {
    if (id === "settings") {
      setSettingsOpen(true);
      return;
    }

    if (id === active) window.dispatchEvent(new CustomEvent("aciron-nav-reset", { detail: id }));
    setActive(id);
  };

  const offerImport = async () => {
    try {
      if (!(await firstRunPending())) return;
      const found = await scanExternalInstances();
      if (found.length > 0) setImportList(found);
    } catch {

    }
  };

  useEffect(() => {
    (async () => {
      try {
        if (await dataMigrationPending()) {
          setMigratePrompt(true);
          return;
        }

        const s = await getSettings();
        if (!s.onboarded && (await firstRunPending())) {
          setOnboarding(true);
          return;
        }
        await offerImport();
      } catch {

      }
    })();
  }, []);

  useEffect(() => {
    const open = (e: Event) => {

      const id = (e as CustomEvent<string>).detail;
      if (id) (window as unknown as { __acironOpenChat?: string }).__acironOpenChat = id;
      setActive("friends");
    };
    window.addEventListener("aciron-open-chat", open);
    return () => window.removeEventListener("aciron-open-chat", open);
  }, []);

  useEffect(() => {
    const open = () => setActive("builds");
    window.addEventListener("aciron-open-build", open);
    return () => window.removeEventListener("aciron-open-build", open);
  }, []);

  useEffect(() => {
    const hand = (path: string) => {
      if (!path) return;
      (window as unknown as { __acironOpenPack?: string }).__acironOpenPack = path;
      setActive("builds");

      window.dispatchEvent(new CustomEvent("aciron-open-pack", { detail: path }));
    };

    void pendingPack()
      .then((p) => {
        if (p) hand(p);
      })
      .catch(() => {});

    if (!isTauri) return;
    let off: (() => void) | undefined;
    let dead = false;
    void (async () => {
      const { listen } = await import("@tauri-apps/api/event");
      const un = await listen<string>("acpack-open", (e) => hand(e.payload));
      if (dead) un();
      else off = un;
    })();
    return () => {
      dead = true;
      off?.();
    };
  }, []);

  useEffect(() => {
    const onScale = (e: Event) => setUiScale((e as CustomEvent).detail || 100);
    window.addEventListener("aciron-ui-scale", onScale);
    return () => window.removeEventListener("aciron-ui-scale", onScale);
  }, []);

  useEffect(() => {
    if (!DEV && !DEBUG_TOOLS) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F6") {
        e.preventDefault();
        setMigratePrompt((v) => !v);
      }
      if (e.key === "F7") {
        e.preventDefault();
        setOnboarding((v) => !v);
      }
      if (e.key === "F8") {
        e.preventDefault();
        setImportList((l) => (l ? null : DEBUG_INSTANCES));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (DEV) return;
    const block = (e: MouseEvent) => e.preventDefault();
    document.addEventListener("contextmenu", block);
    return () => document.removeEventListener("contextmenu", block);
  }, []);

  const scale = Math.min(1.6, Math.max(0.8, uiScale / 100));

  useLayoutEffect(() => {
    (window as unknown as { __acironScale: number }).__acironScale = scale;
  }, [scale]);

  useEffect(() => {
    if (!isTauri) return;
    let stop: (() => void) | undefined;
    let dead = false;
    void (async () => {
      const { listen } = await import("@tauri-apps/api/event");
      const un = await listen<{ url: string; embedded?: boolean }>("ms-auth-open", (e) => {
        if (!e.payload.embedded) openUrl(e.payload.url);
      });
      if (dead) un();
      else stop = un;
    })();
    return () => {
      dead = true;
      stop?.();
    };
  }, []);

  useEffect(() => {
    getSettings().then(async (s) => {
      setAnim(s.background_anim ?? (await hardwareCapable()));
      setUiScale(s.ui_scale || 100);
      setNotifySound(s.notify_sound !== false);
    });
  }, [active]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-bg text-text">
      {anim && <BackgroundCubes />}
      <ResizeHandles />
      {}
      <Tooltip />
      {}
      <FriendRequestToasts sound={notifySound} />
      {}
      <ChatToasts
        sound={notifySound}
        onOpen={(userId) =>
          window.dispatchEvent(new CustomEvent("aciron-open-chat", { detail: userId }))
        }
      />
      {}
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{
          width: `${100 / scale}%`,
          height: `${100 / scale}%`,
          transform: `scale(${scale})`,
        }}
      >
        <DownloadOrb abovePlayBar={showBottomBar} />
        {migratePrompt && <DataMigrationModal />}
        {onboarding && (
          <Onboarding
            onClose={() => {
              setOnboarding(false);
              void offerImport();
            }}
          />
        )}
        {importList && (
          <FirstRunImport instances={importList} onClose={() => setImportList(null)} />
        )}
        {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
        {}
        {DEBUG_TOOLS && !onboarding && (
          <button
            onClick={() => setOnboarding(true)}
            title={t("Открыть мастер настройки (F7)")}
            className="absolute bottom-3 left-3 z-30 grid h-8 w-8 place-items-center rounded-lg border border-border bg-card/80 text-[11px] text-muted opacity-40 backdrop-blur transition hover:opacity-100 hover:text-accent"
          >
            <i className="fa-solid fa-wand-magic-sparkles" />
          </button>
        )}
        <div className="relative z-10 flex h-full w-full flex-col">
          <TitleBar />
          <div className="flex min-h-0 flex-1">
            <Sidebar active={active} onSelect={requestNav} />
            <div className="flex min-w-0 flex-1 flex-col">
              {}
              <main className="min-h-0 flex-1 overflow-hidden">
                {active === "home" && <Home />}
                {active === "builds" && <BuildsPage />}
                {active === "wardrobe" && (
                  <Suspense
                    fallback={
                      <div className="grid h-full place-items-center text-muted">
                        <i className="fa-solid fa-spinner fa-spin text-xl" />
                      </div>
                    }
                  >
                    <WardrobePage />
                  </Suspense>
                )}
                {active === "friends" && <FriendsPage />}
                {active === "servers" && <ServersPage />}
              </main>
              {}
              {showBottomBar && (
                <>
                  <DownloadBar />
                  <PlayBar />
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <LauncherProvider>
          <AppInner />
        </LauncherProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
