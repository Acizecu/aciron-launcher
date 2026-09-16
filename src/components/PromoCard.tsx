import { useState } from "react";
import { promoInstall, type Promo } from "../api";
import { cardInDelay } from "../anim";
import { useToast } from "../ToastContext";
import { t, ts } from "../i18n";

export default function PromoCard({ promo, onInstalled }: { promo: Promo; onInstalled: () => void }) {
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const install = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const build = await promoInstall();
      toast(t("Сборка «{name}» готова", { name: build.name }), "success");
      onInstalled();
    } catch (e) {
      toast(ts(String(e)), "error");
    } finally {
      setBusy(false);
    }
  };

  const meta = [promo.mcVersion, promo.loader].filter(Boolean).join(" · ");

  return (
    <div
      style={cardInDelay(0)}
      className="card-in group relative h-[150px] w-[285px] shrink-0 overflow-hidden rounded-[16px] border-1 border-[#232427]/65 bg-card"
    >
      {promo.imageUrl ? (
        <img src={promo.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-accent/30 via-card to-bg">
          <i className="fa-solid fa-server absolute right-4 top-4 text-4xl text-accent/25" />
        </div>
      )}
      <div className="absolute inset-0 bg-[var(--veil)]" />

      {}
      <span className="absolute left-3 top-3 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/80 backdrop-blur-sm">
        {t("Реклама")}
      </span>

      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4">
        <div className="min-w-0">
          <div className="truncate text-sm font-bold text-text">{promo.title}</div>
          {promo.subtitle && (
            <div className="line-clamp-2 text-[11px] leading-tight text-muted">{promo.subtitle}</div>
          )}
          {meta && <div className="mt-0.5 truncate text-[11px] text-muted">{meta}</div>}
        </div>

        <button
          onClick={() => void install()}
          disabled={busy}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-bold text-bg transition-colors hover:bg-accent-hover disabled:opacity-70"
        >
          <i className={`fa-solid ${busy ? "fa-spinner fa-spin" : "fa-download"} text-[11px]`} />
          {busy ? t("Ставим…") : t("Установить")}
        </button>
      </div>
    </div>
  );
}
