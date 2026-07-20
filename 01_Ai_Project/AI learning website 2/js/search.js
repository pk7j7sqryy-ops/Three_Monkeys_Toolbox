/* ============================================================
   全局笔记关键字搜索（⌘K / Ctrl+K 唤起的聚焦面板）
   - 跨页面可用：从任意页面按 ⌘K 或点顶栏「搜索笔记」即可
   - 全文检索：标题 / 正文 / 标签，多关键字按「与」匹配
   - 命中预览：在结果里直接显示关键字所在上下文片段并高亮
   - 回车 / 点击：跳到对应笔记，并在正文里高亮+定位首个命中
   ============================================================ */
(function () {
  let open = false;
  let results = [];
  let active = 0;
  let lastQuery = '';

  /* ---------- 工具 ---------- */
  const esc = (s) => (window.MD ? MD.esc(s) : String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // 把 Markdown 压成可读纯文本（去围栏标记 / 图片 / 链接语法 / 多余符号）
  function plainText(md) {
    return String(md || '')
      .replace(/```[\s\S]*?```/g, (m) => m.replace(/```[^\n]*\n?/g, '').replace(/```/g, ''))
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')          // 图片
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')          // 链接保留文字
      .replace(/^#{1,6}\s+/gm, '')                      // 标题井号
      .replace(/[*_`>#]/g, ' ')                         // 强调/引用符号
      .replace(/\r\n?/g, '\n')
      .replace(/[ \t]+/g, ' ');
  }

  // 在文本里给每个关键字加 <mark>（输入需已转义 / 这里对原文转义后再标）
  function highlight(text, terms) {
    let out = esc(text);
    terms.forEach((t) => {
      if (!t) return;
      out = out.replace(new RegExp('(' + escRe(esc(t)) + ')', 'gi'), '<mark class="gs-hit">$1</mark>');
    });
    return out;
  }

  // 取首个命中所在的上下文片段
  function snippet(plain, terms) {
    const low = plain.toLowerCase();
    let at = -1;
    for (const t of terms) {
      const i = low.indexOf(t.toLowerCase());
      if (i >= 0 && (at < 0 || i < at)) at = i;
    }
    if (at < 0) return null;
    const start = Math.max(0, at - 38);
    let frag = plain.slice(start, at + 90).replace(/\n/g, ' ').trim();
    if (start > 0) frag = '… ' + frag;
    if (at + 90 < plain.length) frag = frag + ' …';
    return highlight(frag, terms);
  }

  function notePath(n) {
    const path = [], seen = new Set();
    let cur = n;
    while (cur && !seen.has(cur.id)) { seen.add(cur.id); path.unshift(cur.title); cur = cur.parentId ? DB.notes.find((x) => x.id === cur.parentId) : null; }
    return path;
  }
  function modInfo(id) {
    const found = (DB.modules || []).find((m) => m.id === id);
    if (found) return found;
    let h = 0; for (const c of String(id || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return { label: id || '未分类', dot: `hsl(${h % 360} 64% 60%)` };
  }

  /* ---------- 检索 ---------- */
  function search(q) {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    const out = [];
    for (const n of DB.notes) {
      const title = n.title || '';
      const tags = (n.tags || []).join(' ');
      const plain = plainText(n.md || n.preview || '');
      const hayTitle = title.toLowerCase();
      const hayTags = tags.toLowerCase();
      const hayBody = plain.toLowerCase();
      // 每个关键字都要在 标题/标签/正文 任一处出现（AND）
      if (!terms.every((t) => hayTitle.includes(t) || hayTags.includes(t) || hayBody.includes(t))) continue;
      // 命中次数（正文里统计第一个关键字的出现次数，给个量感）
      let count = 0;
      terms.forEach((t) => { let i = hayBody.indexOf(t); while (i >= 0) { count++; i = hayBody.indexOf(t, i + t.length); } });
      const inTitle = terms.some((t) => hayTitle.includes(t));
      const inTags = terms.some((t) => hayTags.includes(t));
      // 评分：标题命中权重最高，其次标签，再正文命中次数
      const score = (inTitle ? 1000 : 0) + (inTags ? 200 : 0) + Math.min(count, 50);
      out.push({
        n, score, count, inTitle, inTags, terms,
        snip: snippet(plain, terms) || (inTitle ? highlight(title, terms) : null),
      });
    }
    out.sort((a, b) => b.score - a.score || (b.n.createdAt || 0) - (a.n.createdAt || 0));
    return out.slice(0, 40);
  }

  /* ---------- 渲染 ---------- */
  function resultRow(r, i) {
    const m = modInfo(r.n.mod);
    const crumb = notePath(r.n);
    const parentCrumb = crumb.slice(0, -1).join(' / ');
    return `
      <div class="gs-item ${i === active ? 'on' : ''}" data-i="${i}" role="button" tabindex="-1">
        <span class="gs-ic">${IC.doc}</span>
        <div class="gs-main">
          <div class="gs-title">${highlight(r.n.title || '未命名笔记', r.terms)}</div>
          ${r.snip ? `<div class="gs-snip">${r.snip}</div>` : ''}
          <div class="gs-meta">
            <span class="gs-mod" style="color:${m.dot}"><span class="gs-dot" style="background:${m.dot}"></span>${esc(m.label)}</span>
            ${parentCrumb ? `<span class="gs-path">${esc(parentCrumb)}</span>` : ''}
            ${(r.n.tags || []).length ? `<span class="gs-tags">${(r.n.tags || []).slice(0, 4).map((t) => '#' + esc(t)).join(' ')}</span>` : ''}
          </div>
        </div>
        ${r.count ? `<span class="gs-count">${r.count} 处</span>` : ''}
        <span class="gs-enter">${IC.arrow}</span>
      </div>`;
  }

  function renderResults() {
    const list = document.getElementById('gsList');
    const foot = document.getElementById('gsFoot');
    if (!list) return;
    if (!lastQuery.trim()) {
      list.innerHTML = `<div class="gs-empty">${IC.search}<div>输入关键字，检索全部 <b>${DB.notes.length}</b> 篇笔记的标题、正文与标签</div><div class="gs-empty-tip">例：变量、闭包、梯度下降、#复习</div></div>`;
      foot.querySelector('.gs-foot-count').textContent = '';
      return;
    }
    if (!results.length) {
      list.innerHTML = `<div class="gs-empty">${IC.search}<div>没有找到包含「<b>${esc(lastQuery)}</b>」的笔记</div><div class="gs-empty-tip">换个关键字，或检查是否有错别字</div></div>`;
      foot.querySelector('.gs-foot-count').textContent = '0 条结果';
      return;
    }
    list.innerHTML = results.map(resultRow).join('');
    foot.querySelector('.gs-foot-count').textContent = results.length + ' 条结果';
    list.querySelectorAll('.gs-item').forEach((el) => {
      el.addEventListener('mousemove', () => { if (active !== +el.dataset.i) { active = +el.dataset.i; paintActive(); } });
      el.addEventListener('click', () => choose(+el.dataset.i));
    });
  }

  function paintActive() {
    const list = document.getElementById('gsList');
    if (!list) return;
    list.querySelectorAll('.gs-item').forEach((el) => el.classList.toggle('on', +el.dataset.i === active));
    const on = list.querySelector('.gs-item.on');
    if (on) {
      const r = on.getBoundingClientRect(), pr = list.getBoundingClientRect();
      if (r.bottom > pr.bottom) list.scrollTop += r.bottom - pr.bottom + 8;
      else if (r.top < pr.top) list.scrollTop -= pr.top - r.top + 8;
    }
  }

  /* ---------- 打开笔记 + 正文内高亮定位 ---------- */
  function choose(i) {
    const r = results[i];
    if (!r) return;
    const id = r.n.id, terms = r.terms;
    close();
    if (window.__openNote && window.__openNote(id) && window.__go) {
      window.__go('notes');
      setTimeout(() => highlightInNote(terms), 60);
    }
  }

  let JUMP_MATCHES = [];
  let JUMP_IDX = 0;

  function highlightInNote(terms) {
    const body = document.querySelector('.note-pane-body .nd-body');
    const main = document.getElementById('main');
    if (!body) return;
    // 清掉上一次的标记
    body.querySelectorAll('mark.gs-jump').forEach((m) => { m.replaceWith(document.createTextNode(m.textContent)); });
    const lows = terms.map((t) => t.toLowerCase());
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        if (!node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        const t = node.nodeValue.toLowerCase();
        return lows.some((q) => t.includes(q)) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });
    const matches = [], n = [], targets = [];
    let node, guard = 0;
    while ((node = walker.nextNode()) && guard++ < 800) targets.push(node);
    targets.forEach((tn) => {
      const text = tn.nodeValue;
      const low = text.toLowerCase();
      const hits = [];
      lows.forEach((q) => { let i = low.indexOf(q); while (i >= 0) { hits.push([i, i + q.length]); i = low.indexOf(q, i + q.length); } });
      if (!hits.length) return;
      hits.sort((a, b) => a[0] - b[0]);
      const frag = document.createDocumentFragment();
      let cur = 0;
      hits.forEach(([s, e]) => {
        if (s < cur) return;
        if (s > cur) frag.appendChild(document.createTextNode(text.slice(cur, s)));
        const mk = document.createElement('mark');
        mk.className = 'gs-jump';
        mk.textContent = text.slice(s, e);
        frag.appendChild(mk);
        matches.push(mk);
        cur = e;
      });
      if (cur < text.length) frag.appendChild(document.createTextNode(text.slice(cur)));
      tn.parentNode.replaceChild(frag, tn);
    });
    JUMP_MATCHES = matches;
    JUMP_IDX = 0;
    if (matches.length) { gotoMatch(0); mountJumpBar(terms.join(' ')); }
    else removeJumpBar();
  }

  // 跳到第 i 个命中：滚动定位 + 高亮当前项
  function gotoMatch(i) {
    if (!JUMP_MATCHES.length) return;
    JUMP_IDX = (i + JUMP_MATCHES.length) % JUMP_MATCHES.length;
    const main = document.getElementById('main');
    const el = JUMP_MATCHES[JUMP_IDX];
    if (!el || !main) return;
    JUMP_MATCHES.forEach((m) => m.classList.remove('cur', 'flash'));
    el.classList.add('cur', 'flash');
    setTimeout(() => el.classList.remove('flash'), 1200);
    const r = el.getBoundingClientRect(), mr = main.getBoundingClientRect();
    main.scrollTop += (r.top - mr.top) - main.clientHeight * 0.4;
    updateJumpBar();
  }
  function nextMatch() { gotoMatch(JUMP_IDX + 1); }
  function prevMatch() { gotoMatch(JUMP_IDX - 1); }

  function mountJumpBar(term) {
    removeJumpBar();
    const bar = document.createElement('div');
    bar.id = 'gsJumpBar';
    bar.className = 'gs-jumpbar';
    bar.innerHTML = `
      <span class="gsj-term">${IC.search}<b>${esc(term)}</b></span>
      <span class="gsj-count"></span>
      <button class="gsj-btn" data-dir="prev" title="上一处 (Shift+Enter)"><svg viewBox="0 0 24 24" fill="none"><path d="M6 15l6-6 6 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
      <button class="gsj-btn" data-dir="next" title="下一处 (Enter)"><svg viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
      <button class="gsj-btn gsj-close" title="关闭 (Esc)"><svg viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg></button>`;
    document.body.appendChild(bar);
    bar.querySelector('[data-dir="prev"]').addEventListener('click', prevMatch);
    bar.querySelector('[data-dir="next"]').addEventListener('click', nextMatch);
    bar.querySelector('.gsj-close').addEventListener('click', clearJump);
    updateJumpBar();
  }
  function updateJumpBar() {
    const bar = document.getElementById('gsJumpBar');
    if (bar) bar.querySelector('.gsj-count').textContent = (JUMP_IDX + 1) + ' / ' + JUMP_MATCHES.length;
  }
  function removeJumpBar() { const b = document.getElementById('gsJumpBar'); if (b) b.remove(); }
  function clearJump() {
    removeJumpBar();
    const body = document.querySelector('.note-pane-body .nd-body');
    if (body) body.querySelectorAll('mark.gs-jump').forEach((m) => { m.replaceWith(document.createTextNode(m.textContent)); });
    JUMP_MATCHES = [];
  }
  // 命中导航期间：Enter 下一处 / Shift+Enter 上一处 / Esc 退出
  document.addEventListener('keydown', (e) => {
    if (!JUMP_MATCHES.length || open) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (e.key === 'Enter') { e.preventDefault(); e.shiftKey ? prevMatch() : nextMatch(); }
    else if (e.key === 'Escape') { e.preventDefault(); clearJump(); }
  });

  /* ---------- 面板开关 ---------- */
  function ensureDom() {
    if (document.getElementById('gsBack')) return;
    const back = document.createElement('div');
    back.id = 'gsBack';
    back.className = 'gs-back';
    back.innerHTML = `
      <div class="gs-panel" role="dialog" aria-label="搜索笔记">
        <div class="gs-search">
          ${IC.search}
          <input id="gsInput" type="text" placeholder="搜索全部笔记 · 关键字 / 变量名 / 标签…" autocomplete="off" spellcheck="false" />
          <kbd class="gs-esc">ESC</kbd>
        </div>
        <div class="gs-list" id="gsList"></div>
        <div class="gs-foot" id="gsFoot">
          <div class="gs-foot-keys">
            <span><kbd>↑</kbd><kbd>↓</kbd> 选择</span>
            <span><kbd>↵</kbd> 打开</span>
            <span><kbd>Esc</kbd> 关闭</span>
          </div>
          <div class="gs-foot-count"></div>
        </div>
      </div>`;
    document.body.appendChild(back);
    back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
    const input = back.querySelector('#gsInput');
    let timer = null;
    input.addEventListener('input', () => {
      lastQuery = input.value;
      clearTimeout(timer);
      timer = setTimeout(() => { results = search(lastQuery); active = 0; renderResults(); }, 110);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); if (results.length) { active = (active + 1) % results.length; paintActive(); } }
      else if (e.key === 'ArrowUp') { e.preventDefault(); if (results.length) { active = (active - 1 + results.length) % results.length; paintActive(); } }
      else if (e.key === 'Enter') { e.preventDefault(); choose(active); }
      else if (e.key === 'Escape') { e.preventDefault(); close(); }
    });
  }

  function openPanel() {
    ensureDom();
    if (open) return;
    open = true;
    const back = document.getElementById('gsBack');
    back.classList.add('in');
    const input = document.getElementById('gsInput');
    lastQuery = input.value || '';
    results = lastQuery.trim() ? search(lastQuery) : [];
    active = 0;
    renderResults();
    setTimeout(() => { input.focus(); input.select(); }, 30);
  }
  function close() {
    open = false;
    const back = document.getElementById('gsBack');
    if (back) back.classList.remove('in');
  }
  window.__openSearch = openPanel;

  /* ---------- 全局快捷键 ⌘K / Ctrl+K ，以及 / 快捷键 ---------- */
  document.addEventListener('keydown', (e) => {
    if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      open ? close() : openPanel();
      return;
    }
    // 在非输入态下按 "/" 也能唤起
    if (e.key === '/' && !open) {
      const t = e.target;
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      if (!typing) { e.preventDefault(); openPanel(); }
    }
  });

  /* ---------- 顶栏触发按钮 ---------- */
  function mountTrigger() {
    const btn = document.getElementById('globalSearchBtn');
    if (btn) btn.addEventListener('click', () => openPanel());
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountTrigger);
  else mountTrigger();

  /* ---------- 离开当前笔记/切换页面时，清掉命中导航浮条 ---------- */
  function patchGo() {
    if (typeof window.__go === 'function' && !window.__go.__gsPatched) {
      const orig = window.__go;
      const wrapped = function () { clearJump(); return orig.apply(this, arguments); };
      wrapped.__gsPatched = true;
      window.__go = wrapped;
    }
  }
  patchGo();
  setTimeout(patchGo, 300);
  window.addEventListener('hashchange', () => setTimeout(clearJump, 0));

  /* ---------- 代码块「复制」按钮（全局委托，跨 rerender 生效） ---------- */
  document.addEventListener('click', (e) => {
    const btn = e.target.closest && e.target.closest('.code-copy');
    if (!btn) return;
    let code = '';
    try { code = decodeURIComponent(escape(atob(btn.dataset.code || ''))); } catch (err) { code = ''; }
    const done = () => { const t = btn.textContent; btn.textContent = '已复制'; btn.classList.add('ok'); setTimeout(() => { btn.textContent = t; btn.classList.remove('ok'); }, 1400); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code).then(done).catch(() => fallbackCopy(code, done));
    else fallbackCopy(code, done);
  });
  function fallbackCopy(text, cb) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); cb(); } catch (e) {}
    document.body.removeChild(ta);
  }
})();
