
export const CARD_FALL_MS = 340;

export const ROW_OUT_MS = 260;

export const CARD_MOVE_MS = 280;

export function cardInDelay(index: number): { animationDelay: string } {
  return { animationDelay: `${Math.min(index, 14) * 55}ms` };
}
