
import { memo } from "react";
import SkinThumb from "./SkinThumb";
import TexturePreview from "./TexturePreview";
import { cardInDelay } from "../../anim";
import {
  ACIRON_ID_API,
  textureUrl,
  type CatalogCape,
  type CatalogSkin,
  type Outfit,
  type SkinModelId,
  type WardrobeData,
} from "../../api";
import { ORIGIN_LABEL, type CapeEntry } from "./types";
import { t, useLang } from "../../i18n";

export const cardCls = (active: boolean) =>
  `group relative flex flex-col items-center gap-2 rounded-2xl border p-3 transition-colors ${
    active ? "border-accent bg-accent/10" : "border-border bg-card hover:border-accent/50"
  }`;

export function TileButton({
  icon,
  label,
  index,
  active,
  disabled,
  title,
  onClick,
}: {
  icon: string;
  label: string;
  index: number;
  active?: boolean;
  disabled?: boolean;
  title?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{ animationDelay: `${cardInDelay(index)}ms` }}
      className={`card-in flex min-h-[196px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed p-3 text-center transition-colors ${
        disabled
          ? "cursor-not-allowed border-border bg-card/30 text-muted/50"
          : active
          ? "border-accent bg-accent/10 text-accent"
          : "border-border bg-card/50 text-muted hover:border-accent/60 hover:text-accent"
      }`}
    >
      <i className={`${icon} text-xl`} />
      <span className="text-xs">{label}</span>
    </button>
  );
}

export function Loading() {
  return (
    <div className="grid min-h-[196px] place-items-center text-muted">
      <i className="fa-solid fa-spinner fa-spin" />
    </div>
  );
}

export function Notice({ text }: { text: string }) {
  return (
    <div className="col-span-full flex items-start gap-2.5 rounded-xl bg-card px-4 py-3 text-xs leading-relaxed text-muted">
      <i className="fa-solid fa-circle-info mt-0.5 shrink-0 text-accent/80" />
      <span>{text}</span>
    </div>
  );
}

export function SectionHeader({ label }: { label: string }) {
  return (
    <div className="col-span-full mt-2 text-[11px] font-semibold uppercase tracking-wide text-muted first:mt-0">
      {label}
    </div>
  );
}

export function ActiveBadge({ text = t("Используется") }: { text?: string }) {
  return (
    <span className="absolute left-2 top-2 rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold text-bg">
      {text}
    </span>
  );
}

export function CardTools({ onEdit, onDelete }: { onEdit?: () => void; onDelete?: () => void }) {
  if (!onEdit && !onDelete) return null;
  return (
    <div className="absolute right-1.5 top-1.5 flex opacity-0 transition-opacity group-hover:opacity-100">
      {onEdit && (
        <button
          onClick={onEdit}
          title={t("Переименовать")}
          className="grid h-7 w-7 place-items-center rounded-lg text-muted transition-colors hover:text-accent"
        >
          <i className="fa-solid fa-pen text-xs" />
        </button>
      )}
      {onDelete && (
        <button
          onClick={onDelete}
          title={t("Удалить")}
          className="grid h-7 w-7 place-items-center rounded-lg text-muted transition-colors hover:text-[#ef4444]"
        >
          <i className="fa-solid fa-trash-can text-xs" />
        </button>
      )}
    </div>
  );
}

