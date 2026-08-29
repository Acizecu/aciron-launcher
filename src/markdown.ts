

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Метка, которой подменяется инлайновый код на время разбора.
 *
 * Символ выбран заведомо не встречающийся в тексте описания: любая обычная
 * последовательность вроде «@@0@@» рано или поздно попадётся в чужом тексте
 * буквально, и кусок описания подменится случайным куском кода.
 */
const CODE_MARK = String.fromCharCode(1);
const CODE_MARK_RE = new RegExp(CODE_MARK + "([0-9]+)" + CODE_MARK, "g");

/**
 * Строчная разметка: код, картинки, ссылки, начертания.
 *
 * Инлайновый код обрабатывается ПЕРВЫМ и выводится из игры меткой — иначе `**`
 * внутри примера кода превратился бы в жирный текст, а `_` съел бы
 * подчёркивания в именах переменных.
 */
function inline(src: string): string {
  const codes: string[] = [];
  let s = src.replace(/`([^`\n]+)`/g, (_m, code: string) => {
    codes.push(`<code>${esc(code)}</code>`);
    return CODE_MARK + String(codes.length - 1) + CODE_MARK;
  });

  // Картинка обязана идти раньше ссылки: у неё тот же синтаксис плюс «!».
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_m, alt: string, url: string) =>
    `<img src="${esc(url)}" alt="${esc(alt)}">`
  );
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_m, text: string, url: string) =>
    `<a href="${esc(url)}">${text}</a>`
  );
  // Голый адрес в угловых скобках — тоже ссылка.
  s = s.replace(/<(https?:\/\/[^>\s]+)>/g, (_m, url: string) => `<a href="${esc(url)}">${esc(url)}</a>`);

  s = s.replace(/\*\*\*([^*\n]+)\*\*\*/g, "<strong><em>$1</em></strong>");
  s = s.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*\w])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  s = s.replace(/__([^_\n]+)__/g, "<strong>$1</strong>");
  // Подчёркивание курсивом — только между границами слов: иначе snake_case
  // в именах файлов и модов разваливается на куски.
  s = s.replace(/(^|[^_\w])_([^_\n]+)_(?![\w])/g, "$1<em>$2</em>");
  s = s.replace(/~~([^~\n]+)~~/g, "<s>$1</s>");

  return s.replace(CODE_MARK_RE, (_m, i: string) => codes[Number(i)] ?? "");
}

/** Строка-разделитель таблицы: |---|:--:|---:| */
function isTableRule(line: string): boolean {
  return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);
}

function tableCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

/**
 * Предел вложенности цитат.
 *
 * Цитата разбирается рекурсивно, снимая по одному «>» за раз, — а описание мода
 * пишет посторонний человек. Строка из десяти тысяч «>» подряд проходит любой
 * потолок по размеру (256 КБ — это 256 тысяч таких символов) и кладёт разбор
 * переполнением стека. Падает при этом не карточка мода: ошибка из эффекта
 * уходит к ErrorBoundary, а он один на всё приложение — весь лаунчер сменяется
 * экраном «Лаунчер сломался», причём по чужой команде.
 *
 * Восемь уровней — заведомо больше, чем встречается в живых описаниях; глубже
 * текст просто остаётся текстом.
 */
const MAX_QUOTE_DEPTH = 8;

export function markdownToHtml(src: string, depth = 0): string {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  // Открытые списки: нужен стек, потому что списки бывают вложенными, а закрывать
  // их надо в обратном порядке.
  const lists: { tag: "ul" | "ol"; indent: number }[] = [];
  let para: string[] = [];

  const closeLists = (toIndent = -1) => {
    while (lists.length && lists[lists.length - 1].indent >= toIndent) {
      out.push(`</${lists.pop()!.tag}>`);
    }
  };
  const flushPara = () => {
    if (para.length) {
      out.push(`<p>${inline(para.join(" "))}</p>`);
      para = [];
    }
  };
  const closeAll = () => {
    flushPara();
    closeLists();
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // --- блок кода ---
    const fence = line.match(/^\s*(```|~~~)(.*)$/);
    if (fence) {
      closeAll();
      const mark = fence[1];
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(mark)) {
        body.push(lines[i]);
        i++;
      }
      out.push(`<pre><code>${esc(body.join("\n"))}</code></pre>`);
      continue;
    }

    // --- пустая строка ---
    if (!line.trim()) {
      flushPara();
      continue;
    }

    // --- горизонтальная черта ---
    if (/^\s*([-*_])\s*(\1\s*){2,}$/.test(line)) {
      closeAll();
      out.push("<hr>");
      continue;
    }

    // --- заголовок ---
    const head = line.match(/^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (head) {
      closeAll();
      const lvl = head[1].length;
      out.push(`<h${lvl}>${inline(head[2])}</h${lvl}>`);
      continue;
    }

    // --- цитата ---
    const quote = line.match(/^\s{0,3}>\s?(.*)$/);
    if (quote) {
      closeAll();
      const body: string[] = [quote[1]];
      while (i + 1 < lines.length && /^\s{0,3}>\s?/.test(lines[i + 1])) {
        i++;
        body.push(lines[i].replace(/^\s{0,3}>\s?/, ""));
      }
      out.push(
        depth + 1 >= MAX_QUOTE_DEPTH
          ? `<blockquote><p>${inline(body.join(" "))}</p></blockquote>`
          : `<blockquote>${markdownToHtml(body.join("\n"), depth + 1)}</blockquote>`
      );
      continue;
    }

    // --- таблица ---
    if (line.includes("|") && i + 1 < lines.length && isTableRule(lines[i + 1])) {
      closeAll();
      const head = tableCells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) {
        rows.push(tableCells(lines[i]));
        i++;
      }
      i--;
      const th = head.map((c) => `<th>${inline(c)}</th>`).join("");
      const tb = rows
        .map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`)
        .join("");
      out.push(`<table><thead><tr>${th}</tr></thead><tbody>${tb}</tbody></table>`);
      continue;
    }

    // --- пункт списка ---
    const item = line.match(/^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/);
    if (item) {
      flushPara();
      const indent = item[1].length;
      const tag: "ul" | "ol" = /\d/.test(item[2]) ? "ol" : "ul";
      const top = lists[lists.length - 1];
      if (!top || indent > top.indent) {
        lists.push({ tag, indent });
        out.push(`<${tag}>`);
      } else {
        closeLists(indent + 1);
        const cur = lists[lists.length - 1];
        if (!cur) {
          lists.push({ tag, indent });
          out.push(`<${tag}>`);
        } else if (cur.tag !== tag) {
          out.push(`</${cur.tag}>`);
          lists[lists.length - 1] = { tag, indent };
          out.push(`<${tag}>`);
        }
      }
      out.push(`<li>${inline(item[3])}</li>`);
      continue;
    }

    // --- блок сырого HTML ---
    // Строка, начинающаяся с тега, отдаётся как есть: чистка — забота
    // санитайзера, а обернуть чужой <div> в <p> значит сломать вёрстку.
    //
    // После имени тега обязателен пробел, «/» или «>». Без этой проверки под
    // правило попадал автолинк `<https://github.com/…>`, стоящий отдельной
    // строкой: разбор считал его тегом с именем «https», санитайзер такого не
    // знал и выбрасывал — ссылка на репозиторий молча пропадала из описания.
    if (/^\s*<\/?[a-zA-Z][\w-]*[\s/>]/.test(line)) {
      closeAll();
      out.push(line);
      continue;
    }

    // --- обычный текст ---
    closeLists();
    para.push(line.trim());
  }

  closeAll();
  return out.join("\n");
}
