/**
 * 共享运行时：从格式化后的 Cinderwake 主程序里定位全部 describe() 站点，
 * 解析其依赖数值表，并在沙箱中按「等级 × 同源之焰 × 键鼠/触屏」求出真实渲染文本。
 *
 * 被两个工具复用：
 *   tools/extract-describe-corpus.mjs  -> 导出英文语料
 *   tools/describe-dict.mjs            -> 把模板静态片段译成中文，产出 en->zh 精确字典
 */

/**
 * 从 start 起扫描一段表达式源码，感知字符串 / 模板字面量 / ${} 嵌套。
 * mode='literal'：在顶层 `,` `;` 处结束；mode='bracket'：在配对闭括号处结束。
 */
export function scanExpr(src, start, mode = 'literal') {
  const stack = [];
  let i = start, depth = 0;
  while (i < src.length) {
    const c = src[i];
    const top = stack[stack.length - 1];
    if (!top) {
      if (depth === 0 && i > start && mode === 'literal' && (c === ',' || c === ';')) return src.slice(start, i);
      if (c === '"' || c === "'") { stack.push({ kind: 'str', quote: c }); i++; continue; }
      if (c === '`') { stack.push({ kind: 'tpl' }); i++; continue; }
      if (c === '(' || c === '[' || c === '{') { depth++; i++; continue; }
      if (c === ')' || c === ']' || c === '}') {
        if (depth === 0) {
          return mode === 'bracket' ? src.slice(start, i + 1) : src.slice(start, i);
        }
        depth--;
        if (mode === 'bracket' && depth === 0) return src.slice(start, i + 1);
        i++;
        continue;
      }
      i++; continue;
    }
    if (top.kind === 'str') {
      if (c === '\\') { i += 2; continue; }
      if (c === top.quote) stack.pop();
      i++; continue;
    }
    if (top.kind === 'tpl') {
      if (c === '\\') { i += 2; continue; }
      if (c === '`') { stack.pop(); i++; continue; }
      if (c === '$' && src[i + 1] === '{') { stack.push({ kind: 'code', depth: 0 }); i += 2; continue; }
      i++; continue;
    }
    if (c === '"' || c === "'") { stack.push({ kind: 'str', quote: c }); i++; continue; }
    if (c === '`') { stack.push({ kind: 'tpl' }); i++; continue; }
    if (c === '{' || c === '(' || c === '[') { top.depth++; i++; continue; }
    if (c === ')' || c === ']') { top.depth--; i++; continue; }
    if (c === '}') { if (top.depth === 0) { stack.pop(); i++; continue; } top.depth--; i++; continue; }
    i++;
  }
  return src.slice(start);
}

/** 仅收集「代码区」里的标识符：跳过字符串与模板文本、属性访问与对象键。 */
export function identifiersOf(code) {
  const found = new Set();
  const stack = [];
  let i = 0, depth = 0;
  // `foo.bar` 的 bar 是成员名，不算依赖；但展开运算符 `...qM` 结尾也是 '.'，
  // 不能一并排除，否则 `{ ...qM, ...YM() }` 这类定义会丢掉 qM/YM 依赖。
  const isMemberAccess = (before) => /[\w$\]\)]\s*\.$/.test(before);
  while (i < code.length) {
    const c = code[i];
    const top = stack[stack.length - 1];
    if (!top) {
      if (c === '"' || c === "'") { stack.push({ kind: 'str', quote: c }); i++; continue; }
      if (c === '`') { stack.push({ kind: 'tpl' }); i++; continue; }
      if (c === '(' || c === '[' || c === '{') { depth++; i++; continue; }
      if (c === ')' || c === ']') { depth--; i++; continue; }
      if (/[\w$]/.test(c)) {
        let j = i; while (j < code.length && /[\w$]/.test(code[j])) j++;
        const word = code.slice(i, j);
        const before = code.slice(0, i).replace(/\s+$/, '');
        const after = code.slice(j).replace(/^\s*/, '');
        if (!isMemberAccess(before) && !after.startsWith(':')) found.add(word);
        i = j; continue;
      }
      i++; continue;
    }
    if (top.kind === 'str') { if (c === '\\') { i += 2; continue; } if (c === top.quote) stack.pop(); i++; continue; }
    if (top.kind === 'tpl') {
      if (c === '\\') { i += 2; continue; }
      if (c === '`') { stack.pop(); i++; continue; }
      if (c === '$' && code[i + 1] === '{') { stack.push({ kind: 'code', depth: 0 }); i += 2; continue; }
      i++; continue;
    }
    if (c === '"' || c === "'") { stack.push({ kind: 'str', quote: c }); i++; continue; }
    if (c === '`') { stack.push({ kind: 'tpl' }); i++; continue; }
    if (c === '{' || c === '(' || c === '[') { top.depth++; i++; continue; }
    if (c === ')' || c === ']') { top.depth--; i++; continue; }
    if (c === '}') { if (top.depth === 0) { stack.pop(); i++; continue; } top.depth--; i++; continue; }
    if (/[\w$]/.test(c)) {
      let j = i; while (j < code.length && /[\w$]/.test(code[j])) j++;
      const w = code.slice(i, j);
      const bef = code.slice(0, i).replace(/\s+$/, '');
      const aft = code.slice(j).replace(/^\s*/, '');
      if (!isMemberAccess(bef) && !aft.startsWith(':')) found.add(w);
      i = j; continue;
    }
    i++;
  }
  return [...found];
}