function SkinCardImpl({
  name,
  url,
  model,
  index,
  active,
  onApply,
  onEdit,
  onDelete,
}: {
  name: string;
  url: string;
  model: SkinModelId;
  index: number;
  active: boolean;
  onApply: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {

  useLang();

  return (
    <div style={{ animationDelay: `${cardInDelay(index)}ms` }} className={`card-in ${cardCls(active)}`}>
      <button onClick={onApply} className="flex w-full flex-col items-center gap-2">
        <div className="grid h-[140px] w-full place-items-center">
          <SkinThumb url={url} model={model} className="max-h-[140px] w-full object-contain" />
        </div>
        <span className="line-clamp-1 max-w-full text-xs font-semibold text-text">{name}</span>
      </button>
      {active && <ActiveBadge />}
      <CardTools onEdit={onEdit} onDelete={onDelete} />
    </div>
  );
}
export const SkinCard = memo(SkinCardImpl);

function CapeCardImpl({
  entry,
  active,
  index,
  onApply,
}: {
  entry: CapeEntry;
  active: boolean;
  index: number;
  onApply: () => void;
}) {

  useLang();

  return (
    <div style={{ animationDelay: `${cardInDelay(index)}ms` }} className={`card-in ${cardCls(active)}`}>
      <button onClick={onApply} className="flex w-full flex-col items-center gap-2">
        <div className="grid h-[140px] place-items-center">
          <div className="overflow-hidden rounded-lg">
            <TexturePreview url={entry.url} kind="cape" scale={8} />
          </div>
        </div>
        <div className="w-full text-center">
          <div className="line-clamp-1 text-xs font-semibold text-text">{entry.name}</div>
          <div className="mt-0.5 line-clamp-1 text-[11px] text-muted">
            {ORIGIN_LABEL[entry.origin]}
          </div>
        </div>
      </button>
      {active && <ActiveBadge text={t("в игре")} />}
      <CardTools onDelete={entry.remove} />
    </div>
  );
}
export const CapeCard = memo(CapeCardImpl);

function OutfitCardImpl({
  outfit,
  data,
  stock,
  catalog,
  index,
  busy,
  onApply,
  onDelete,
}: {
  outfit: Outfit;
  data: WardrobeData;
  stock: CatalogSkin[] | null;
  catalog: CatalogCape[] | null;
  index: number;
  busy: boolean;
  onApply: () => void;
  onDelete: () => void;
}) {

  useLang();

  const ownSkin = data.skins.find((s) => s.id === outfit.skinId);
  const catSkin = outfit.skinCatalogId ? stock?.find((s) => s.id === outfit.skinCatalogId) : undefined;
  const skinUrl = ownSkin ? textureUrl(ownSkin) : catSkin ? `${ACIRON_ID_API}${catSkin.url}` : null;

  const ownCape = data.capes.find((c) => c.id === outfit.capeId);
  const catCape = outfit.capeCatalogId ? catalog?.find((c) => c.id === outfit.capeCatalogId) : undefined;
  const capeUrl = ownCape ? textureUrl(ownCape) : catCape ? `${ACIRON_ID_API}${catCape.url}` : null;
  const capeName = ownCape?.name ?? catCape?.name ?? null;

  const modelLabel = outfit.model === "slim" ? t("Тонкие руки") : t("Классика");

  return (
    <div style={{ animationDelay: `${cardInDelay(index)}ms` }} className={`card-in ${cardCls(false)}`}>
      <button onClick={onApply} disabled={busy} className="flex w-full flex-col items-center gap-2">
        <div className="relative grid h-[140px] w-full place-items-center">
          {busy ? (
            <i className="fa-solid fa-spinner fa-spin text-accent" />
          ) : skinUrl ? (
            <SkinThumb url={skinUrl} model={outfit.model} className="h-[140px] w-auto" />
          ) : (
            <i className="fa-solid fa-shirt text-2xl text-muted" />
          )}
          {}
          {}
          {capeUrl && !busy && (
            <div
              title={capeName ?? undefined}
              className="absolute bottom-0 right-0 overflow-hidden rounded-[3px]"
            >
              <TexturePreview url={capeUrl} kind="cape" scale={2} />
            </div>
          )}
        </div>
        <span className="line-clamp-1 max-w-full text-xs font-semibold text-text">{outfit.name}</span>
        {}
        <span className="flex max-w-full items-center gap-1.5 text-[10px] leading-none text-muted">
          <i className="fa-solid fa-hand-fist opacity-70" />
          {modelLabel}
          <span className="opacity-40">·</span>
          <i className={`fa-solid ${capeUrl ? "fa-check text-accent" : "fa-xmark opacity-70"}`} />
          {capeUrl ? (
            <span className="line-clamp-1">{capeName ?? t("Плащ")}</span>
          ) : (
            <span>{t("Без плаща")}</span>
          )}
        </span>
      </button>
      <CardTools onDelete={onDelete} />
    </div>
  );
}
export const OutfitCard = memo(OutfitCardImpl);
