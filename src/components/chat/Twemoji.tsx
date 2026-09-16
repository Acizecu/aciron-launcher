import { splitEmoji } from "../../twemoji";

export default function Twemoji({ text }: { text: string }) {
  return (
    <>
      {splitEmoji(text).map((p, i) =>
        "emoji" in p ? (
          <img
            key={i}
            src={p.url}
            alt={p.emoji}
            draggable={false}

            className="inline-block h-[1.25em] w-[1.25em] align-[-0.25em]"
          />
        ) : (
          <span key={i}>{p.text}</span>
        )
      )}
    </>
  );
}
