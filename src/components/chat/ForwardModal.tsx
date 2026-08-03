import { useMemo, useState } from "react";
import Modal from "../Modal";
import Head from "../Head";
import { friendSkinUrl } from "../../api";
import { sortFriends, useFriends } from "../../friends";

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

  // Сортировку (O(n log n) с localeCompare) считаем один раз на изменение списка,
  // а не на каждое нажатие клавиши; toLowerCase(query) вычисляем один раз, а не на
  // каждом элементе. Результат фильтрации/порядок идентичны прежним.
  const sorted = useMemo(() => sortFriends(data?.friends ?? []), [data?.friends]);
  const q = query.trim().toLowerCase();
  const friends = useMemo(
    () => sorted.filter((f) => f.username.toLowerCase().includes(q)),
    [sorted, q]
  );

  return (
    <Modal
      title="Переслать"
      subtitle={`${count} ${count === 1 ? "сообщение" : "сообщений"}`}
      icon="fa-share"
      onClose={onClose}
    >
      <div className="p-4">
        <input
          value={query}
          autoFocus
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Кому переслать"
          className="mb-3 w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-text placeholder:text-muted focus:border-accent focus:outline-none"
        />
        <div className="max-h-[320px] space-y-1 overflow-y-auto">
          {friends.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-muted">
              {data?.friends.length ? "Никого не нашлось" : "Друзей пока нет"}
            </div>
          ) : (
            friends.map((f) => (
              <button
                key={f.id}
                onClick={() => onPick(f.id)}
                className="flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors hover:bg-card"
              >
                <Head skin={friendSkinUrl(f)} name={f.username} size={32} className="shrink-0 rounded-lg" />
                <span className="truncate text-sm font-medium text-text">{f.username}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </Modal>
  );
}
