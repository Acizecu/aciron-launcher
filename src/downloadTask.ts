import { useSyncExternalStore } from "react";

export type DlTask = {
  id: string;
  name: string;

  current: number;
  total: number;
  message: string;

  done?: boolean;

  // Результат завершения: false = ошибка. Нужен, чтобы орб/строка показали
  // «Ошибку» с красной иконкой, а не молча исчезли (раньше endTask(false)
  // просто удалял задачу — выглядело как «готово»).
  ok?: boolean;

  blocking?: boolean;

  cancelled?: boolean;
};

let tasks: DlTask[] = [];
const listeners = new Set<() => void>();

function emit() {
  tasks = [...tasks];
  listeners.forEach((l) => l());
}

export function startTask(id: string, name: string, blocking = false) {
  const t = tasks.find((x) => x.id === id);
  if (t) {
    t.name = name;
    t.done = false;
  } else {
    tasks.push({ id, name, current: 0, total: 0, message: "Подготовка…", blocking });
  }
  emit();
}

export function updateTask(id: string, patch: Partial<Omit<DlTask, "id">>) {
  const t = tasks.find((x) => x.id === id);
  if (!t) return;
  Object.assign(t, patch);
  emit();
}

export function endTask(id: string, ok = true) {
  const t = tasks.find((x) => x.id === id);
  if (!t) return;

  // Идемпотентно: если задача уже в терминальном состоянии (отменена/завершена),
  // повторный вызов игнорируем. Иначе двойной сигнал (Rust "error" + JS-catch
  // aciron-task-end) переустанавливал бы таймер удаления.
  if (t.cancelled || t.done) return;

  t.done = true;
  t.ok = ok;
  t.message = ok ? "Готово" : "Ошибка";
  emit();
  // Ошибку держим на экране дольше, чтобы её успели заметить.
  setTimeout(
    () => {
      tasks = tasks.filter((x) => x.id !== id);
      emit();
    },
    ok ? 1400 : 2600
  );
}

export function cancelTask(id: string) {
  const t = tasks.find((x) => x.id === id);
  if (!t || t.done) return;

  void import("@tauri-apps/api/core")
    .then(({ invoke }) => invoke("cancel_download", { id }))
    .catch(() => {});
  t.cancelled = true;
  t.done = true;
  t.message = "Отменено";
  cancelledIds.add(id);
  setTimeout(() => cancelledIds.delete(id), 60_000);
  emit();
  setTimeout(() => {
    tasks = tasks.filter((x) => x.id !== id);
    emit();
  }, 1200);
}

export function wasCancelled(id: string): boolean {
  const t = tasks.find((x) => x.id === id);
  return t ? !!t.cancelled : cancelledIds.has(id);
}

const cancelledIds = new Set<string>();

export function useTasks(): DlTask[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => tasks,
    () => tasks
  );
}

export function useDownloadActive(): boolean {
  return useTasks().some((t) => !t.done && t.blocking);
}

const LEGACY_ID = "legacy";

if (typeof window !== "undefined") {
  window.addEventListener("aciron-task-start", (e) => {
    startTask(LEGACY_ID, (e as CustomEvent).detail?.name ?? "Загрузка", true);
  });
  window.addEventListener("aciron-task-end", () => {

    endTask(LEGACY_ID, false);
  });
}

export function legacyProgress(
  op: string,
  stage: string,
  message: string,
  current: number,
  total: number
) {
  // Орб установки НЕ реагирует на события ЗАПУСКА игры (op="launch"): иначе
  // "done"/«Игра запущена» от запуска закрывал бы идущую установку прежде времени,
  // а ошибка запуска молча гасила бы орб. Орб ведут только установка и перенос
  // данных (op="install"/"migrate"). Пустой op трактуем как launch (совместимость).
  if (op === "launch" || op === "") return;
  if (!tasks.some((t) => t.id === LEGACY_ID)) return;
  if (stage === "done") endTask(LEGACY_ID, true);
  else if (stage === "error") endTask(LEGACY_ID, false);
  // ЛЮБОЙ другой этап (modpack/libraries/java/loader/forge/assets/natives/…) обновляет
  // задачу — чтобы орб показывал ТЕКУЩИЙ этап, а не застывал на прошлом (раньше
  // обрабатывался только "modpack", поэтому после докачки файлов орб «висел» полным
  // кружком всю установку Java/Forge, пока не придёт "done"). Поэтапность.
  else updateTask(LEGACY_ID, { current, total, message });
}
