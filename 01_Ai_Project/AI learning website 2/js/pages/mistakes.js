/* ===================== 错题本 & 盲区复盘 ===================== */
let MISTAKE_SEL = 'm1';
let MISTAKE_FILTER = 'all';
let MK_SELECT = false;
const MK_CHECKED = new Set();
// 间隔重复复习会话状态
let REVIEW_MODE = false;
let REVIEW_QUEUE = [];   // 本次会话的错题 id 队列
let REVIEW_IDX = 0;
let REVIEW_SHOW = false; // 是否已揭示答案

// 当前筛选范围内的错题（供列表 / 待复习计数 / 复习队列共用）
function mistakeScope() {
  if (MISTAKE_FILTER === 'all') return DB.mistakes;
  if (MISTAKE_FILTER === 'none') return DB.mistakes.filter(m => !m.stageId);
  return DB.mistakes.filter(m => m.stageId === MISTAKE_FILTER);
}

window.renderMistakes = function () {
  const mod = (id) => DB.modules.find(m => m.id === id) || { label: id, dot: '#888' };
  if (REVIEW_MODE) return renderReviewSession(mod);
  // 与笔记库一致：筛选项从 DB.modules 派生，不再硬编码
  // 按阶段筛错题（绑定来源题所属阶段）；含一个「未归类」桶
  const usedStages = DB.stages.filter(s => DB.mistakes.some(m => m.stageId === s.id));
  const hasUnstaged = DB.mistakes.some(m => !m.stageId);
  const filters = [['all', '全部']]
    .concat(usedStages.map(s => [s.id, s.theme]))
    .concat(hasUnstaged ? [['none', '未归类']] : []);
  const list = mistakeScope();
  // 选中项必须在当前筛选结果内，否则回退到列表第一条
  const sel = list.find(m => m.id === MISTAKE_SEL) || list[0];

  // 全局空状态：一道错题都没有时才走这里；筛选为空另行处理（保留筛选 pill）
  if (!DB.mistakes.length) {
    return `
    <div class="page-head">
      <div>
        <h1 class="page-title">错题本 & 盲区复盘</h1>
        <div class="page-sub">归档自测错题，定位知识盲区 · 暂无错题</div>
      </div>
      <div class="kbar"><button class="btn primary" id="mkAdd">${IC.plus}<span>录入错题</span></button></div>
    </div>
    <div class="card empty-card">
      还没有错题。刷题答错会自动归档到这里，也可以手动录入。
    </div>`;
  }

  const dueCount = window.SRS ? SRS.due(list.filter(m => !m.mastered)).length : 0;
  const scopeLabel = MISTAKE_FILTER === 'all' ? '' : '（本范围）';

  const item = (m) => `
    <div class="mk-item ${sel && m.id === sel.id && !MK_SELECT ? 'on' : ''} ${MK_CHECKED.has(m.id) ? 'checked' : ''} ${m.mastered ? 'mastered' : ''}" data-mk="${m.id}" role="button" tabindex="0">
      <div class="mk-top">
        ${MK_SELECT ? `<span class="tree-check ${MK_CHECKED.has(m.id) ? 'on' : ''}">${MK_CHECKED.has(m.id) ? IC.check : ''}</span>` : ''}
        <span class="chip" style="border-color:transparent;background:color-mix(in oklab, ${mod(m.mod).dot} 16%, transparent);color:${mod(m.mod).dot}">${MD.esc(mod(m.mod).label)}</span>
        <span class="chip red">${MD.esc(m.type)}</span>
        ${m.star ? `<span class="mk-star on">${IC.star}</span>` : ''}
        ${m.mastered ? `<span class="chip green">已掌握</span>` : ''}
        <span class="note-time mono" style="margin-left:auto">${MD.esc(Stats.timeLabel(m))}</span>
      </div>
      <div class="mk-q">${MD.esc(m.q)}</div>
    </div>`;

  return `
    <div class="page-head">
      <div>
        <h1 class="page-title">错题本 & 盲区复盘</h1>
        <div class="page-sub">归档自测错题，定位知识盲区 · 共 <b>${DB.mistakes.length}</b> 题 · 待复盘 <b>${DB.mistakes.filter(m=>!m.mastered).length}</b> 题 · 今日待复习 <b style="color:var(--accent)">${dueCount}</b> 题</div>
      </div>
      <div class="kbar">
        <button class="btn ghost ${MK_SELECT ? 'on' : ''}" id="mkSelect">${IC.check}<span>多选</span></button>
        <button class="btn ghost" id="mkAdd">${IC.plus}<span>录入错题</span></button>
        <button class="btn primary" id="mkReview" ${dueCount ? '' : 'disabled style="opacity:.5"'}>${IC.refresh}<span>开始复习${scopeLabel} (${dueCount})</span></button>
      </div>
    </div>

    ${MK_SELECT ? `
      <div class="tree-batchbar" style="margin-bottom:14px">
        <span class="tbb-count">已选 <b>${MK_CHECKED.size}</b></span>
        <button class="tbb-link" id="mkBatchAll">全选当前</button>
        <div style="flex:1"></div>
        <button class="btn ghost sm" id="mkBatchMaster" ${MK_CHECKED.size ? '' : 'disabled'}>${IC.check}<span>标记已掌握</span></button>
        <button class="btn danger ghost sm" id="mkBatchDel" ${MK_CHECKED.size ? '' : 'disabled'}>${IC.trash}<span>删除</span></button>
        <button class="btn ghost sm" id="mkBatchExit">退出</button>
      </div>` : ''}

    <div class="tag-filter">${filters.map(([k,l])=>`<div class="pill ${MISTAKE_FILTER===k?'on':''}" data-mkfilter="${k}" role="button" tabindex="0">${l}</div>`).join('')}</div>

    <div class="mk-layout">
      <div class="mk-list">${list.length ? list.map(item).join('') : '<div class="empty">该模块下暂无错题</div>'}</div>

      ${sel ? `<div class="mk-detail card">
        <div class="mkd-head">
          <span class="chip" style="border-color:transparent;background:color-mix(in oklab, ${mod(sel.mod).dot} 16%, transparent);color:${mod(sel.mod).dot}">${MD.esc(mod(sel.mod).label)}</span>
          <span class="chip red">${MD.esc(sel.type)}</span>
          ${(() => { const s = sel.stageId && DB.stages.find(x => x.id === sel.stageId); return s ? `<span class="chip">${MD.esc(s.theme)}</span>` : ''; })()}
          <span class="note-time mono" style="margin-left:auto">${MD.esc(Stats.timeLabel(sel))}</span>
        </div>
        <div class="mkd-q">${MD.esc(sel.q)}</div>

        <div class="mkd-ans">
          <div class="ans-box wrong">
            <div class="ab-label">${IC.mistakes}<span>你的答案</span></div>
            <div class="ab-text">${MD.esc(sel.your)}</div>
          </div>
          <div class="ans-box right">
            <div class="ab-label">${IC.check}<span>正确答案</span></div>
            <div class="ab-text">${MD.esc(sel.right)}</div>
          </div>
        </div>

        <div class="mkd-section">
          <div class="mkd-st">${IC.bulb}<span>AI 错因分析</span><button class="ai-btn" id="aiAnalyze" style="margin-left:auto">${IC.sparkles}<span>重新分析</span></button></div>
          <p class="mkd-p">${MD.esc(sel.reason).replace(/\n/g, '<br/>')}</p>
          <div id="aiAnalyzeOut"></div>
        </div>

        <div class="mkd-blind">
          <div class="mkd-st">${IC.target}<span>知识盲区定位</span></div>
          <div class="blind-row">
            <span class="blind-tag">${MD.esc(sel.blind)}</span>
            <span class="blind-arrow">${IC.arrow}</span>
            <span class="blind-related">拓展：${MD.esc(sel.related)}</span>
          </div>
        </div>

        <div class="mkd-actions">
          <button class="btn ghost" data-star="${sel.id}">${IC.star}<span>${sel.star ? '已收藏' : '收藏重点'}</span></button>
          <button class="btn ghost" data-master="${sel.id}">${IC.check}<span>${sel.mastered ? '取消掌握' : '标记已掌握'}</span></button>
          <button class="btn ghost" data-mkdel="${sel.id}" style="margin-left:auto;color:var(--red)">${IC.trash}<span>删除</span></button>
        </div>
      </div>` : '<div class="mk-detail card empty-card">选择左侧错题查看详情</div>'}
    </div>`;
};

