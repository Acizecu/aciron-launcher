

const KEEP = new Set([
  "p", "br", "hr",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "strong", "b", "em", "i", "u", "s", "del", "ins", "mark", "small",
  "code", "pre", "kbd", "samp", "var",
  "blockquote",
  "ul", "ol", "li",
  "dl", "dt", "dd",
  "a", "img",
  "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption",
  "span", "div", "center", "figure", "figcaption",
  "details", "summary",
  "sup", "sub", "abbr",
]);

const UNWRAP = new Set([
  "font", "tt", "big", "article", "section", "header", "footer", "main",
  "aside", "nav", "label", "body", "html", "picture", "colgroup", "col",
]);

const DROP = new Set([
  "script", "style", "link", "meta", "base", "title", "head",
  "iframe", "frame", "frameset", "object", "embed", "applet", "param",
  "source", "track", "audio", "video", "canvas", "map", "area",
  "form", "input", "button", "select", "option", "optgroup", "textarea",
  "fieldset", "legend", "output", "progress", "meter", "datalist",
  "template", "slot", "noscript", "portal", "dialog", "marquee", "plaintext",
  "svg", "math", "foreignobject", "annotation-xml", "desc", "use", "mglyph",
  "malignmark", "xmp", "listing",
]);

const GLOBAL_ATTRS = new Set(["title", "lang", "dir"]);

const ATTRS: Record<string, Set<string>> = {
  img: new Set(["alt"]),
  th: new Set(["colspan", "rowspan"]),
  td: new Set(["colspan", "rowspan"]),
  ol: new Set(["start"]),
  details: new Set(["open"]),
};

const NUM = /^\d{1,4}$/;

const XHTML = "http://www.w3.org/1999/xhtml";

const MAX_NODES = 20_000;
const MAX_DEPTH = 64;

const URL_JUNK = new RegExp(
  "[\\u0000-\\u0020\\u007f-\\u00a0\\u1680\\u2000-\\u200f" +
    "\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff]",
  "g"
);

function internalHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h === "::1" || h === "0.0.0.0") return true;
  return (
    /^127\./.test(h) ||
    /^10\./.test(h) ||
    /^192\.168\./.test(h) ||
    /^169\.254\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h)
  );
}

export function safeUrl(raw: string | null): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(URL_JUNK, "");
  if (!cleaned) return null;
  try {

    const u = new URL(cleaned, "https://relative.invalid/");
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;

    if (u.hostname === "relative.invalid") return null;
    if (internalHost(u.hostname)) return null;
    return u.href;
  } catch {
    return null;
  }
}

type Ctx = { nodes: number };

function cleanElement(el: Element, out: Element): void {
  const tag = el.localName;
  const allowed = ATTRS[tag];
  for (const attr of Array.from(el.attributes)) {
    const name = attr.name.toLowerCase();

    if (!GLOBAL_ATTRS.has(name) && !allowed?.has(name)) continue;
    if ((name === "colspan" || name === "rowspan" || name === "start") && !NUM.test(attr.value)) {
      continue;
    }
    if (name === "dir" && !["ltr", "rtl", "auto"].includes(attr.value.toLowerCase())) continue;
    out.setAttribute(name, attr.value);
  }

  if (tag === "a") {
    const url = safeUrl(el.getAttribute("href"));
    if (url) {

      out.setAttribute("data-href", url);
      out.setAttribute("role", "link");
    }
  }

  if (tag === "img") {
    const url = safeUrl(el.getAttribute("src"));
    if (!url) return;
    out.setAttribute("src", url);

    out.setAttribute("referrerpolicy", "no-referrer");
    out.setAttribute("loading", "lazy");
    out.setAttribute("decoding", "async");
  }
}

function walk(src: Node, dst: Node, doc: Document, ctx: Ctx, depth: number): void {
  if (depth > MAX_DEPTH) return;
  for (const node of Array.from(src.childNodes)) {
    if (ctx.nodes >= MAX_NODES) return;

    if (node.nodeType === Node.TEXT_NODE) {
      ctx.nodes++;
      dst.appendChild(doc.createTextNode(node.nodeValue ?? ""));
      continue;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) continue;

    const el = node as Element;

    if (el.namespaceURI !== XHTML) continue;
    const tag = el.localName;

    if (DROP.has(tag)) continue;

    if (!KEEP.has(tag) || UNWRAP.has(tag)) {
      walk(el, dst, doc, ctx, depth + 1);
      continue;
    }

    ctx.nodes++;
    const copy = doc.createElement(tag);
    cleanElement(el, copy);

    if (tag === "img" && !copy.getAttribute("src")) continue;
    dst.appendChild(copy);
    walk(el, copy, doc, ctx, depth + 1);
  }
}

export function sanitizeToFragment(html: string): DocumentFragment {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const frag = document.createDocumentFragment();
  walk(parsed.body, frag, document, { nodes: 0 }, 0);
  return frag;
}
