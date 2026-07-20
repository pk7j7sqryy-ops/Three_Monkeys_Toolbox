/* ============================================================
   Ailearn — 轻量 Markdown 渲染器（零依赖）
   支持：# ~ ###### 多级标题、有序/无序列表、引用、表格、分割线、
        围栏代码块（带行号）、行内 **粗体** *斜体* `代码`
   ============================================================ */
window.MD = (function () {
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function inline(s) {
    s = esc(s);
    s = s.replace(/`([^`]+)`/g, '<code class="md-ic">$1</code>');
    // 图片：放行 data:image / http(s) / 相对路径（须在链接之前匹配，否则 ![..]() 会被当成链接）
    s = s.replace(/!\[([^\]]*)\]\((data:image\/[^)\s]+|https?:\/\/[^)\s]+|\.{0,2}\/[^)\s]+)\)/g,
      (_, alt, url) => `<img class="md-img" src="${url}" alt="${alt}" loading="lazy">`);
    // 链接：仅放行 http(s) / 锚点 / 相对路径，杜绝 javascript: 等危险协议；外链才开新标签
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|#[^)\s]*|\.{0,2}\/[^)\s]*)\)/g,
      (_, txt, url) => `<a href="${url}"${/^https?:/.test(url) ? ' target="_blank" rel="noopener"' : ''}>${txt}</a>`);
    s = s.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
    s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<i>$2</i>');
    return s;
  }
  /* ---------- 轻量语法高亮（零依赖，覆盖 JS/TS/Py/Java/C/Go/SQL 等常见语法） ---------- */
  const KEYWORDS = new Set(('abstract as async await break case catch class const continue debugger ' +
    'def default del elif else except export extends finally for from function global goto if implements ' +
    'import in instanceof interface lambda let new package pass private protected public raise return ' +
    'static super switch this throw throws try typeof var void while with yield await use mod fn pub trait ' +
    'impl match struct enum where defer select chan go type func namespace template virtual override final ' +
    'and or not is assert nonlocal begin end then do end select insert update delete where from join on group ' +
    'order by having union values set into').split(/\s+/));
  const LITERALS = new Set('true false null nil none undefined self this super True False None NULL'.split(/\s+/));
  const TYPES = new Set(('int float double bool boolean char string str list dict tuple set map vector array ' +
    'object number symbol bigint void long short byte void Object String Number Boolean Array Promise ' +
    'Map Set Date Math JSON console').split(/\s+/));

  function highlightCode(code) {
    const src = String(code);
    const out = [];               // 行数组，每项是该行的 HTML
    let line = '';
    const push = (cls, text) => { line += cls ? `<span class="${cls}">${esc(text)}</span>` : esc(text); };
    // 处理可能跨行的 token：按 \n 拆分，逐行落位
    const emit = (cls, text) => {
      const parts = String(text).split('\n');
      for (let k = 0; k < parts.length; k++) {
        if (parts[k]) push(cls, parts[k]);
        if (k < parts.length - 1) { out.push(line); line = ''; }
      }
    };
    let i = 0; const n = src.length;
    const isWord = (c) => /[A-Za-z0-9_$]/.test(c);
    while (i < n) {
      const c = src[i], c2 = src.substr(i, 2);
      // 块注释
      if (c2 === '/*') { let j = src.indexOf('*/', i + 2); j = j < 0 ? n : j + 2; emit('t-com', src.slice(i, j)); i = j; continue; }
      // 行注释
      if (c2 === '//' || c === '#' || c2 === '--') {
        let j = src.indexOf('\n', i); if (j < 0) j = n; emit('t-com', src.slice(i, j)); i = j; continue;
      }
      // 三引号字符串（py）
      if (c2 + src[i + 2] === '"""' || c2 + src[i + 2] === "'''") {
        const q = src.substr(i, 3); let j = src.indexOf(q, i + 3); j = j < 0 ? n : j + 3; emit('t-str', src.slice(i, j)); i = j; continue;
      }
      // 普通字符串 / 模板串
      if (c === '"' || c === "'" || c === '`') {
        let j = i + 1; while (j < n && src[j] !== c) { if (src[j] === '\\') j++; j++; } j = Math.min(j + 1, n);
        emit('t-str', src.slice(i, j)); i = j; continue;
      }
      // 数字
      if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
        let j = i + 1; while (j < n && /[0-9a-fA-FxXbBoO._]/.test(src[j])) j++; push('t-num', src.slice(i, j)); i = j; continue;
      }
      // 标识符 / 关键字 / 类型 / 函数调用
      if (/[A-Za-z_$]/.test(c)) {
        let j = i + 1; while (j < n && isWord(src[j])) j++;
        const w = src.slice(i, j);
        let k = j; while (k < n && src[k] === ' ') k++;
        if (KEYWORDS.has(w)) push('t-key', w);
        else if (LITERALS.has(w)) push('t-num', w);
        else if (TYPES.has(w) || /^[A-Z]/.test(w)) push('t-cls', w);
        else if (src[k] === '(') push('t-fn', w);      // 后跟 ( 视为函数
        else push('', w);
        i = j; continue;
      }
      // 运算符/标点
      if (/[+\-*/%=<>!&|^~?:]/.test(c)) { push('t-op', c); i++; continue; }
      // 换行
      if (c === '\n') { out.push(line); line = ''; i++; continue; }
      push('', c); i++;
    }
    out.push(line);
    return out;
  }

  function codeBlock(lang, lines) {
    const raw = lines.join('\n');
    const hl = highlightCode(raw);
    const body = hl.map((l, i) => `<div><span class="ln">${i + 1}</span><span class="cl">${l || ''}</span></div>`).join('');
    const label = lang || 'code';
    // data-code 存原始代码，供复制按钮读取
    const b64 = (() => { try { return btoa(unescape(encodeURIComponent(raw))); } catch (e) { return ''; } })();
    return `<div class="code-window" style="margin:16px 0"><div class="code-bar"><span class="tl r"></span><span class="tl y"></span><span class="tl g"></span><span class="fname">${esc(label)}</span><button class="code-copy" type="button" data-code="${b64}" title="复制代码">复制</button></div><pre class="code">${body}</pre></div>`;
  }

  function render(md) {
    const lines = String(md || '').replace(/\r\n/g, '\n').split('\n');
    const html = [];
    let listType = null, listBuf = [], para = [];
    function flushList() { if (listBuf.length) { html.push(`<${listType} class="md-list">${listBuf.join('')}</${listType}>`); listBuf = []; listType = null; } }
    function flushPara() { if (para.length) { html.push(`<p class="nd-p">${inline(para.join(' '))}</p>`); para = []; } }

    for (let i = 0; i < lines.length;) {
      const line = lines[i];
      const t = line.trim();

      const fm = t.match(/^```(\w*)/);
      if (fm) {
        flushList(); flushPara();
        const buf = []; i++;
        while (i < lines.length && !/^```/.test(lines[i].trim())) { buf.push(lines[i]); i++; }
        i++; html.push(codeBlock(fm[1], buf)); continue;
      }

      // 表格：当前行含 | 且下一行是分隔行
      if (/^\|.*\|$/.test(t) && i + 1 < lines.length && /^\|[\s:|-]+\|$/.test(lines[i + 1].trim())) {
        flushList(); flushPara();
        const head = t.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
        i += 2; const rows = [];
        while (i < lines.length && /^\|.*\|$/.test(lines[i].trim())) {
          rows.push(lines[i].trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim())); i++;
        }
        html.push(`<div class="md-table-wrap"><table class="md-table"><thead><tr>${head.map(h => `<th>${inline(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
        continue;
      }

      const hm = t.match(/^(#{1,6})\s+(.*)$/);
      if (hm) {
        flushList(); flushPara();
        const lvl = hm[1].length;
        const cls = lvl === 1 ? 'nd-title' : 'nd-h';
        html.push(`<h${lvl} class="${cls} md-h${lvl}">${inline(hm[2])}</h${lvl}>`); i++; continue;
      }

      if (/^([-*_])\1\1+$/.test(t)) { flushList(); flushPara(); html.push('<div class="divider"></div>'); i++; continue; }

      if (/^>\s?/.test(t)) { flushList(); flushPara(); html.push(`<blockquote class="nd-quote">${inline(t.replace(/^>\s?/, ''))}</blockquote>`); i++; continue; }

      const om = t.match(/^\d+\.\s+(.*)$/);
      if (om) { flushPara(); if (listType !== 'ol') { flushList(); listType = 'ol'; } listBuf.push(`<li>${inline(om[1])}</li>`); i++; continue; }

      const um = t.match(/^[-*]\s+(.*)$/);
      if (um) { flushPara(); if (listType !== 'ul') { flushList(); listType = 'ul'; } listBuf.push(`<li>${inline(um[1])}</li>`); i++; continue; }

      if (t === '') { flushList(); flushPara(); i++; continue; }

      para.push(t); i++;
    }
    flushList(); flushPara();
    return html.join('\n');
  }

  function firstHeading(md) { const m = String(md || '').match(/^#{1,6}\s+(.*)$/m); return m ? m[1].trim() : ''; }
  function plainPreview(md, n) {
    const txt = String(md || '').replace(/```[\s\S]*?```/g, ' ').replace(/[#>*`|]/g, ' ').replace(/\s+/g, ' ').trim();
    return txt.slice(0, n || 90);
  }

  return { render, firstHeading, plainPreview, esc, inline };
})();