/**
 * 解码头尾字面量里的转义，得到「渲染出来的文本」。
 * 只处理 \n \t \r \\ \` \$ \xNN \uNNNN，其余保持原样。
 */
export function decodeLiteral(raw, quote) {
  let out = '';
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c !== '\\') { out += c; continue; }
    const n = raw[i + 1];
    if (n === undefined) { out += c; break; }
    if (n === 'n') { out += '\n'; i++; }
    else if (n === 't') { out += '\t'; i++; }
    else if (n === 'r') { out += '\r'; i++; }
    else if (n === 'b') { out += '\b'; i++; }
    else if (n === 'f') { out += '\f'; i++; }
    else if (n === 'v') { out += '\v'; i++; }
    else if (n === '0') { out += '\0'; i++; }
    else if (n === '\\' || n === '`' || n === '$' || n === '"' || n === "'") { out += n; i++; }
    else if (n === 'x' && /^[0-9a-fA-F]{2}$/.test(raw.slice(i + 2, i + 4))) { out += String.fromCharCode(parseInt(raw.slice(i + 2, i + 4), 16)); i += 3; }
    else if (n === 'u' && /^[0-9a-fA-F]{4}$/.test(raw.slice(i + 2, i + 6))) { out += String.fromCharCode(parseInt(raw.slice(i + 2, i + 6), 16)); i += 5; }
    else { out += c; }
  }
  return out;
}

