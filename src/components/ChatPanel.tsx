import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ContactAvatar, PlusMark, VerifiedMark } from "./ContactAvatar";
import ProfileModal from "./ProfileModal";
import MessageMenu, { type MenuItem } from "./chat/MessageMenu";
import ForwardModal from "./chat/ForwardModal";
import TypingDots from "./chat/TypingDots";
import LoadingDots from "./LoadingDots";
import EmojiPicker from "./chat/EmojiPicker";
import FloatingPanel from "./FloatingPanel";
import Lightbox from "./Lightbox";
import Twemoji from "./chat/Twemoji";
import ImageSendModal from "./chat/ImageSendModal";
import {
  acironProfileUrl,
  chatFileUrl,
  getAccounts,
  MAX_MESSAGE,
  openUrl,
  pickFile,
  readImageDataUrl,
  type ChatAttachment,
  type Friend,
} from "../api";
import { PRESENCE_COLOR, presenceText } from "../friends";
import ReactionPicker from "./chat/ReactionPicker";
import {
  discard,
  encodeForward,
  encodeReply,
  stripMarkers,
  loadOlder,
  myReaction,
  notifyTyping,
  openConversation,
  parseForward,
  parseReply,
  react,
  remove,
  retry,
  send,
  sendImage,
  setOpenConversation,
  splitReactions,
  useConversation,
  useTyping,
  type LocalMessage,
  type Reaction,
} from "../chat";
import { useToast } from "../ToastContext";
import { dtf, t, useLang, ts } from "../i18n";
import Icon from "./Icon";

type ImageSource = { path: string; preview?: string } | { data: string; preview: string };
type PendingImage = { src: ImageSource; preview: string | null; name?: string };

type ReplyTarget = { id: string; author: string; text: string; image: boolean; thumb: string | null };

function attachmentThumb(m: { attachments?: ChatAttachment[] } | undefined): string | null {
  const a = m?.attachments?.find((x) => x.preview || (x.url && !x.expired));
  return a ? (a.preview ?? chatFileUrl(a.url)) : null;
}

function QuoteThumb({ src, mine }: { src: string | null | undefined; mine: boolean }) {
  const [broken, setBroken] = useState(false);
  if (src && !broken) {
    return (
      <img
        src={src}
        alt=""
        draggable={false}
        onError={() => setBroken(true)}
        className="chat-checker h-9 w-9 shrink-0 rounded-[8px] object-cover"
      />
    );
  }
  return (
    <span
      className={`grid h-9 w-9 shrink-0 place-items-center rounded-[8px] ${
        mine ? "bg-bg/15 text-bg/70" : "bg-white/[0.06] text-muted"
      }`}
    >
      <Icon cls="fa-regular fa-image text-[14px]" />
    </span>
  );
}

const GROUP_WINDOW_MS = 5 * 60 * 1000;

const time = (ms: number) => dtf({ hour: "2-digit", minute: "2-digit" }).format(ms);

function dayLabel(ms: number): string {
  const d = new Date(ms);
  const today = new Date();
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (sameDay(d, today)) return t("Сегодня");
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (sameDay(d, yesterday)) return t("Вчера");
  return dtf({ day: "numeric", month: "long" }).format(d);
}

function Ticks({ msg }: { msg: LocalMessage }) {
  if (msg.state === "sending") return <Icon cls="fa-regular fa-clock" title={t("Отправляется")} />;
  if (msg.state === "failed")
    return <Icon cls="fa-solid fa-triangle-exclamation" title={t("Не отправлено")} />;
  return (
    <Icon
      cls={`fa-solid ${msg.read ? "fa-check-double" : "fa-check"}`}
      title={msg.read ? t("Прочитано") : t("Доставлено")}
    />
  );
}

function MessagesSkeleton() {

  const rows = [
    { mine: false, w: "58%" },
    { mine: true, w: "42%" },
    { mine: false, w: "72%" },
    { mine: false, w: "35%" },
    { mine: true, w: "64%" },
  ];
  return (
    <div className="space-y-3 py-2">
      {rows.map((r, i) => (
        <div key={i} className={`flex ${r.mine ? "justify-end" : "justify-start"}`}>
          <div
            className="h-10 animate-pulse rounded-[18px] bg-white/[0.04]"
            style={{ width: r.w, animationDelay: `${i * 80}ms` }}
          />
        </div>
      ))}
    </div>
  );
}

