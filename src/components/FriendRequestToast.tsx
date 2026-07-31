import { useEffect, useRef, useState } from "react";
import { ACIRON_ID_API, friendRespond, type PendingUser } from "../api";
import { patchFriends, refreshFriends, restoreFriends } from "../friends";
import { useToast } from "../ToastContext";

const LIFE_MS = 5000;

const SLIDE_MS = 260;

export default function FriendRequestToast({
  user,
  onDone,
}: {
  user: PendingUser;
  onDone: () => void;
}) {
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const timer = useRef<number | null>(null);
  const closing = useRef(false);
  const toast = useToast();

  const close = () => {
    if (closing.current) return;
    closing.current = true;
    setShown(false);
    window.setTimeout(onDone, SLIDE_MS);
  };

  const arm = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(close, LIFE_MS);
  };
  const hold = () => {
    if (timer.current) window.clearTimeout(timer.current);
  };

  useEffect(() => {

    const raf = requestAnimationFrame(() => setShown(true));
    arm();
    return () => {
      cancelAnimationFrame(raf);
      if (timer.current) window.clearTimeout(timer.current);
    };

  }, []);

  const respond = async (accept: boolean) => {
    if (busy) return;
    setBusy(true);
    // Оптимистично убираем заявку и сразу закрываем тост; при ошибке возвращаем
    // её обратно и показываем сообщение (раньше ошибка молча проглатывалась).
    const prev = patchFriends((d) => ({
      ...d,
      incoming: d.incoming.filter((u) => u.id !== user.id),
    }));
    close();
    try {
      await friendRespond(user.id, accept);
      refreshFriends();
    } catch (e) {
      restoreFriends(prev);
      toast(String(e).replace(/^Error:\s*/, ""), "error");
    }
  };

  const avatar = user.hasSkin
    ? `${ACIRON_ID_API}/skins/${encodeURIComponent(user.username.toLowerCase())}.png`
    : "";

  return (
    <div
      onMouseEnter={hold}
      onMouseLeave={arm}
      style={{
        transition: `transform ${SLIDE_MS}ms cubic-bezier(.2,.8,.2,1), opacity ${SLIDE_MS}ms`,
        transform: shown ? "translateX(0)" : "translateX(-120%)",
        opacity: shown ? 1 : 0,
      }}
      className="pointer-events-auto w-[300px] rounded-2xl border border-border bg-panel/95 p-3 shadow-lg backdrop-blur"
    >
      <div className="flex items-center gap-3">
        {}
        <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-card text-muted">
          {avatar ? (
            <div
              className="h-10 w-10"
              style={{
                backgroundImage: `url(${avatar})`,
                backgroundSize: "320px",
                backgroundPosition: "-40px -40px",
                imageRendering: "pixelated",
              }}
            />
          ) : (
            <i className="fa-solid fa-user text-sm" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="line-clamp-1 text-sm font-semibold text-text">{user.username}</div>
          <div className="text-[11px] text-muted">хочет добавить вас в друзья</div>
        </div>

        <button
          onClick={close}
          title="Скрыть"
          className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-muted transition-colors hover:text-text"
        >
          <i className="fa-solid fa-xmark text-xs" />
        </button>
      </div>

      <div className="mt-2.5 flex gap-2">
        <button
          onClick={() => void respond(true)}
          disabled={busy}
          className="flex-1 rounded-lg bg-accent py-2 text-xs font-bold text-bg transition-colors hover:bg-accent-hover disabled:opacity-60"
        >
          Принять
        </button>
        <button
          onClick={() => void respond(false)}
          disabled={busy}
          className="flex-1 rounded-lg border border-border py-2 text-xs font-medium text-muted transition-colors hover:text-text disabled:opacity-60"
        >
          Отклонить
        </button>
      </div>
    </div>
  );
}