/** 把中文文本重新编码为 JS 字面量内部可安全存放的形式。 */
export function encodeLiteral(text) {
  return text.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${').replace(/\r/g, '\\r').replace(/\n/g, '\\n');
}

/**
 * 提取一段源码里所有「字符串/模板字面量的静态片段」。
 * 返回 [{ raw, decoded, quote, start, end }]，按出现顺序；模板字面量会被 ${} 切成多段。
 */
export function literalChunks(code) {
  const chunks = [];
  const stack = [];
  let i = 0;
  while (i < code.length) {
    const c = code[i];
    const top = stack[stack.length - 1];
    if (!top) {
      if (c === '"' || c === "'") {
        const quote = c;
        let j = i + 1;
        while (j < code.length) {
          if (code[j] === '\\') { j += 2; continue; }
          if (code[j] === quote) break;
          j++;
        }
        const raw = code.slice(i + 1, j);
        chunks.push({ raw, decoded: decodeLiteral(raw, quote), quote, start: i + 1, end: j });
        i = j + 1;
        continue;
      }
      if (c === '`') { stack.push({ kind: 'tpl', segStart: i + 1 }); i++; continue; }
      if (c === '(' || c === '[' || c === '{') { stack.push({ kind: 'block', depth: 0 }); i++; continue; }
      i++; continue;
    }
    if (top.kind === 'block') {
      if (c === '"' || c === "'") { stack.push({ kind: 'str', quote: c }); i++; continue; }
      if (c === '`') { stack.push({ kind: 'tpl', segStart: i + 1 }); i++; continue; }
      if (c === '(' || c === '[' || c === '{') { top.depth++; i++; continue; }
      if (c === ')' || c === ']' || c === '}') {
        if (top.depth === 0) { stack.pop(); i++; continue; }
        top.depth--; i++; continue;
      }
      i++; continue;
    }
    if (top.kind === 'str') {
      if (c === '\\') { i += 2; continue; }
      if (c === top.quote) { stack.pop(); }
      i++; continue;
    }
    if (top.kind === 'tpl') {
      if (c === '\\') { i += 2; continue; }
      if (c === '`') {
        const raw = code.slice(top.segStart, i);
        chunks.push({ raw, decoded: decodeLiteral(raw, '`'), quote: '`', start: top.segStart, end: i });
        stack.pop();
        i++; continue;
      }
      if (c === '$' && code[i + 1] === '{') {
        const raw = code.slice(top.segStart, i);
        chunks.push({ raw, decoded: decodeLiteral(raw, '`'), quote: '`', start: top.segStart, end: i });
        stack.push({ kind: 'code', depth: 0 });
        i += 2; continue;
      }
      i++; continue;
    }
    if (top.kind === 'code') {
      if (c === '"' || c === "'") { stack.push({ kind: 'str', quote: c }); i++; continue; }
      if (c === '`') { stack.push({ kind: 'tpl', segStart: i + 1 }); i++; continue; }
      if (c === '(' || c === '[' || c === '{') { top.depth++; i++; continue; }
      if (c === ')' || c === ']') { if (top.depth > 0) top.depth--; i++; continue; }
      if (c === '}') {
        if (top.depth === 0) {
          stack.pop();
          const enclosing = stack[stack.length - 1];
          if (enclosing && enclosing.kind === 'tpl') enclosing.segStart = i + 1;
          i++; continue;
        }
        top.depth--;
      }
      i++; continue;
    }
    i++;
  }
  return chunks;
}

/**
 * 用片段译文表重写源码：把命中的静态片段替换成中文（保持其余源码逐字不动）。
 * map: { [decodedEn]: decodedZh }
 * 返回 { code, replaced: [...], missed: [...] }
 */
export function applyChunkMap(code, map) {
  const chunks = literalChunks(code);
  let out = '';
  let cursor = 0;
  const replaced = [];
  for (const ch of chunks) {
    if (!ch.decoded) continue;
    const zh = Object.prototype.hasOwnProperty.call(map, ch.decoded) ? map[ch.decoded] : null;
    if (zh === null || zh === undefined || zh === '') {
      if (/^[A-Za-z]/.test(ch.decoded)) replaced.push({ en: ch.decoded, kept: true });
      continue;
    }
    out += code.slice(cursor, ch.start) + encodeLiteral(zh);
    cursor = ch.end;
    replaced.push({ en: ch.decoded, zh });
  }
  out += code.slice(cursor);
  return { code: out, replaced };
}

const KEYWORDS = new Set(['let', 'const', 'var', 'return', 'if', 'else', 'true', 'false', 'null', 'undefined', 'class', 'function', 'new', 'this', 'throw', 'catch', 'try', 'finally', 'typeof', 'instanceof', 'void', 'delete', 'in', 'of', 'for', 'while', 'do', 'switch', 'case', 'default', 'break', 'continue', 'yield', 'await', 'async', 'import', 'export', 'extends', 'super', 'Math', 'String', 'Number', 'Object', 'Array', 'JSON', 'e42', 'e43', 't2', 'n2']);
const SKIP_DEPS = new Set(['QU', 'VM', 'Math', 'String', 'Number', 'Object', 'Array', 'JSON', 'console', 'window', 'document', 'true', 'false', 'null', 'undefined', 'class', 'function', 'new', 'this', 'throw', 'catch', 'try', 'finally', 'typeof', 'instanceof', 'void', 'delete', 'in', 'of', 'for', 'while', 'do', 'switch', 'case', 'default', 'break', 'continue', 'yield', 'await', 'async', 'import', 'export', 'extends', 'super']);

/**
 * 定位全部 describe: 站点。
 * maxRank：游戏里的 over（同源之焰）能把技能堆到 base+over < 12，即最高 11 级，
 * 但表里的 maxLevel 只是基础上限（多为 6），所以这里按 11 级补全，否则 7~11 级的
 * 描述文本（数字不同）永远进不了字典。
 */
export function collectDescribeSites(src, { maxRank = 11 } = {}) {
  const lineOf = (pos) => src.slice(0, pos).split('\n').length;
  const sites = [];
  const re = /describe:\s*/g;
  let m;
  while ((m = re.exec(src))) {
    const valStart = m.index + m[0].length;
    const fn = scanExpr(src, valStart, 'literal').trim().replace(/\n\s+/g, ' ');
    const before = src.slice(Math.max(0, m.index - 4000), m.index);
    const ids = [...before.matchAll(/(?:^|[\{,]\s*)id:\s*`([^`]+)`/g)];
    const around = src.slice(m.index - 500, m.index);
    const mls = [...around.matchAll(/maxLevel:\s*(\d+)/g)];
    sites.push({
      id: ids.length ? ids[ids.length - 1][1] : `site_${sites.length}`,
      maxLevel: Math.max(mls.length ? Number(mls[mls.length - 1][1]) : 6, maxRank),
      fn,
      deps: identifiersOf(fn).filter((w) => !KEYWORDS.has(w) && !/^e42$/.test(w)),
    });
    re.lastIndex = valStart + fn.length;
  }
  return { sites, lineOf };
}

/**
 * 解析 describe 站点依赖的顶层数值表（传递闭包），返回可求值的工厂。
 * make(QU, leapKey, sites, fnOverride?) -> { fns, zG }
 */
export function buildEvaluator(src, sites, lineOf, options = {}) {
  const chunkMap = options.chunkMap || null;
  const countState = src.match(/\b([\w$]+)\s*=\s*\{\s*extra:\s*0\s*\}/)?.[1];
  const resolved = new Map();
  const unresolved = new Set();
  const allDeps = new Set();

  function findDef(name) {
    const re = new RegExp(`(^|[\\s,;])(var\\s+)?${name.replace(/\$/g, '\\$')}\\s*=\\s*`, 'g');
    let m;
    const cands = [];
    while ((m = re.exec(src))) {
      const valStart = m.index + m[0].length;
      const fc = src[valStart];
      if (!/[`'"({[\w$]/.test(fc)) continue;
      const expr = scanExpr(src, valStart, fc === '{' || fc === '[' ? 'bracket' : 'literal').trim();
      if (!expr || expr.length > 6000) continue;
      cands.push({ line: lineOf(m.index), expr });
    }
    if (!cands.length) return null;
    cands.sort((a, b) => Math.abs(a.line - 29300) - Math.abs(b.line - 29300));
    return cands[0].expr;
  }

  function findFn(name) {
    const re = new RegExp(`(?:async\\s+)?function ${name.replace(/\$/g, '\\$')}\\s*\\(`);
    const m = re.exec(src);
    if (!m) return null;
    const braceStart = src.indexOf('{', m.index + m[0].length - 1);
    let depth = 0, i = braceStart, inStr = null;
    while (i < src.length) {
      const c = src[i];
      if (inStr) { if (c === '\\') { i += 2; continue; } if (c === inStr) inStr = null; i++; continue; }
      if (c === '"' || c === "'" || c === '`') { inStr = c; i++; continue; }
      if (c === '{') depth++;
      if (c === '}') { depth--; if (depth === 0) return src.slice(m.index, i + 1); }
      i++;
    }
    return null;
  }

  function resolveDep(name) {
    if (allDeps.has(name)) return;
    allDeps.add(name);
    if (/^[0-9]+(\.[0-9]+)?$/.test(name)) return;
    if (SKIP_DEPS.has(name)) return;
    const expr = findDef(name);
    if (expr) {
      const used = chunkMap ? applyChunkMap(expr, chunkMap).code : expr;
      resolved.set(name, `var ${name} = ${used};`);
      for (const d of identifiersOf(expr)) resolveDep(d);
      return;
    }
    const fnSrc = findFn(name);
    if (fnSrc) {
      const used = chunkMap ? applyChunkMap(fnSrc, chunkMap).code : fnSrc;
      resolved.set(name, used + ';');
      for (const d of identifiersOf(fnSrc)) resolveDep(d);
      return;
    }
    unresolved.add(name);
  }

  for (const s of sites) for (const d of s.deps) resolveDep(d);
  allDeps.delete('QU');
  allDeps.delete('VM');

  // 新版本 bundle 里有些常见标识符（如 `e`）会被 findDef 误匹配到运行期才成立的赋值，
  // 直接放进 bootstrap 会在求值阶段抛错并中断整轮。这里统一包一层 try/catch：
  // 失败的定义降级为 undefined，只影响真正用到它的那条描述（由 forEachVariant 记录错误）。
  const safeDecl = (code) => {
    const m = /^var ([A-Za-z_$][\w$]*) = ([\s\S]*);$/.exec(code);
    if (!m) return code;
    return `var ${m[1]} = (function () { try { return (${m[2]}); } catch (__e) { return undefined; } })();`;
  };
  // var 会提升但不会提升赋值，所以必须按依赖顺序落地：
  // 形如 `var XM = { ...qM, ...YM() }` 的定义若排在 qM 赋值之前，展开到的是 undefined。
  const order = [];
  const state = new Map(); // 1 = 访问中，2 = 已完成
  const visit = (name) => {
    const st = state.get(name);
    if (st) return; // 已处理，或遇到循环引用（保留首次顺序即可）
    state.set(name, 1);
    const decl = resolved.get(name);
    const body = decl ? decl.replace(/^var [A-Za-z_$][\w$]* = /, '').replace(/;$/, '') : '';
    for (const dep of identifiersOf(body)) {
      if (dep !== name && resolved.has(dep)) visit(dep);
    }
    state.set(name, 2);
    if (decl) order.push(decl);
  };
  for (const name of resolved.keys()) visit(name);
  const decls = order.map(safeDecl);
  const missing = [...unresolved].filter((n) => !resolved.has(n));

  const bootstrap = `
  // 键位表 XM 依赖 localStorage 读取用户改键（game 里 YM() 会 JSON.parse）。
  // 求值环境没有浏览器 API，这里给最小 stub，避免 XM 整条定义被降级成 undefined。
  var localStorage = { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {} };
  var QU = arguments[0];
  var matchMedia = function () { return { matches: QU }; };
  var VM = { leap: arguments[1] };
  ${decls.join('\n')}
  var sites = arguments[2];
  var fns = sites.map((s) => eval('(' + s.fn + ')'));
  return { fns, countState: ${countState && resolved.has(countState) ? countState : 'null'} };
`;

  let make;
  try {
    make = new Function(bootstrap);
  } catch (e) {
    const err = new Error('bootstrap compile error: ' + e.message);
    err.bootstrap = bootstrap;
    throw err;
  }
  return { make, missing, deps: allDeps, resolved, bootstrap };
}

/** 变体枚举：键鼠/触屏 × 同源之焰 0~2 × 等级 1..maxLevel */
export function forEachVariant(sites, make, cb) {
  for (const QU of [false, true]) {
    for (const leapKey of ['Space']) {
      const ctx = make(QU, leapKey, sites);
      for (const extra of [0, 1, 2]) {
        if (ctx.countState) ctx.countState.extra = extra;
        sites.forEach((site, i) => {
          for (let rank = 1; rank <= site.maxLevel; rank++) {
            let text;
            try {
              text = String(ctx.fns[i](rank));
            } catch (e) {
              cb(null, { site, rank, QU, extra, error: e.message });
              continue;
            }
            cb({ site, rank, QU, extra, text }, null);
          }
        });
      }
    }
  }
}