/* ---- 间隔重复复习会话 ---- */
function renderReviewSession(mod) {
  const id = REVIEW_QUEUE[REVIEW_IDX];
  const m = DB.mistakes.find(x => x.id === id);
  const total = REVIEW_QUEUE.length;

  // 队列走完 → 完成页
  if (!m) {
    return `
    <div class="page-head">
      <div><h1 class="page-title">复习完成 🎉</h1>
        <div class="page-sub">本轮共复习 <b>${total}</b> 题，已按记忆质量重新排期。</div></div>
      <div class="kbar"><button class="btn primary" id="revExit">${IC.check}<span>返回错题本</span></button></div>
    </div>
    <div class="card empty-card">
      坚持就是胜利。下次到期的错题会再次出现在「今日待复习」。
    </div>`;
  }

  const gradeBtns = SRS.GRADES.map(g =>
    `<button class="btn rev-grade" data-grade="${g.key}" style="border-color:${g.tone};color:${g.tone}"><b>${g.label}</b></button>`
  ).join('');

  return `
    <div class="page-head">
      <div><h1 class="page-title">间隔重复复习</h1>
        <div class="page-sub">第 <b>${REVIEW_IDX + 1}</b> / ${total} 题 · 凭记忆作答后如实评分，引擎会自动安排下次复习</div></div>
      <div class="kbar"><button class="btn ghost" id="revExit">退出复习</button></div>
    </div>

    <div class="card" style="max-width:760px;margin:0 auto">
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:14px">
        <span class="chip" style="border-color:transparent;background:color-mix(in oklab, ${mod(m.mod).dot} 16%, transparent);color:${mod(m.mod).dot}">${MD.esc(mod(m.mod).label)}</span>
        <span class="chip red">${MD.esc(m.type)}</span>
        <span class="note-time mono" style="margin-left:auto">下次:${SRS.nextLabel(m)}</span>
      </div>
      <div class="mkd-q" style="margin-bottom:18px">${MD.esc(m.q)}</div>

      ${REVIEW_SHOW ? `
        <div class="mkd-ans">
          <div class="ans-box wrong"><div class="ab-label">${IC.mistakes}<span>当时的错答</span></div><div class="ab-text">${MD.esc(m.your)}</div></div>
          <div class="ans-box right"><div class="ab-label">${IC.check}<span>正确答案</span></div><div class="ab-text">${MD.esc(m.right)}</div></div>
        </div>
        <div class="section-title" style="margin-top:20px">回忆质量如何？</div>
        <div class="quiz-actions" style="gap:10px">${gradeBtns}</div>
      ` : `
        <div class="quiz-actions"><div style="flex:1"></div>
          <button class="btn primary" id="revShow">${IC.bulb}<span>显示答案</span></button></div>
      `}
    </div>`;
}

