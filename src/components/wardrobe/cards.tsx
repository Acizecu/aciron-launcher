
import { memo } from "react";
import type { ReactNode } from "react";
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
import Icon from "../Icon";

export function Tile({
  name,
  sub,
  active,
  index,
  disabled,
  onClick,
  tools,
  children,
}: {
  name: string;
  sub?: ReactNode;
  active: boolean;
  index: number;
  disabled?: boolean;
  onClick: () => void;
  tools?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div style={{ animationDelay: `${cardInDelay(index)}ms` }} className="card-in group/tile relative">
      {tools && <div className="absolute left-2.5 top-2.5 z-10 flex gap-1">{tools}</div>}
      <button onClick={onClick} disabled={disabled} aria-pressed={active} className="group block w-full text-left">
        <span
          className="relative grid aspect-[4/5] place-items-center overflow-hidden rounded-[22px] transition-[background-color,box-shadow,transform] duration-500 ease-[var(--ease-soft)] group-hover:-translate-y-0.5 group-active:scale-[0.98]"
          style={{
            background: active
              ? "radial-gradient(70% 60% at 50% 55%, color-mix(in srgb, var(--color-accent) 22%, transparent), color-mix(in srgb, var(--color-accent) 6%, transparent))"
              : "color-mix(in srgb, var(--color-text) 3.5%, transparent)",
            boxShadow: active ? "inset 0 0 0 2px var(--color-accent)" : "none",
          }}
        >
          {children}
          {active && (
            <span className="pop absolute right-2.5 top-2.5 grid size-6 place-items-center rounded-full bg-accent text-bg">
              <Icon cls="fa-solid fa-check text-[13px]" />
            </span>
          )}
        </span>
        <span
          className={`mt-2.5 block truncate text-[14px] font-medium transition-colors ${
            active ? "text-accent-hover" : "text-text"
          }`}
        >
          {name}
        </span>
        <span className="block truncate text-[12.5px] text-muted">{sub ?? "\u00a0"}</span>
      </button>
    </div>
  );
}

export const cardCls = (active: boolean) =>
  `tile group relative flex flex-col items-center gap-2 p-3 ${
    active ? "!border-accent/60 !bg-accent/[0.08]" : ""
  }`;

export function TileButton({
  icon,
  label,
  sub,
  index,
  active,
  disabled,
  title,
  onClick,
}: {
  icon: string;
  label: string;
  sub?: string;
  index: number;
  active?: boolean;
  disabled?: boolean;
  title?: string;
  onClick: () => void;
}) {
  return (
    <div title={title}>
      <Tile name={label} sub={sub} active={!!active} index={index} disabled={disabled} onClick={onClick}>
        <span
          className={`grid size-14 place-items-center rounded-full bg-white/[0.06] text-text2 transition-colors ${
            disabled ? "opacity-45" : "group-hover:text-accent"
          }`}
        >
          <Icon cls={`${icon} text-[22px]`} />
        </span>
      </Tile>
    </div>
  );
}

export function Loading() {
  return (
    <div className="grid min-h-[196px] place-items-center text-muted">
      <Icon cls="fa-solid fa-spinner fa-spin" />
    </div>
  );
}

export function Notice({ text }: { text: string }) {
  return (
    <div className="col-span-full flex items-start gap-2 text-[13px] leading-relaxed text-muted">
      <span className="dot mt-[7px] bg-accent" />
      <span>{text}</span>
    </div>
  );
}

export function SectionHeader({ label }: { label: string }) {
  return (
    <div className="col-span-full -mb-3 mt-3 text-[15px] font-semibold tracking-[-0.01em] text-text first:mt-0">
      {label}
    </div>
  );
}

export function ActiveBadge({ text = t("Используется") }: { text?: string }) {
  return (
    <span className="absolute left-2 top-2 rounded-full bg-accent px-2 py-0.5 text-[11.5px] font-medium text-bg">
      {text}
    </span>
  );
}

export function CardTools({ onEdit, onDelete }: { onEdit?: () => void; onDelete?: () => void }) {
  if (!onEdit && !onDelete) return null;
  const cls =
    "grid h-7 w-7 place-items-center rounded-full bg-black/55 text-text2 opacity-0 backdrop-blur transition-[opacity,color] group-hover/tile:opacity-100 focus-visible:opacity-100";
  return (
    <>
      {onEdit && (
        <button onClick={onEdit} title={t("Переименовать")} className={`${cls} hover:text-text`}>
          <Icon cls="fa-solid fa-pen text-[12px]" />
        </button>
      )}
      {onDelete && (
        <button onClick={onDelete} title={t("Удалить")} className={`${cls} hover:text-danger`}>
          <Icon cls="fa-solid fa-trash-can text-[12px]" />
        </button>
      )}
    </>
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
    <Tile
      name={name}
      sub={active ? t("Используется") : model === "slim" ? t("Тонкие руки") : t("Широкие руки")}
      active={active}
      index={index}
      onClick={onApply}
      tools={(onEdit || onDelete) && <CardTools onEdit={onEdit} onDelete={onDelete} />}
    >
      <SkinThumb url={url} model={model} className="h-[76%] w-[76%] object-contain" />
    </Tile>
  );
}
export const SkinCard = memo(SkinCardImpl);

function CapeCardImpl({
  entry,
  active,
  badge,
  index,
  onApply,
}: {
  entry: CapeEntry;
  active: boolean;

  badge?: string;
  index: number;
  onApply: () => void;
}) {

  useLang();

  return (
    <Tile
      name={entry.name}
      sub={active ? badge ?? t("Надет") : ORIGIN_LABEL[entry.origin]}
      active={active}
      index={index}
      onClick={onApply}
      tools={entry.remove && <CardTools onDelete={entry.remove} />}
    >
      <span className="overflow-hidden rounded-[8px] shadow-[0_10px_24px_rgba(0,0,0,0.35)]">
        <TexturePreview url={entry.url} kind="cape" scale={8} />
      </span>
    </Tile>
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
    <Tile
      name={outfit.name}
      sub={`${modelLabel}, ${capeUrl ? capeName ?? t("Плащ") : t("Без плаща").toLowerCase()}`}
      active={false}
      index={index}
      disabled={busy}
      onClick={onApply}
      tools={<CardTools onDelete={onDelete} />}
    >
      {busy ? (
        <Icon cls="fa-solid fa-spinner fa-spin text-[20px] text-accent" />
      ) : skinUrl ? (
        <SkinThumb url={skinUrl} model={outfit.model} className="h-[76%] w-[76%] object-contain" />
      ) : (
        <Icon cls="fa-solid fa-shirt text-[28px] text-muted" />
      )}
      {}
      {capeUrl && !busy && (
        <span title={capeName ?? undefined} className="absolute bottom-3 right-3 overflow-hidden rounded-[3px]">
          <TexturePreview url={capeUrl} kind="cape" scale={2} />
        </span>
      )}
    </Tile>
  );
}
export const OutfitCard = memo(OutfitCardImpl);