function Attachments({ items, mine }: { items: ChatAttachment[]; mine: boolean }) {
  const [view, setView] = useState<number | null>(null);
  const urls = items.map((a) => a.preview ?? chatFileUrl(a.url));
  return (
    <div className="mb-1 flex flex-col gap-1">
      {items.map((a, i) => {
        if (a.expired && !a.preview) {
          return (
            <div
              key={a.id}
              className={`flex items-center gap-2 rounded-[12px] px-3 py-2 text-[12.5px] ${
                mine ? "bg-bg/15 text-bg/75" : "bg-bg/40 text-muted"
              }`}
            >
              <Icon cls="fa-regular fa-image" />
              {t("Картинка удалена по сроку хранения")}
            </div>
          );
        }
        const w = a.width ?? 320;
        const h = a.height ?? 200;
        const maxW = Math.min(280, w);
        return (
          <button
            key={a.id}
            onClick={(e) => {
              e.stopPropagation();
              if (urls[i]) setView(i);
            }}
            className="relative block overflow-hidden rounded-[12px] bg-bg/30"
            style={{ width: maxW, aspectRatio: `${w} / ${h}`, maxHeight: 320 }}
          >
            {urls[i] && (
              <img
                src={urls[i]!}
                alt=""
                loading="lazy"
                decoding="async"
                draggable={false}
                className="h-full w-full object-cover"
              />
            )}
            {a.preview && (
              <span className="absolute inset-0 grid place-items-center bg-black/30">
                <LoadingDots />
              </span>
            )}
          </button>
        );
      })}
      {view !== null && (
        <Lightbox
          images={urls.filter((u): u is string => !!u).map((url) => ({ url }))}
          index={view}
          onClose={() => setView(null)}
        />
      )}
    </div>
  );
}

