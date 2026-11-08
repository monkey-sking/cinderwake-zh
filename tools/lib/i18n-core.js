/**
 * Cinderwake 汉化翻译核心（纯文本逻辑，零依赖）
 *
 * 这份文件会被两种方式复用，保证「构建产物」与「离线校验」行为完全一致：
 *   1. tools/build-user-script.mjs 把本文件源码原样内联进 cinderwake-zh.user.js；
 *   2. tools/check-coverage.mjs 与测试用 new Function() 直接求值本文件。
 * 因此文件内只能有一个顶层函数声明 createI18nCore，禁止 import/export/require。
 */
function createI18nCore(EXACT_MAP, RAW_PATTERNS) {
  // ---------- 文本归一化 ----------
  // 游戏文案使用弯引号（’ “ ”）、不间断空格与长破折号，而字典里有的是直引号，
  // 查表前把两侧都归一化，避免同一句话因为一个引号而漏翻。
  const PUNCT_MAP = {
    "\u2019": "'",
    "\u2018": "'",
    "\u201c": '"',
    "\u201d": '"',
    "\u00a0": " ",
    "\u2009": " ",
    "\u202f": " ",
    "\u2013": "-",
    "\u2014": "-"
  };

  function normalize(raw) {
    return String(raw)
      .replace(/[\u2019\u2018\u201c\u201d\u00a0\u2009\u202f\u2013\u2014]/g, (ch) => PUNCT_MAP[ch])
      .replace(/\s+/g, " ")
      .trim();
  }

  const EXACT = new Map();
  const NORM = new Map();
  const LOWER = new Map();
  for (const key of Object.keys(EXACT_MAP)) {
    const value = EXACT_MAP[key];
    EXACT.set(key, value);
    const nk = normalize(key);
    if (!NORM.has(nk)) NORM.set(nk, value);
    const lk = nk.toLowerCase();
    if (!LOWER.has(lk)) LOWER.set(lk, value);
  }

  // ---------- 模式编译 ----------
  function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  const PATTERNS = [];
  for (const item of RAW_PATTERNS) {
    if (!item || !item.en || !item.zh) continue;
    const parts = normalize(item.en).split(/\{(\*?\d+)\}/);
    const regexParts = [];
    const slotIndices = [];
    for (let i = 0; i < parts.length; i++) {
      if (i % 2 === 0) {
        regexParts.push(escapeRegex(parts[i]));
      } else {
        const name = parts[i];
        const greedy = name.charAt(0) === "*";
        slotIndices.push(parseInt(greedy ? name.slice(1) : name, 10));
        // 贪婪插槽：允许整段文本（含逗号、句号），用于 "A → B" 这类双段预览
        // 普通插槽：允许除首尾句点外的任意短语，兼容 "Stoke! (you don't have it)"
        regexParts.push(greedy ? "(.+)" : "([0-9.,+\\-]+|[^,.?]+?)");
      }
    }
    try {
      PATTERNS.push({
        regex: new RegExp("^" + regexParts.join("") + "$", "i"),
        zh: item.zh,
        slotIndices
      });
    } catch (err) {
      // 无法编译的模式忽略，不影响其余词条
    }
  }

  // ---------- 查表 ----------
  function lookupExact(text) {
    if (!text) return null;
    const trimmed = text.trim();
    if (!trimmed) return null;
    let hit = EXACT.get(trimmed);
    if (hit !== undefined) return hit;
    const upper = trimmed.toUpperCase();
    if (upper !== trimmed) {
      hit = EXACT.get(upper);
      if (hit !== undefined) return hit;
    }
    const nk = normalize(trimmed);
    if (nk !== trimmed) {
      hit = NORM.get(nk);
      if (hit !== undefined) return hit;
    }
    hit = LOWER.get(nk.toLowerCase());
    return hit === undefined ? null : hit;
  }

  const SKIP_RE = /^[0-9.,%+/:#\-\u00d7\u2013\u2014\s]+$/;

  function matchPattern(text) {
    for (const pat of PATTERNS) {
      const m = text.match(pat.regex);
      if (!m) continue;
      let out = pat.zh;
      for (let i = 0; i < pat.slotIndices.length; i++) {
        const raw = (m[i + 1] === undefined ? "" : m[i + 1]).trim();
        out = out.replace(
          new RegExp("\\{" + pat.slotIndices[i] + "\\}", "g"),
          slotValue(raw, 1)
        );
      }
      if (/\{\d+\}/.test(out)) return null; // 插槽没填干净 => 视为不匹配
      return out;
    }
    return null;
  }

  // 插槽内容优先复用已有译文（技能名、装备名、属性短语）
  function slotValue(raw, depth) {
    if (!raw) return "";
    const exact = lookupExact(raw);
    if (exact) return exact;
    if (depth < 3) {
      const deep = translateText(raw, depth);
      if (deep) return deep.trim();
    }
    return raw;
  }

  // ---------- 主入口 ----------
  // 返回 null 表示不翻译；返回字符串时保留原文前后的空白。
  function translateText(text, depth) {
    if (!text) return null;
    const level = depth || 0;
    const trimmed = text.trim();
    if (!trimmed) return null;
    if (level === 0 && SKIP_RE.test(trimmed)) return null;
    if (/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(trimmed)) return null; // 已是中文

    const exact = lookupExact(trimmed);
    if (exact) return wrap(text, exact);

    // 游戏会把 ": 描述" 单独写成相邻文本节点，此时只翻译冒号之后的内容
    const colonSplit = trimmed.match(/^:\s+(.+)$/);
    if (colonSplit && level < 2) {
      const inner = lookupExact(colonSplit[1]);
      if (inner) return text.replace(colonSplit[1], inner);
      const byPattern = matchPattern(normalize(colonSplit[1]));
      if (byPattern) return text.replace(colonSplit[1], byPattern);
    }

    if (level < 2) {
      const byPattern = matchPattern(normalize(trimmed));
      if (byPattern) return wrap(text, byPattern);
      if (trimmed.indexOf("\u2192") !== -1) {
        const halves = trimmed.split(/\s*\u2192\s*/);
        if (halves.length >= 2) {
          const translated = [];
          let ok = true;
          for (const half of halves) {
            const t = slotValue(half, level + 1);
            if (t === half.trim()) { ok = false; break; }
            translated.push(t);
          }
          if (ok) return wrap(text, translated.join(" \u2192 "));
        }
      }
    }

    return null;
  }

  function wrap(original, translated) {
    if (original === translated) return null;
    const leading = original.match(/^\s*/)[0];
    const trailing = original.match(/\s*$/)[0];
    if (!leading && !trailing) return translated;
    return leading + translated + trailing;
  }

  // 精英词缀渲染成「Swift: 」+「moves much faster」两个相邻文本节点。
  // 优先分别翻译再拼回，避免把一个节点清空导致布局抖动。
  function translateAffixPair(leftText, rightText) {
    const head = leftText.replace(/\s+$/, "");
    if (!/:$/.test(head)) return null;
    const title = head.slice(0, -1).trim();
    const right = (rightText || "").trim();
    const leftTranslated = title ? translateText(title) : null;
    const rightTranslated = right ? translateText(right) : null;
    if (leftTranslated && rightTranslated) {
      return { head: leftTranslated + "\uff1a", tail: rightTranslated };
    }
    // 退而求其次：整句命中字典时按冒号拆分回填
    const whole = translateText(head.replace(/:\s*$/, ": ") + right);
    if (whole) {
      const parts = whole.split(/\uff1a|:/);
      if (parts.length >= 2) {
        return {
          head: parts[0].trim() + "\uff1a",
          tail: parts.slice(1).join("\uff1a").trim()
        };
      }
    }
    return null;
  }

  return {
    translateText,
    translateAffixPair,
    lookupExact,
    normalize,
    stats: {
      exactCount: EXACT.size,
      patternCount: PATTERNS.length
    }
  };
}