/* 首页驾驶舱直达：构建到期队列并进入复习会话（须在 __go('mistakes') 前调用） */
window.__startMistakeReview = function () {
  const dueList = SRS.due(DB.mistakes.filter(m => !m.mastered));
  if (!dueList.length) return false;
  REVIEW_QUEUE = dueList.map(m => m.id);
  REVIEW_IDX = 0; REVIEW_SHOW = false; REVIEW_MODE = true;
  return true;
};

window.__bindPage = window.__bindPage || {};
window.__bindPage.mistakes = function () {
  // ---- 复习会话事件 ----
  if (REVIEW_MODE) {
    const show = document.getElementById('revShow');
    if (show) show.addEventListener('click', () => { REVIEW_SHOW = true; window.__rerender(); });
    document.querySelectorAll('.rev-grade').forEach(b => b.addEventListener('click', () => {
      const m = DB.mistakes.find(x => x.id === REVIEW_QUEUE[REVIEW_IDX]);
      if (m && window.SRS) SRS.review(m, b.dataset.grade);
      REVIEW_IDX += 1;
      REVIEW_SHOW = false;
      window.__rerender();
    }));
    const exit = document.getElementById('revExit');
    if (exit) exit.addEventListener('click', () => { REVIEW_MODE = false; REVIEW_QUEUE = []; REVIEW_IDX = 0; REVIEW_SHOW = false; window.__rerender(); });
    return;
  }

  // ---- 开始复习：构建到期队列 ----
  const rev = document.getElementById('mkReview');
  if (rev) rev.addEventListener('click', () => {
    const dueList = SRS.due(mistakeScope().filter(m => !m.mastered));
    if (!dueList.length) { window.toast && window.toast('暂无到期复习的错题', 'ok'); return; }
    REVIEW_QUEUE = dueList.map(m => m.id);
    REVIEW_IDX = 0; REVIEW_SHOW = false; REVIEW_MODE = true;
    window.__rerender();
  });

  document.querySelectorAll('[data-mk]').forEach(el =>
    el.addEventListener('click', () => { MISTAKE_SEL = el.dataset.mk; window.__rerender(); }));
  document.querySelectorAll('[data-mkfilter]').forEach(el =>
    el.addEventListener('click', () => { MISTAKE_FILTER = el.dataset.mkfilter; window.__rerender(); }));
  const star = document.querySelector('[data-star]');
  if (star) star.addEventListener('click', () => { const m = DB.mistakes.find(x => x.id === star.dataset.star); m.star = !m.star; window.__rerender(); });
  const mas = document.querySelector('[data-master]');
  if (mas) mas.addEventListener('click', () => { const m = DB.mistakes.find(x => x.id === mas.dataset.master); m.mastered = !m.mastered; window.__rerender(); });

  // 删除当前错题
  const del = document.querySelector('[data-mkdel]');
  if (del) del.addEventListener('click', () => {
    const id = del.dataset.mkdel;
    window.__confirm('确定删除这道错题？', { danger: true, confirmLabel: '删除' }).then(ok => {
      if (!ok) return;
      DB.mistakes = DB.mistakes.filter(x => x.id !== id);
      MISTAKE_SEL = DB.mistakes[0] ? DB.mistakes[0].id : null;
      window.toast('已删除错题', 'ok');
      window.__rerender();
    });
  });

  // 手动录入错题
  const add = document.querySelector('#mkAdd');
  if (add) add.addEventListener('click', () => {
    window.__formModal('录入错题', [
      { key: 'q', label: '题目', type: 'textarea', required: true },
      { key: 'your', label: '你的答案', type: 'textarea', rows: 2 },
      { key: 'right', label: '正确答案', type: 'textarea', rows: 2 },
      { key: 'mod', label: '模块', type: 'select', options: DB.modules.map(m => [m.id, m.label]) },
      { key: 'stageId', label: '关联阶段', type: 'select', value: (Stats.currentStage() || {}).id || '', options: [['', '不关联']].concat(DB.stages.map(s => [s.id, s.name + ' · ' + s.theme])), hint: '便于后续按阶段复习' },
    ], {
      submitLabel: '录入', onSubmit(v) {
        const id = 'm' + Date.now();
        DB.mistakes.unshift({
          id, mod: v.mod, stageId: v.stageId || '', type: '手动录入', time: '刚刚', createdAt: Date.now(),
          q: v.q.trim(), your: v.your.trim(), right: v.right.trim(),
          reason: '', blind: '', related: '', mastered: false, star: false,
        });
        MISTAKE_SEL = id; window.toast('已录入错题', 'ok'); window.__rerender();
      }
    });
  });

  // AI 错因分析：调用本地 Ollama 重新分析当前错题
  const aiBtn = document.querySelector('#aiAnalyze');
  if (aiBtn) aiBtn.addEventListener('click', async () => {
    if (!window.AI.cfg().enabled) { window.toast('请先在 AI 设置中启用本地 Ollama', 'err'); return; }
    const sel = DB.mistakes.find(x => x.id === MISTAKE_SEL);
    if (!sel) return;
    const out = document.getElementById('aiAnalyzeOut');
    out.innerHTML = '<div class="ai-out loading"><span class="spin"></span> AI 正在分析错因…</div>';
    try {
      const txt = await window.AI.analyzeMistake(sel);
      sel.reason = txt;            // 写回，随 Store 持久化
      out.innerHTML = '<div class="ai-out"><div class="ai-out-head">' + IC.sparkles + 'AI 分析（已更新）</div>' + MD.esc(txt).replace(/\n/g, '<br/>') + '</div>';
    } catch (e) {
      out.innerHTML = '<div class="ai-out" style="color:var(--red)">⚠ ' + e.message + '</div>';
    }
  });
};