const Bubble = memo(function Bubble({
  msg,
  mine,
  grouped,
  selected,
  selecting,
  onToggle,
  onMenu,
  onReply,
  reactions,
  onReact,
  reactable,
  replyThumb,
}: {
  msg: LocalMessage;
  mine: boolean;
  grouped: boolean;
  selected: boolean;
  selecting: boolean;
  onToggle: (id: string) => void;
  onMenu: (e: React.MouseEvent, msg: LocalMessage) => void;
  onReply: (msg: LocalMessage) => void;
  reactions?: Reaction[];
  onReact: (msg: LocalMessage, emoji: string) => void;

  reactable: boolean;

  replyThumb?: string | null;
}) {

  useLang();

  const fwd = parseForward(msg.body);
  const rep = parseReply(fwd.text);
  return (
    <div
      onContextMenu={(e) => onMenu(e, msg)}
      onClick={() => selecting && onToggle(msg.id)}
      onDoubleClick={() => !selecting && onReply(msg)}
      className={`group flex items-center ${mine ? "justify-end" : "justify-start"} ${
        grouped ? "mt-0.5" : "mt-2"
      } ${selecting ? "cursor-pointer" : ""} ${selected ? "rounded-[12px] bg-accent/[0.08]" : ""}`}
    >
      {}
      {mine && !selecting && reactable && (
        <ReactionPicker mine current={myReaction(reactions)} onPick={(e) => onReact(msg, e)} />
      )}
      {selecting && (
        <span
          className={`mr-2 mt-2 grid h-[18px] w-[18px] shrink-0 place-items-center self-start rounded-full border transition-colors ${
            selected ? "border-accent bg-accent text-bg" : "border-line-strong"
          }`}
        >
          {selected && <Icon cls="fa-solid fa-check text-[8px]" />}
        </span>
      )}
      <div className={`flex min-w-0 max-w-[72%] flex-col ${mine ? "items-end" : "items-start"}`}>
      <div
        className={`max-w-full rounded-[18px] px-3.5 py-2 transition-[opacity,transform] duration-300 ${
          mine ? "bubble-mine text-bg" : "bg-raised text-text"
        } ${msg.state === "failed" ? "opacity-60" : ""} ${
          grouped ? (mine ? "rounded-tr-[6px]" : "rounded-tl-[6px]") : mine ? "rounded-br-[6px]" : "rounded-bl-[6px]"
        }`}
      >
        {}
        {fwd.forwardedFrom && (
          <div
            className={`mb-1 flex items-center gap-1 border-l-2 pl-1.5 text-[12px] ${
              mine ? "border-bg/40 text-bg/70" : "border-accent/50 text-muted"
            }`}
          >
            <Icon cls="fa-solid fa-share text-[9px]" />
            {t("Переслано от {name}", { name: fwd.forwardedFrom })}
          </div>
        )}
        {}
        {rep.replyTo && (
          <div
            className={`mb-1.5 flex items-center gap-2 rounded-[10px] border-l-2 py-1 pl-2 pr-1 text-[12px] leading-tight ${
              mine ? "border-bg/40 bg-bg/10 text-bg/75" : "border-accent/60 bg-bg/40 text-muted"
            }`}
          >
            <div className="min-w-0 flex-1">
              <div className={`font-semibold ${mine ? "text-bg/90" : "text-accent"}`}>
                {rep.replyTo.author}
              </div>
              <div className="selectable truncate">
                {rep.replyTo.text ? (
                  <Twemoji text={rep.replyTo.text} />
                ) : rep.replyTo.imageOf !== undefined ? (
                  t("Картинка")
                ) : (
                  "…"
                )}
              </div>
            </div>
            {rep.replyTo.imageOf !== undefined && <QuoteThumb src={replyThumb} mine={mine} />}
          </div>
        )}
        {msg.attachments && msg.attachments.length > 0 && (
          <Attachments items={msg.attachments} mine={mine} />
        )}
        {}
        {rep.text && (
          <div className="selectable whitespace-pre-wrap break-words text-[14px] leading-[1.45]">
            <Twemoji text={rep.text} />
          </div>
        )}
        <div
          className={`mt-0.5 flex items-center justify-end gap-1 text-[11.5px] ${
            mine ? "text-bg/60" : "text-muted"
          }`}
        >
          {time(msg.at)}
          {mine && <Ticks msg={msg} />}
        </div>

      </div>

      {}
      {reactions && reactions.length > 0 && (
        <div className={`relative z-10 -mt-1.5 mb-1 flex flex-wrap gap-1 ${mine ? "justify-end pr-2" : "pl-2"}`}>
          {reactions.map((r) => (
            <button
              key={r.emoji}
              onClick={(e) => {
                e.stopPropagation();
                onReact(msg, r.emoji);
              }}
              title={r.mine ? t("Убрать свою реакцию") : t("Поставить такую же")}
              className={`pop flex h-[26px] items-center gap-1 rounded-full px-2 text-[12px] leading-none shadow-[0_4px_12px_rgba(0,0,0,0.35)] transition-[background-color,box-shadow,transform] duration-200 hover:-translate-y-px active:scale-95 ${
                r.mine
                  ? "bg-[color-mix(in_srgb,var(--color-accent)_18%,var(--color-popover))] text-accent-hover ring-1 ring-accent/60"
                  : "bg-popover text-text2 ring-1 ring-line hover:bg-raised"
              }`}
            >
              <span className="grid h-4 w-4 place-items-center [&_img]:h-4 [&_img]:w-4">
                <Twemoji text={r.emoji} />
              </span>
              {r.count > 1 && <span className="font-semibold tabular-nums">{r.count}</span>}
            </button>
          ))}
        </div>
      )}
      </div>

      {!mine && !selecting && reactable && (
        <ReactionPicker current={myReaction(reactions)} onPick={(e) => onReact(msg, e)} />
      )}
    </div>
  );
});

