import { useMemo, useState } from "react";
import Modal from "../Modal";
import Head from "../Head";
import { isVerified, VerifiedMark } from "../ContactAvatar";
import { friendSkinUrl } from "../../api";
import { sortFriends, useFriends } from "../../friends";
import { t } from "../../i18n";

export default function ForwardModal({
  count,
  onPick,
  onClose,
}: {
  count: number;
  onPick: (userId: string) => void;
  onClose: () => void;
}) {
  const { data } = useFriends();
  const [query, setQuery] = useState("");

  const sorted = useMemo(() => sortFriends(data?.friends ?? []), [data?.friends]);
  const q = query.trim().toLowerCase();
  const friends = useMemo(
    () => sorted.filter((f) => f.username.toLowerCase().includes(q)),
    [sorted, q]
  );
  const total = sorted.length;

  return (
    <Modal
      title={t("Переслать")}
      subtitle={
        count === 1 ? t("{n} сообщение", { n: count }) : t("{n} сообщений", { n: count })
      }
      icon="fa-share"
      onClose={onClose}
    >
      <div className="p-4">
        <input
          value={query}
          autoFocus
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("Кому переслать")}
          className="field mb-3 w-full px-3.5 py-2.5 text-sm"
        />
        <div className="max-h-[320px] space-y-1 overflow-y-auto">
          {friends.length === 0 ? (
            <div className="px-3 py-6 text-center text-[12.5px] text-muted">
              {total ? t("Никого не нашлось") : t("Друзей пока нет")}
            </div>
          ) : (
            friends.map((f) => (
              <button
                key={f.id}
                onClick={() => onPick(f.id)}
                className="flex w-full items-center gap-3 rounded-[14px] p-2 text-left transition-colors hover:bg-white/[0.05]"
              >
                <Head skin={friendSkinUrl(f)} name={f.username} size={32} className="shrink-0 rounded-full" />
                <span className="truncate text-sm font-medium text-text">{f.username}</span>
                {isVerified(f) && <VerifiedMark className="text-[11.5px]" />}
              </button>
            ))
          )}
        </div>
      </div>
    </Modal>
  );
}
