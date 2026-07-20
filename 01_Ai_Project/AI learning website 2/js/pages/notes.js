/* ===================== 树状笔记库（语雀式无限层级） ===================== */
let NOTE_SEL = null;            // 当前选中笔记 id
let NOTE_OPEN = null;           // null=浏览 | 'edit'
let NOTE_EDIT_ID = null;        // 编辑目标
let NOTE_NEW_PARENT = null;     // 新建子笔记时的父节点
let NOTE_SEARCH = '';
let NOTE_SEARCH_FOCUS = false;
let NOTE_SEARCH_TIMER = null;
const NOTE_COLLAPSED = {};      // id → true 表示折叠（内存态）
let NOTE_SELECT = false;        // 多选模式
const NOTE_CHECKED = new Set(); // 多选勾中的 id
let NOTE_SIDE = 'files';        // 左侧栏 tab：files(文件树) | outline(大纲)

// 从正文提取标题大纲（跳过代码块内的 # 注释），条目与渲染标题一一对应
function noteHeads(src) {
  const heads = []; let inFence = false;
  String(src || '').replace(/\r\n?/g, '\n').split('\n').forEach(l => {
    if (/^```/.test(l.trim())) { inFence = !inFence; return; }
    if (inFence) return;
    const h = l.match(/^(#{1,6})\s+(.*)$/); if (h) heads.push({ lvl: h[1].length, text: h[2].trim() });
  });
  return heads;
}

/* ---- 模块信息 / 归一 ---- */
function noteModInfo(id) {
  const found = DB.modules.find(m => m.id === id);
  if (found) return found;
  let h = 0; for (const c of String(id || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return { label: id || '未分类', dot: `hsl(${h % 360} 64% 60%)` };
}
function resolveMod(v) {
  v = String(v || '').trim();
  if (DB.modules.some(m => m.id === v)) return v;
  const byLabel = DB.modules.find(m => m.label === v);
  return byLabel ? byLabel.id : (v || 'base');
}
function noteModPills() {
  const pills = DB.modules.map(m => ({ id: m.id, label: m.label }));
  [...new Set(DB.notes.map(n => n.mod))].forEach(id => {
    if (id && !DB.modules.some(m => m.id === id)) pills.push({ id, label: id });
  });
  return pills;
}

/* ---- 树工具 ---- */
function noteChildren(pid) {
  return DB.notes.filter(n => (n.parentId || '') === (pid || ''))
    .sort((a, b) => (b.pin ? 1 : 0) - (a.pin ? 1 : 0) || (a.createdAt || 0) - (b.createdAt || 0));
}
function noteDescendants(id) {
  const out = [];
  (function rec(p) { DB.notes.filter(n => (n.parentId || '') === p).forEach(c => { out.push(c.id); rec(c.id); }); })(id);
  return out;
}
function notePath(n) {
  const path = [], seen = new Set();
  let cur = n;
  while (cur && !seen.has(cur.id)) { seen.add(cur.id); path.unshift(cur); cur = cur.parentId ? DB.notes.find(x => x.id === cur.parentId) : null; }
  return path;
}
function expandAncestors(id) {
  let n = DB.notes.find(x => x.id === id);
  while (n && n.parentId) { delete NOTE_COLLAPSED[n.parentId]; n = DB.notes.find(x => x.id === n.parentId); }
}

window.__openNote = function (id) {
  if (!DB.notes.some(n => n.id === id)) return false;
  NOTE_SEL = id; NOTE_OPEN = null; expandAncestors(id);
  return true;
};

/* ---- 搜索可见集（命中项 + 其祖先） ---- */
function searchSets() {
  if (!NOTE_SEARCH) return null;
  const q = NOTE_SEARCH.toLowerCase();
  const match = new Set(DB.notes.filter(n =>
    (n.title || '').toLowerCase().includes(q) || (n.md || '').toLowerCase().includes(q) ||
    (n.preview || '').toLowerCase().includes(q) || (n.tags || []).some(t => t.toLowerCase().includes(q))
  ).map(n => n.id));
  const vis = new Set(match);
  match.forEach(id => { let n = DB.notes.find(x => x.id === id); while (n && n.parentId) { vis.add(n.parentId); n = DB.notes.find(x => x.id === n.parentId); } });
  return { match, vis };
}

window.renderNotes = function () {
  if (NOTE_OPEN === 'edit') return renderNoteEditor();

  const ss = searchSets();
  // 选中项兜底：失效时取第一个根节点
  if (!DB.notes.some(n => n.id === NOTE_SEL)) NOTE_SEL = (noteChildren('')[0] || {}).id || null;

  const treeNode = (n, depth) => {
    if (ss && !ss.vis.has(n.id)) return '';
    const kids = noteChildren(n.id);
    const hasKids = kids.length > 0;
    const expanded = ss ? true : !NOTE_COLLAPSED[n.id];
    const dim = ss && !ss.match.has(n.id);
    const checked = NOTE_CHECKED.has(n.id);
    return `
      <div class="tree-row ${n.id === NOTE_SEL && !NOTE_SELECT ? 'on' : ''} ${checked ? 'checked' : ''} ${dim ? 'dim' : ''}" data-treesel="${n.id}" role="button" tabindex="0" style="padding-left:${depth * 15 + 8}px">
        ${NOTE_SELECT ? `<span class="tree-check ${checked ? 'on' : ''}">${checked ? IC.check : ''}</span>` : ''}
        <span class="tree-tw ${hasKids ? (expanded ? 'open' : '') : 'leaf'}" data-treetoggle="${n.id}">${hasKids ? IC.chevron : ''}</span>
        <span class="tree-ic">${hasKids ? IC.folder : IC.doc}</span>
        <span class="tree-name">${MD.esc(n.title)}</span>
        ${n.pin ? `<span class="tree-pin">${IC.pin}</span>` : ''}
        ${NOTE_SELECT ? '' : `<span class="tree-act" data-treeadd="${n.id}" title="新建子笔记">${IC.plus}</span>`}
      </div>
      ${hasKids && expanded ? kids.map(k => treeNode(k, depth + 1)).join('') : ''}`;
  };

  const roots = noteChildren('');
  const treeHTML = roots.length
    ? roots.map(n => treeNode(n, 0)).join('')
    : '<div class="tree-empty">还没有笔记，点上方「新建笔记」</div>';

  return `
    <div class="page-head">
      <div>
        <h1 class="page-title">笔记库</h1>
        <div class="page-sub">树状目录 · 多层级组织 · 共 <b>${DB.notes.length}</b> 篇</div>
      </div>
      <div class="kbar">
        <button class="btn ghost" id="importNote">${IC.upload}<span>导入 MD</span></button>
        <input type="file" id="importNoteFile" accept=".md,.markdown,.txt" style="display:none" />
        <button class="btn primary" id="addNote">${IC.plus}<span>新建笔记</span></button>
      </div>
    </div>

    <div class="notes-tree-layout">
      <aside class="card note-side">
        <div class="side-tabs">
          <button class="side-tab ${NOTE_SIDE === 'files' ? 'on' : ''}" data-side="files">${IC.folder}<span>文件</span></button>
          <button class="side-tab ${NOTE_SIDE === 'outline' ? 'on' : ''}" data-side="outline">${IC.list}<span>大纲</span></button>
        </div>
        ${NOTE_SIDE === 'files' ? `
          <div class="tree-toolbar">
            <div class="search tree-search" id="noteSearch">${IC.search}<input placeholder="搜索全部笔记…" value="${MD.esc(NOTE_SEARCH)}" /></div>
            <button class="icon-btn sm ${NOTE_SELECT ? 'on' : ''}" id="treeSelect" title="多选">${IC.check}</button>
            <button class="icon-btn sm" id="treeCollapseAll" title="全部折叠">${IC.list}</button>
          </div>
          ${NOTE_SELECT ? `
            <div class="tree-batchbar">
              <span class="tbb-count">已选 <b>${NOTE_CHECKED.size}</b></span>
              <button class="tbb-link" id="batchAll">全选</button>
              <div style="flex:1"></div>
              <button class="btn ghost sm" id="batchMove" ${NOTE_CHECKED.size ? '' : 'disabled'}>${IC.folder}<span>移动</span></button>
              <button class="btn danger ghost sm" id="batchDel" ${NOTE_CHECKED.size ? '' : 'disabled'}>${IC.trash}<span>删除</span></button>
              <button class="btn ghost sm" id="batchExit">退出</button>
            </div>` : ''}
          <div class="tree-scroll" id="noteTree">${treeHTML}</div>
        ` : `<div class="tree-scroll">${renderSideOutline()}</div>`}
      </aside>
      <section class="note-pane">${renderNotePane()}</section>
    </div>`;
};

/* ---- 左侧「大纲」tab 内容 ---- */
function renderSideOutline() {
  const n = DB.notes.find(x => x.id === NOTE_SEL);
  if (!n) return '<div class="tree-empty">请先在「文件」里选择一篇笔记</div>';
  const src = n.md || ('# ' + n.title);
  const heads = noteHeads(src);
  if (!heads.length) return '<div class="tree-empty">该笔记暂无标题大纲</div>';
  const minLvl = Math.min(...heads.map(h => h.lvl));
  return `<div class="side-outline">${heads.map((h, i) =>
    `<a class="toc-item" data-tocidx="${i}" style="padding-left:${(h.lvl - minLvl) * 13 + 4}px">${MD.esc(h.text)}</a>`
  ).join('')}</div>`;
}

/* ---- 右侧内容面板 ---- */
function renderNotePane() {
  const n = DB.notes.find(x => x.id === NOTE_SEL);
  if (!n) return `<div class="card note-pane-empty">${IC.doc}<div>从左侧选择一篇笔记，或点「新建笔记」开始</div></div>`;

  const m = noteModInfo(n.mod);
  const path = notePath(n);
  const kids = noteChildren(n.id);
  const src = n.md || ('# ' + n.title + '\n\n' + (n.preview || '（暂无正文，点「编辑」补充内容）'));
  const html = window.MD ? MD.render(src) : '';

  const crumb = path.map((p, i) =>
    `<span class="crumb ${i === path.length - 1 ? 'cur' : ''}" data-treesel="${p.id}" role="button" tabindex="0">${MD.esc(p.title)}</span>`
  ).join('<span class="crumb-sep">/</span>');

  return `
    <div class="note-pane-head">
      <div class="np-crumb">${crumb}</div>
      <div class="np-actions">
        <button class="btn ghost sm" data-noteadd="${n.id}" title="新建子笔记">${IC.plus}<span>子笔记</span></button>
        <button class="btn ghost sm" id="pinNote" title="${n.pin ? '取消置顶' : '置顶'}">${IC.pin}</button>
        <button class="btn ghost sm" id="exportNote">${IC.download}<span>导出</span></button>
        <button class="btn ghost sm" id="delNote" style="color:var(--red)">${IC.trash}</button>
        <button class="btn primary sm" id="editNote">${IC.edit}<span>编辑</span></button>
      </div>
    </div>

    <div class="note-pane-body">
      <article class="note-doc card">
        <div class="nd-head">
          <span class="chip" style="border-color:transparent;background:color-mix(in oklab, ${m.dot} 16%, transparent);color:${m.dot}">${MD.esc(m.label)}</span>
          ${(() => { const s = n.stageId && DB.stages.find(x => x.id === n.stageId); return s ? `<span class="chip">${IC.tasks}<span style="margin-left:4px">${MD.esc(s.theme)}</span></span>` : ''; })()}
          <span class="note-time mono">${MD.esc(Stats.timeLabel(n))}</span>
        </div>
        ${(n.tags || []).length ? `<div class="note-tags" style="margin:12px 0 2px">${(n.tags || []).map(t => `<span class="tag-sm mono">#${MD.esc(t)}</span>`).join('')}</div>` : ''}
        <div class="divider"></div>
        <div class="nd-body">${html}</div>

        ${kids.length ? `
          <div class="divider"></div>
          <div class="section-title">子笔记<span class="meta">${kids.length} 篇</span></div>
          <div class="subnote-list">${kids.map(k => `
            <div class="subnote" data-treesel="${k.id}" role="button" tabindex="0">
              <span class="tree-ic">${noteChildren(k.id).length ? IC.folder : IC.doc}</span>
              <span class="sn-title">${MD.esc(k.title)}</span>
              <span class="rn-arrow">${IC.chevron}</span>
            </div>`).join('')}</div>` : ''}
      </article>
    </div>`;
}

/* ---- 编辑器（含父节点选择 = 移动/挂靠） ---- */
function renderNoteEditor() {
  const isNew = !NOTE_EDIT_ID;
  const parent = NOTE_NEW_PARENT ? DB.notes.find(x => x.id === NOTE_NEW_PARENT) : null;
  const n = isNew
    ? { title: '', mod: (parent && parent.mod) || 'llm', md: '', tags: [], stageId: (parent && parent.stageId) || '', parentId: NOTE_NEW_PARENT || '' }
    : DB.notes.find(x => x.id === NOTE_EDIT_ID);
  const modListOpts = noteModPills().map(m => `<option value="${MD.esc(m.label)}"></option>`).join('');

  // 父节点候选：排除自己及其后代
  const exclude = isNew ? new Set() : new Set([n.id, ...noteDescendants(n.id)]);
  const parentOpts = [['', '（顶层）']].concat(
    DB.notes.filter(x => !exclude.has(x.id)).map(x => [x.id, notePath(x).map(p => p.title).join(' / ')])
  );

  return `
    <div class="page-head" style="margin-bottom:18px">
      <div>
        <h1 class="page-title">${isNew ? (parent ? '新建子笔记' : '新建笔记') : '编辑笔记'}</h1>
        <div class="page-sub">${parent ? '父节点：' + MD.esc(parent.title) + ' · ' : ''}所见即所得 · 边写边渲染</div>
      </div>
      <div class="kbar">
        <button class="btn ghost" id="cancelEdit">取消</button>
        <button class="btn primary" id="saveNote">${IC.check}<span>保存</span></button>
      </div>
    </div>

    <div class="wys-shell card">
      <div class="editor-head">
        <input id="noteTitle" type="text" placeholder="无标题笔记" class="editor-title-input" value="${MD.esc(n.title)}" />
        <div class="editor-meta">
          <div class="ef">
            <label>${IC.layers}模块</label>
            <input id="noteMod" class="editor-input" list="modList" placeholder="可自定义，如 Python" value="${MD.esc(noteModInfo(n.mod).label)}" />
            <datalist id="modList">${modListOpts}</datalist>
          </div>
          <div class="ef">
            <label>#标签</label>
            <input id="noteTags" type="text" placeholder="逗号分隔" class="editor-input" value="${MD.esc((n.tags || []).join(','))}" />
          </div>
          <div class="ef">
            <label>${IC.folder}位置</label>
            <select id="noteParent" class="editor-select" title="所在位置（父节点）">
              ${parentOpts.map(([v, l]) => `<option value="${v}" ${v === (n.parentId || '') ? 'selected' : ''}>${MD.esc(l)}</option>`).join('')}
            </select>
          </div>
          <div class="ef">
            <label>${IC.tasks}关联阶段</label>
            <select id="noteStage" class="editor-select" title="关联学习阶段">
              <option value="">不关联</option>
              ${DB.stages.map(s => `<option value="${s.id}" ${s.id === n.stageId ? 'selected' : ''}>${MD.esc(s.name + ' · ' + s.theme)}</option>`).join('')}
            </select>
          </div>
        </div>
      </div>
      <div class="wys-toolbar" id="wysToolbar">
        <button data-wb="h1" title="一级标题">H1</button>
        <button data-wb="h2" title="二级标题">H2</button>
        <button data-wb="h3" title="三级标题">H3</button>
        <span class="wys-sep"></span>
        <button data-wf="bold" title="加粗 (⌘B)"><b>B</b></button>
        <button data-wf="italic" title="斜体 (⌘I)"><i>I</i></button>
        <button data-wf="code" title="行内代码 (⌘E)">${IC.code}</button>
        <span class="wys-sep"></span>
        <button data-wb="ul" title="无序列表">${IC.list}</button>
        <button data-wb="blockquote" title="引用">❝</button>
        <button data-wb="pre" title="代码块">${'{ }'}</button>
        <button id="wysImg" title="插入图片（也可直接粘贴截图）">${IC.image}</button>
        <input type="file" id="wysImgFile" accept="image/*" style="display:none" />
        <span class="wys-sep"></span>
        <button id="aiOrganize" class="wys-ai" title="AI 整理">${IC.sparkles}<span>AI 整理</span></button>
        <span class="wys-hint">所见即所得 · 行首敲 <b># / - / &gt;</b> 即转换</span>
      </div>
      <div id="aiOrganizeOut" style="padding:0 28px"></div>
      <div class="wys-editor md-preview" id="wysEditor"></div>
    </div>`;
}

window.__bindPage = window.__bindPage || {};
window.__bindPage.notes = function () {
  /* ---------- 编辑器 ---------- */
  if (NOTE_OPEN === 'edit') return bindEditor();

  /* ---------- 左侧栏 文件 / 大纲 tab 切换 ---------- */
  document.querySelectorAll('[data-side]').forEach(b => b.addEventListener('click', () => {
    if (NOTE_SIDE === b.dataset.side) return;
    NOTE_SIDE = b.dataset.side; window.__rerender();
  }));

  /* ---------- 浏览：搜索 ---------- */
  const searchInput = document.querySelector('#noteSearch input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      NOTE_SEARCH = e.target.value; NOTE_SEARCH_FOCUS = true;
      clearTimeout(NOTE_SEARCH_TIMER);
      NOTE_SEARCH_TIMER = setTimeout(() => window.__rerender(), 150);
    });
    if (NOTE_SEARCH_FOCUS) { NOTE_SEARCH_FOCUS = false; searchInput.focus(); const l = searchInput.value.length; searchInput.setSelectionRange(l, l); }
  }
  const collapseAll = document.getElementById('treeCollapseAll');
  if (collapseAll) collapseAll.addEventListener('click', () => { DB.notes.forEach(n => { if (noteChildren(n.id).length) NOTE_COLLAPSED[n.id] = true; }); window.__rerender(); });

  /* ---------- 多选模式 + 批量操作 ---------- */
  const selBtn = document.getElementById('treeSelect');
  if (selBtn) selBtn.addEventListener('click', () => { NOTE_SELECT = !NOTE_SELECT; NOTE_CHECKED.clear(); window.__rerender(); });
  const batchExit = document.getElementById('batchExit');
  if (batchExit) batchExit.addEventListener('click', () => { NOTE_SELECT = false; NOTE_CHECKED.clear(); window.__rerender(); });
  const batchAll = document.getElementById('batchAll');
  if (batchAll) batchAll.addEventListener('click', () => {
    const pool = NOTE_SEARCH ? [...searchSets().match] : DB.notes.map(n => n.id);
    if (pool.length && pool.every(id => NOTE_CHECKED.has(id))) pool.forEach(id => NOTE_CHECKED.delete(id));
    else pool.forEach(id => NOTE_CHECKED.add(id));
    window.__rerender();
  });
  const batchDel = document.getElementById('batchDel');
  if (batchDel) batchDel.addEventListener('click', () => {
    const dead = new Set(NOTE_CHECKED); if (!dead.size) return;
    const survivingParent = (pid) => { let p = pid || ''; while (p && dead.has(p)) { const pn = DB.notes.find(x => x.id === p); p = pn ? (pn.parentId || '') : ''; } return p; };
    window.__confirm(`确定删除选中的 ${dead.size} 篇笔记？其未选中的子笔记会上提到最近的上级。`, { danger: true, confirmLabel: '删除' }).then(ok => {
      if (!ok) return;
      DB.notes.forEach(n => { if (!dead.has(n.id) && dead.has(n.parentId)) n.parentId = survivingParent(n.parentId); });
      DB.notes = DB.notes.filter(n => !dead.has(n.id));
      if (dead.has(NOTE_SEL)) NOTE_SEL = (noteChildren('')[0] || {}).id || null;
      const cnt = dead.size; NOTE_CHECKED.clear(); NOTE_SELECT = false;
      window.toast(`已删除 ${cnt} 篇笔记`, 'ok'); window.__rerender();
    });
  });
  const batchMove = document.getElementById('batchMove');
  if (batchMove) batchMove.addEventListener('click', () => {
    if (!NOTE_CHECKED.size) return;
    const blocked = new Set(NOTE_CHECKED);
    NOTE_CHECKED.forEach(id => noteDescendants(id).forEach(d => blocked.add(d)));
    const opts = [['', '（顶层）']].concat(DB.notes.filter(n => !blocked.has(n.id)).map(n => [n.id, notePath(n).map(p => p.title).join(' / ')]));
    window.__formModal('批量移动到', [{ key: 'parent', label: '目标位置', type: 'select', options: opts, hint: '选中项中的父子关系会保留' }], {
      submitLabel: '移动', onSubmit(v) {
        NOTE_CHECKED.forEach(id => { const n = DB.notes.find(x => x.id === id); if (n && !NOTE_CHECKED.has(n.parentId)) n.parentId = v.parent || ''; });
        const cnt = NOTE_CHECKED.size; NOTE_CHECKED.clear(); NOTE_SELECT = false;
        window.toast(`已移动 ${cnt} 篇笔记`, 'ok'); window.__rerender();
      }
    });
  });

  /* ---------- 树：选中 / 展开折叠 / 加子 ---------- */
  document.querySelectorAll('[data-treetoggle]').forEach(el => el.addEventListener('click', (e) => {
    e.stopPropagation();
    const id = el.dataset.treetoggle;
    if (!noteChildren(id).length) return;
    NOTE_COLLAPSED[id] = !NOTE_COLLAPSED[id];
    window.__rerender();
  }));
  document.querySelectorAll('[data-treesel]').forEach(el => el.addEventListener('click', (e) => {
    if (e.target.closest('[data-treetoggle]') || e.target.closest('[data-treeadd]')) return;
    if (NOTE_SELECT) {
      const id = el.dataset.treesel;
      NOTE_CHECKED.has(id) ? NOTE_CHECKED.delete(id) : NOTE_CHECKED.add(id);
      window.__rerender(); return;
    }
    NOTE_SEL = el.dataset.treesel; window.__rerender();
  }));
  document.querySelectorAll('[data-treeadd], [data-noteadd]').forEach(el => el.addEventListener('click', (e) => {
    e.stopPropagation();
    NOTE_NEW_PARENT = el.dataset.treeadd || el.dataset.noteadd;
    NOTE_EDIT_ID = null; NOTE_OPEN = 'edit'; window.__rerender();
  }));

  /* ---------- 新建根笔记 ---------- */
  const addNote = document.getElementById('addNote');
  if (addNote) addNote.addEventListener('click', () => { NOTE_NEW_PARENT = null; NOTE_EDIT_ID = null; NOTE_OPEN = 'edit'; window.__rerender(); });

  /* ---------- 导入 MD（作为根笔记） ---------- */
  const impBtn = document.getElementById('importNote');
  const impFile = document.getElementById('importNoteFile');
  if (impBtn && impFile) {
    impBtn.addEventListener('click', () => impFile.click());
    impFile.addEventListener('change', async () => {
      const f = impFile.files[0]; if (!f) return;
      try {
        const text = await window.Importers.readText(f);
        const note = window.Importers.noteFromMd(text, f.name);
        note.parentId = '';
        DB.notes.push(note); NOTE_SEL = note.id;
        window.toast('已导入笔记「' + note.title + '」', 'ok');
        window.__rerender();
      } catch (e) { window.toast('导入失败：' + e.message, 'err'); }
    });
  }

  /* ---------- 选中笔记的操作 ---------- */
  const editNote = document.getElementById('editNote');
  if (editNote) editNote.addEventListener('click', () => { NOTE_EDIT_ID = NOTE_SEL; NOTE_NEW_PARENT = null; NOTE_OPEN = 'edit'; window.__rerender(); });

  const pinNote = document.getElementById('pinNote');
  if (pinNote) pinNote.addEventListener('click', () => { const n = DB.notes.find(x => x.id === NOTE_SEL); if (n) { n.pin = !n.pin; window.__rerender(); } });

  const expNote = document.getElementById('exportNote');
  if (expNote) expNote.addEventListener('click', () => {
    const n = DB.notes.find(x => x.id === NOTE_SEL); if (!n) return;
    const fname = (n.title || 'note').replace(/[\/\\:*?"<>|]/g, '_') + '.md';
    const blob = new Blob([n.md || ''], { type: 'text/markdown;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fname;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 100);
    window.toast('已导出「' + n.title + '」', 'ok');
  });

  const delNote = document.getElementById('delNote');
  if (delNote) delNote.addEventListener('click', () => {
    const n = DB.notes.find(x => x.id === NOTE_SEL); if (!n) return;
    const kids = noteChildren(n.id);
    const msg = kids.length ? `删除「${n.title}」？其下 ${kids.length} 篇子笔记会上提到上一层（不删除）。` : `确定删除「${n.title}」？`;
    window.__confirm(msg, { danger: true, confirmLabel: '删除' }).then(ok => {
      if (!ok) return;
      DB.notes.forEach(x => { if (x.parentId === n.id) x.parentId = n.parentId || ''; }); // 子节点上提
      DB.notes = DB.notes.filter(x => x.id !== n.id);
      NOTE_SEL = n.parentId || (noteChildren('')[0] || {}).id || null;
      window.toast('已删除笔记', 'ok'); window.__rerender();
    });
  });

  /* ---------- 大纲跳转 ---------- */
  const pane = document.querySelector('.note-pane');
  document.querySelectorAll('[data-tocidx]').forEach(a => a.addEventListener('click', () => {
    const hs = pane.querySelectorAll('.nd-body h1,.nd-body h2,.nd-body h3,.nd-body h4,.nd-body h5,.nd-body h6');
    const el = hs[+a.dataset.tocidx];
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
};

function bindEditor() {
  const titleInput = document.getElementById('noteTitle');
  const modSelect = document.getElementById('noteMod');
  const tagsInput = document.getElementById('noteTags');
  const stageSelect = document.getElementById('noteStage');
  const parentSelect = document.getElementById('noteParent');
  const editor = document.getElementById('wysEditor');

  // 初始 Markdown：编辑取已有，新建为空
  const initMd = NOTE_EDIT_ID ? (DB.notes.find(x => x.id === NOTE_EDIT_ID) || {}).md || '' : '';
  window.WYS.mount(editor, initMd);
  const getMd = () => window.WYS.editableToMd(editor);

  // 工具栏：块级 / 行内
  document.querySelectorAll('#wysToolbar [data-wb]').forEach(b => b.addEventListener('mousedown', (e) => { e.preventDefault(); editor.focus(); window.WYS.setBlock(editor, b.dataset.wb); setTimeout(syncToolbar, 0); }));
  document.querySelectorAll('#wysToolbar [data-wf]').forEach(b => b.addEventListener('mousedown', (e) => { e.preventDefault(); editor.focus(); window.WYS.format(b.dataset.wf); setTimeout(syncToolbar, 0); }));

  // 工具栏激活态：光标所在块/行内格式高亮（所见即所得反馈）
  const tbBtns = [...document.querySelectorAll('#wysToolbar [data-wb], #wysToolbar [data-wf]')];
  function syncToolbar() {
    if (!document.body.contains(editor)) { document.removeEventListener('selectionchange', syncToolbar); return; }
    const sel = window.getSelection();
    const inEditor = sel.rangeCount && editor.contains(sel.anchorNode);
    let blockTag = '';
    if (inEditor) { let n = sel.anchorNode; while (n && n.parentNode !== editor) n = n.parentNode; if (n && n.nodeType === 1) blockTag = n.tagName.toLowerCase(); }
    let bold = false, italic = false;
    if (inEditor) {
      let n = sel.anchorNode;
      while (n && n !== editor) {
        if (n.nodeType === 1) { const tg = n.tagName.toLowerCase(); if (tg === 'strong' || tg === 'b') bold = true; if (tg === 'em' || tg === 'i') italic = true; }
        n = n.parentNode;
      }
    }
    tbBtns.forEach(b => {
      let on = false;
      if (b.dataset.wb) on = (b.dataset.wb === blockTag);
      else if (b.dataset.wf === 'bold') on = bold;
      else if (b.dataset.wf === 'italic') on = italic;
      b.classList.toggle('on', !!on);
    });
  }
  document.addEventListener('selectionchange', syncToolbar);
  editor.addEventListener('keyup', syncToolbar);
  editor.addEventListener('mouseup', syncToolbar);
  syncToolbar();

  // 插入图片（选图）
  const imgBtn = document.getElementById('wysImg');
  const imgFile = document.getElementById('wysImgFile');
  if (imgBtn && imgFile) {
    imgBtn.addEventListener('mousedown', (e) => e.preventDefault());
    imgBtn.addEventListener('click', () => imgFile.click());
    imgFile.addEventListener('change', async () => {
      const f = imgFile.files[0]; if (!f) return;
      try { const url = await window.WYS.fileToDataURL(f); editor.focus(); window.WYS.insertImage(url, f.name.replace(/\.[^.]+$/, '')); }
      catch (e) { window.toast('图片插入失败：' + e.message, 'err'); }
      imgFile.value = '';
    });
  }

  // AI 整理：把当前内容整理成 Markdown 再重渲染进编辑器
  const aiOrg = document.getElementById('aiOrganize');
  if (aiOrg) aiOrg.addEventListener('mousedown', (e) => e.preventDefault());
  if (aiOrg) aiOrg.addEventListener('click', async () => {
    if (!window.AI.cfg().enabled) { window.toast('请先在 AI 设置中启用本地 Ollama', 'err'); return; }
    const raw = getMd().trim() || titleInput.value.trim();
    if (!raw) { window.toast('请先输入一些内容或标题', 'err'); return; }
    const out = document.getElementById('aiOrganizeOut');
    out.innerHTML = '<div class="ai-out loading"><span class="spin"></span> AI 正在整理笔记…</div>';
    try {
      const md = await window.AI.organizeNote(raw);
      editor.innerHTML = window.WYS.mdToEditable(md);
      out.innerHTML = '<div class="ai-out"><div class="ai-out-head">' + IC.sparkles + '已整理并写入编辑区</div>可继续手动调整后保存。</div>';
    } catch (e) { out.innerHTML = '<div class="ai-out" style="color:var(--red)">⚠ ' + e.message + '</div>'; }
  });

  document.getElementById('saveNote').addEventListener('click', () => {
    const md = getMd();
    const tags = tagsInput.value.split(',').map(t => t.trim()).filter(Boolean);
    const title = titleInput.value.trim() || (window.MD && MD.firstHeading(md)) || '未命名笔记';
    const stageId = stageSelect ? stageSelect.value : '';
    const parentId = parentSelect ? parentSelect.value : '';
    const preview = window.MD ? MD.plainPreview(md, 80) : md.slice(0, 80);
    if (NOTE_EDIT_ID) {
      const n = DB.notes.find(x => x.id === NOTE_EDIT_ID);
      Object.assign(n, { title, mod: resolveMod(modSelect.value), tags, stageId, parentId, md, preview, code: md.includes('```') });
      NOTE_SEL = n.id;
    } else {
      const id = 'n' + Date.now();
      DB.notes.push({ id, title, mod: resolveMod(modSelect.value), stageId, parentId, time: '刚刚', createdAt: Date.now(), tags, preview, code: md.includes('```'), pin: false, md });
      NOTE_SEL = id; expandAncestors(id);
    }
    NOTE_NEW_PARENT = null; NOTE_OPEN = null;
    window.toast('已保存', 'ok'); window.__rerender();
  });

  document.getElementById('cancelEdit').addEventListener('click', () => { NOTE_NEW_PARENT = null; NOTE_OPEN = null; window.__rerender(); });
}