const Composer = memo(function Composer({
  username,
  sending,
  reply,
  onSubmit,
  onImage,
  onTyping,
  onCancelReply,
}: {
  username: string;
  sending: boolean;
  reply: ReplyTarget | null;
  onSubmit: (text: string) => void | Promise<void>;

  onImage: (src: ImageSource, caption: string) => Promise<boolean>;
  onTyping?: () => void;
  onCancelReply: () => void;
}) {

  useLang();
  const [draft, setDraft] = useState("");
  const [picker, setPicker] = useState(false);

  const [pending, setPending] = useState<PendingImage | null>(null);
  const toast = useToast();
  const area = useRef<HTMLTextAreaElement | null>(null);
  const emojiBtn = useRef<HTMLButtonElement | null>(null);
  const over = draft.length > MAX_MESSAGE;

  const closePicker = useCallback(() => {
    setPicker(false);
    requestAnimationFrame(() => area.current?.focus());
  }, []);

  const confirmImage = async (caption: string) => {
    const p = pending;
    if (!p?.preview) return;
    setPending(null);
    requestAnimationFrame(() => area.current?.focus());
    const src: ImageSource = "path" in p.src ? { path: p.src.path, preview: p.preview } : p.src;
    if (await onImage(src, caption)) setDraft("");
  };

  const cancelImage = () => {
    setPending(null);
    requestAnimationFrame(() => area.current?.focus());
  };

  const attach = async () => {
    const path = await pickFile(t("Изображения"), ["png", "jpg", "jpeg", "gif", "webp"]);
    if (!path) return;
    setPending({ src: { path }, preview: null, name: path.split(/[\\/]/).pop() });

    try {
      const preview = await readImageDataUrl(path);
      setPending((cur) => (cur && "path" in cur.src && cur.src.path === path ? { ...cur, preview } : cur));
    } catch {
      setPending(null);
      toast(t("Не удалось открыть картинку"), "error");
    }
  };

  const paste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const file = Array.from(e.clipboardData.items)
      .find((it) => it.kind === "file" && it.type.startsWith("image/"))
      ?.getAsFile();
    if (!file) return;
    e.preventDefault();
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      setPending({
        src: { data: url.slice(url.indexOf(",") + 1), preview: url },
        preview: url,
        name: file.name && file.name !== "image.png" ? file.name : undefined,
      });
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    if (reply) area.current?.focus();
  }, [reply]);

  const insert = (emoji: string) => {
    const el = area.current;
    const at = el ? el.selectionStart : draft.length;
    setDraft((d) => d.slice(0, at) + emoji + d.slice(el ? el.selectionEnd : d.length));

    requestAnimationFrame(() => {
      el?.focus();
      const pos = at + emoji.length;
      el?.setSelectionRange(pos, pos);
    });
  };

  const submit = () => {
    const text = draft.trim();
    if (!text || sending) return;
    setDraft("");
    void onSubmit(text);
  };

  return (
    <div className="px-[max(24px,calc((100%-780px)/2))] pb-5 pt-2">
      {}
      <div className="rounded-[20px] bg-raised shadow-[0_10px_30px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.05)] ring-1 ring-transparent transition-shadow duration-300 focus-within:ring-accent/40">
      {reply && (
        <div className="msg-in mx-2 mt-2 flex items-center gap-2 rounded-[12px] border-l-2 border-accent bg-white/[0.04] px-2.5 py-1.5">
          <Icon cls="fa-solid fa-reply text-[11.5px] text-accent" />
          {reply.image && <QuoteThumb src={reply.thumb} mine={false} />}
          <div className="min-w-0 flex-1 leading-tight">
            <div className="text-[12px] font-medium text-accent">{reply.author}</div>
            <div className="truncate text-[12px] text-muted">
              {reply.text || (reply.image ? t("Картинка") : "…")}
            </div>
          </div>
          <button
            onClick={onCancelReply}
            title={t("Отменить ответ")}
            className="shrink-0 text-muted transition-colors hover:text-text"
          >
            <Icon cls="fa-solid fa-xmark text-[12.5px]" />
          </button>
        </div>
      )}
      <div className="relative flex items-end gap-1 p-1.5">
        <textarea
          ref={area}
          value={draft}
          rows={1}
          onChange={(e) => {
            setDraft(e.target.value);

            if (e.target.value.trim()) onTyping?.();
          }}
          onPaste={paste}
          onKeyDown={(e) => {
            if (e.key === "Escape" && reply) {
              e.preventDefault();
              onCancelReply();
              return;
            }
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={t("Сообщение для {name}", { name: username })}
          className="max-h-32 min-h-[40px] flex-1 resize-none bg-transparent px-3 py-2.5 text-[14px] text-text outline-none placeholder:text-muted"
        />
        <button
          onClick={attach}
          title={t("Отправить картинку")}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-white/[0.05] hover:text-text"
        >
          <Icon cls="fa-regular fa-image text-[18px]" />
        </button>
        <button
          ref={emojiBtn}
          onClick={() => setPicker((v) => !v)}
          title={t("Эмодзи")}
          aria-expanded={picker}
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-full transition-colors ${
            picker ? "bg-white/[0.06] text-accent" : "text-muted hover:bg-white/[0.05] hover:text-text"
          }`}
        >
          <Icon cls="fa-regular fa-face-smile text-[18px]" />
        </button>
        <FloatingPanel anchor={emojiBtn} open={picker} onClose={closePicker} side="top" align="end">
          <EmojiPicker onPick={insert} />
        </FloatingPanel>
        <button
          onClick={submit}
          disabled={!draft.trim() || over}
          title={t("Отправить")}
          className="btn-accent grid h-10 w-10 shrink-0 place-items-center rounded-full disabled:opacity-35"
        >
          <Icon cls="fa-solid fa-paper-plane text-[16px]" />
        </button>
      </div>
      </div>
      {over && (
        <div className="mt-2 flex items-center gap-2 px-2 text-[12px] text-danger">
          <span className="dot bg-danger" />
          {t("Слишком длинное: {n} из {max}", { n: draft.length, max: MAX_MESSAGE })}
        </div>
      )}
      {pending && (
        <ImageSendModal
          preview={pending.preview}
          name={pending.name}
          caption={draft.trim()}
          replyTo={reply?.author}
          onSend={(c) => void confirmImage(c)}
          onClose={cancelImage}
        />
      )}
    </div>
  );
});

export default function ChatPanel({ friend }: { friend: Friend }) {
  const { t } = useLang();
  const conv = useConversation(friend.id);
  const typing = useTyping(friend.id);
  const [sending, setSending] = useState(false);
  const [reply, setReply] = useState<ReplyTarget | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[]; msg: LocalMessage } | null>(null);
  const [forward, setForward] = useState<string[] | null>(null);
  const [profile, setProfile] = useState(false);
  const toast = useToast();

  const scroller = useRef<HTMLDivElement | null>(null);
  const bottom = useRef<HTMLDivElement | null>(null);

  const wasAtBottom = useRef(true);

  const mountAt = useRef(Date.now());

  const keepHeight = useRef<number | null>(null);

  const [myName, setMyName] = useState(t("Вы"));
  useEffect(() => {
    void getAccounts()
      .then((acc) => {
        const me = acc.accounts.find((a) => a.id === acc.active);
        if (me) setMyName(me.aciron_name || me.username);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setReply(null);
    setOpenConversation(friend.id);
    void openConversation(friend.id);

    setSelected(new Set());
    return () => setOpenConversation(null);
  }, [friend.id]);

  const prevHeight = useRef(0);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (keepHeight.current !== null) {
      el.scrollTop = el.scrollHeight - keepHeight.current;
      keepHeight.current = null;
      prevHeight.current = el.scrollHeight;
      return;
    }
    if (!wasAtBottom.current) {
      prevHeight.current = el.scrollHeight;
      return;
    }

    const grew = el.scrollHeight - prevHeight.current;
    prevHeight.current = el.scrollHeight;

    const smooth = grew > 0 && grew < 320;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, [conv.messages]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    wasAtBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    if (el.scrollTop < 40 && conv.more && !conv.loading) {
      keepHeight.current = el.scrollHeight;
      void loadOlder(friend.id);
    }
  };

  const submit = useCallback(
    async (text: string) => {
      if (!text || sending) return;
      setSending(true);
      wasAtBottom.current = true;

      const clean = stripMarkers(text);
      const body = reply
        ? encodeReply(reply.author, reply.text, clean, reply.image ? reply.id : undefined)
        : clean;
      setReply(null);
      try {
        await send(friend.id, body);
      } catch {
        toast(t("Сообщение не отправлено"), "error");
      } finally {
        setSending(false);
      }
    },
    [friend.id, reply, sending, toast]
  );

  const submitImage = useCallback(
    async (src: ImageSource, caption: string) => {
      wasAtBottom.current = true;

      const clean = stripMarkers(caption);
      const body = reply
        ? encodeReply(reply.author, reply.text, clean, reply.image ? reply.id : undefined)
        : clean;
      setReply(null);
      try {
        await sendImage(friend.id, src, body);
        return true;
      } catch (e) {
        toast(ts(String(e)) || t("Картинка не отправлена"), "error");
        return false;
      }
    },
    [friend.id, reply, toast]
  );

  const startReply = useCallback(
    (msg: LocalMessage) => {

      if (friend.system) return;
      const shown = parseForward(msg.body);
      const author = msg.from === friend.id ? friend.username : myName;
      const image = !!msg.attachments?.length;
      setReply({
        id: msg.id,
        author,
        text: parseReply(shown.text).text.replace(/\s+/g, " ").trim(),
        image,
        thumb: image ? attachmentThumb(msg) : null,
      });
    },
    [friend.id, friend.username, friend.system, myName]
  );

  const copy = useCallback(
    (ids: string[]) => {
      const text = conv.messages
        .filter((m) => ids.includes(m.id))
        .map((m) => m.body)
        .join("\n");
      void navigator.clipboard.writeText(text);
      toast(ids.length > 1 ? t("Сообщения скопированы") : t("Скопировано"), "success");
    },
    [conv.messages, toast]
  );

  const del = useCallback(
    async (ids: string[]) => {
      try {
        const n = await remove(friend.id, ids);
        setSelected(new Set());
        if (n === 0) toast(t("Удалять можно только свои сообщения"), "error");
      } catch (e) {
        toast(ts(String(e)), "error");
      }
    },
    [friend.id, toast]
  );

  const openMenu = useCallback((e: React.MouseEvent, msg: LocalMessage) => {
    e.preventDefault();

    const ids = selected.has(msg.id) ? [...selected] : [msg.id];
    const mine = msg.from !== friend.id;
    const items: MenuItem[] = [

      ...(friend.system
        ? []
        : [{ icon: "fa-reply", label: t("Ответить"), onClick: () => startReply(msg) }]),
      { icon: "fa-copy", label: ids.length > 1 ? t("Копировать выбранные") : t("Копировать"), onClick: () => copy(ids) },
      { icon: "fa-share", label: t("Переслать"), onClick: () => setForward(ids) },
      {
        icon: "fa-check-double",
        label: selected.has(msg.id) ? t("Снять выделение") : t("Выделить"),
        onClick: () =>
          setSelected((s) => {
            const n = new Set(s);
            if (n.has(msg.id)) n.delete(msg.id);
            else n.add(msg.id);
            return n;
          }),
      },
    ];
    if (msg.state === "failed") {
      items.push({
        icon: "fa-rotate-right",
        label: t("Отправить снова"),
        onClick: () => void retry(friend.id, msg.id).catch(() => toast(t("Снова не вышло"), "error")),
      });
      items.push({ icon: "fa-xmark", label: t("Убрать"), danger: true, onClick: () => discard(friend.id, msg.id) });
    } else if (mine) {
      items.push({
        icon: "fa-trash",
        label: ids.length > 1 ? t("Удалить ({n})", { n: ids.length }) : t("Удалить"),
        danger: true,
        onClick: () => void del(ids),
      });
    }
    setMenu({ x: e.clientX, y: e.clientY, items, msg });
  }, [selected, friend.id, friend.system, copy, del, startReply, toast]);

  const closeMenu = useCallback(() => setMenu(null), []);

  const onToggle = useCallback((id: string) => {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }, []);

  const selecting = selected.size > 0;

  const { visible, reactions } = useMemo(
    () => splitReactions(conv.messages, friend.id),
    [conv.messages, friend.id]
  );

  const onReact = useCallback(
    (msg: LocalMessage, emoji: string) => {

      if (friend.system) return;
      void react(friend.id, msg.id, emoji, myReaction(reactions[msg.id])).catch((e) =>
        toast(ts(String(e)), "error")
      );
    },
    [friend.id, friend.system, reactions, toast]
  );

  const rows = useMemo(() => {
    const byId = new Map(conv.messages.map((m) => [m.id, m]));
    return visible.map((m, i) => {
        const prev = visible[i - 1];
        const mine = m.from !== friend.id;

        const prevMine = prev ? prev.from !== friend.id : false;
        const newDay = !prev || dayLabel(prev.at) !== dayLabel(m.at);
        const grouped =
          !newDay && !!prev && prevMine === mine && m.at - prev.at < GROUP_WINDOW_MS;

        const quoted = parseReply(parseForward(m.body).text).replyTo?.imageOf;
        const replyThumb = quoted ? attachmentThumb(byId.get(quoted)) : undefined;
        return { m, mine, newDay, grouped, replyThumb };
    });
  }, [visible, conv.messages, friend.id]);

  return (
    <section className="flex min-w-0 flex-1 flex-col">
      {}
      <div className="flex items-center gap-3 border-b border-line px-6 py-3.5">
        {}
        {friend.system ? (
          <div className="flex min-w-0 items-center gap-3">
            <ContactAvatar c={friend} size={36} className="shrink-0 rounded-full" />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-[15px] font-semibold text-text">{friend.username}</span>
                <VerifiedMark className="text-[12px]" />
              </div>
              <div className="truncate text-[12.5px] text-muted">
                {t("Официальные уведомления")}
              </div>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setProfile(true)}
            title={t("Открыть профиль")}
            className="group flex min-w-0 items-center gap-3 text-left"
          >
            <span
              className="shrink-0 rounded-full transition-shadow duration-500"
              style={{ boxShadow: `0 0 0 2px var(--color-bg), 0 0 0 3.5px ${PRESENCE_COLOR[friend.presence.state]}` }}
            >
              <ContactAvatar c={friend} size={38} className="rounded-full" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-[15px] font-semibold text-text transition-colors group-hover:text-accent">
                  {friend.username}
                </span>
                {friend.verified && <VerifiedMark className="text-[12px]" />}
          {friend.plus && <PlusMark />}
              </div>
              <div className="truncate text-[12.5px]">
                {typing ? (
                  <TypingDots />
                ) : (
                  <span className="text-muted">{presenceText(friend.presence)}</span>
                )}
              </div>
            </div>
          </button>
        )}

        {!selecting && !friend.system && (
          <div className="ml-auto flex items-center gap-1.5">
            <button onClick={() => setProfile(true)} className="btn btn-sm btn-ghost">
              <Icon cls="fa-solid fa-user text-[15px]" />
              {t("Профиль")}
            </button>
            <button
              onClick={() => openUrl(acironProfileUrl(friend.username))}
              title={t("Профиль на сайте")}
              className="btn btn-sm btn-ghost btn-icon"
            >
              <Icon cls="fa-solid fa-up-right-from-square text-[15px]" />
            </button>
          </div>
        )}

        {selecting && (
          <div className="page-in ml-auto flex items-center gap-1.5">
            <span className="mr-1 text-[12px] text-muted">
              {t("Выбрано: {n}", { n: selected.size })}
            </span>
            <button
              onClick={() => copy([...selected])}
              title={t("Копировать")}
              className="btn btn-sm btn-ghost btn-icon"
            >
              <Icon cls="fa-solid fa-copy text-[12.5px]" />
            </button>
            <button
              onClick={() => setForward([...selected])}
              title={t("Переслать")}
              className="btn btn-sm btn-ghost btn-icon"
            >
              <Icon cls="fa-solid fa-share text-[12.5px]" />
            </button>
            <button
              onClick={() => void del([...selected])}
              title={t("Удалить свои из выбранных")}
              className="btn btn-sm btn-ghost btn-icon hover:!text-danger"
            >
              <Icon cls="fa-solid fa-trash text-[12.5px]" />
            </button>
            <button
              onClick={() => setSelected(new Set())}
              title={t("Снять выделение")}
              className="btn btn-sm btn-ghost btn-icon"
            >
              <Icon cls="fa-solid fa-xmark text-[12.5px]" />
            </button>
          </div>
        )}
      </div>

      {}
      {}
      <div
        ref={scroller}
        onScroll={onScroll}
        style={{ overflowAnchor: "none" }}
        className="min-h-0 flex-1 overflow-y-auto px-[max(24px,calc((100%-780px)/2))] py-4"
      >
        {conv.loading && conv.messages.length === 0 && <MessagesSkeleton />}
        {conv.error && (
          <div className="flex items-center gap-2 text-[13px] text-danger">
            <span className="dot bg-danger" />
            {conv.error}
          </div>
        )}
        {!conv.loading && conv.messages.length === 0 && !conv.error && (
          <div className="grid h-full place-items-center px-6 text-center">
            <div>
              <span className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-white/[0.04] text-muted">
                <Icon cls="fa-regular fa-comments text-[26px]" />
              </span>
              <div className="text-[14px] text-muted">
                {friend.system
                  ? t("Этому аккаунту нельзя писать")
                  : t("Здесь пока пусто. Напишите {who} первым.", { who: friend.username })}
              </div>
            </div>
          </div>
        )}

        {conv.more && conv.messages.length > 0 && (
          <div className="pb-2 text-center text-[12px] text-muted">
            {conv.loading ? (
              <>
                {t("Загружаем")}
                <LoadingDots className="ml-1" />
              </>
            ) : (
              t("Прокрутите вверх, чтобы показать раннее")
            )}
          </div>
        )}

        {rows.map(({ m, mine, newDay, grouped, replyThumb }) => (
          <div
            key={m.localId ?? m.id}
            className={m.at >= mountAt.current ? "msg-in" : undefined}
          >
            {newDay && (
              <div className="my-4 flex items-center gap-3 text-[12px] text-muted">
                <span className="h-px flex-1 bg-line" />
                <span className="rounded-full bg-white/[0.04] px-3 py-1">{dayLabel(m.at)}</span>
                <span className="h-px flex-1 bg-line" />
              </div>
            )}
            <Bubble
              msg={m}
              mine={mine}
              grouped={grouped}
              selected={selected.has(m.id)}
              selecting={selecting}
              onToggle={onToggle}
              onMenu={openMenu}
              onReply={startReply}
              reactions={reactions[m.id]}
              onReact={onReact}
              reactable={!friend.system}
              replyThumb={replyThumb}
            />
          </div>
        ))}
        <div ref={bottom} />
      </div>

      {}
      {}
      {friend.system ? (
        <div className="flex items-center justify-center gap-2 border-t border-line px-6 py-4 text-[13px] text-muted">
          <Icon cls="fa-solid fa-lock text-[12px]" />
          {t("Этому аккаунту нельзя писать")}
        </div>
      ) : (
        <Composer
          key={friend.id}
          username={friend.username}
          sending={sending}
          reply={reply}
          onSubmit={submit}
          onImage={submitImage}
          onTyping={() => notifyTyping(friend.id)}
          onCancelReply={() => setReply(null)}
        />
      )}

      {menu && (
        <MessageMenu
          x={menu.x}
          y={menu.y}
          items={menu.items}
          reaction={
            friend.system || menu.msg.state === "failed" || menu.msg.id.startsWith("tmp-")
              ? undefined
              : { current: myReaction(reactions[menu.msg.id]), onPick: (e) => onReact(menu.msg, e) }
          }
          onClose={closeMenu}
        />
      )}
      {forward && (
        <ForwardModal
          count={forward.length}
          onClose={() => setForward(null)}
          onPick={async (to) => {
            const msgs = conv.messages.filter((m) => forward.includes(m.id));
            setForward(null);
            setSelected(new Set());

            try {
              for (const m of msgs) {

                const author = m.from === friend.id ? friend.username : myName;
                await send(to, encodeForward(author, m.body));
              }
              toast(t("Переслано: {n}", { n: msgs.length }), "success");
            } catch (e) {
              toast(ts(String(e)), "error");
            }
          }}
        />
      )}
      {profile && (
        <ProfileModal
          userId={friend.id}
          username={friend.username}
          onClose={() => setProfile(false)}
        />
      )}
    </section>
  );
}
