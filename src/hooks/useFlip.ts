import { useLayoutEffect, useRef, type RefObject } from "react";
import { CARD_MOVE_MS } from "../anim";

export function useFlip(ref: RefObject<HTMLElement | null>, key: string) {
  const prev = useRef<Map<string, { x: number; y: number }>>(new Map());

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const items = Array.from(root.querySelectorAll<HTMLElement>("[data-flip-id]"));

    for (const el of items) {
      const id = el.dataset.flipId!;
      const before = prev.current.get(id);
      const x = el.offsetLeft;
      const y = el.offsetTop;
      if (before && (before.x !== x || before.y !== y)) {
        el.animate(
          [
            { transform: `translate(${before.x - x}px, ${before.y - y}px)` },
            { transform: "translate(0, 0)" },
          ],
          { duration: CARD_MOVE_MS, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }
        );
      }
    }

    prev.current = new Map(
      items.map((el) => [el.dataset.flipId!, { x: el.offsetLeft, y: el.offsetTop }])
    );
  }, [ref, key]);
}
