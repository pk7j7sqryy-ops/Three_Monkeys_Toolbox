/* ===================== 每日 & 每周复盘 ===================== */
window.renderReview = function () {
  const mod = (id) => DB.modules.find(m => m.id === id) || { label: id, dot: '#888' };
  const w = DB.weekSummary;
  // 周范围与模块占比实时计算，不再用 data.js 里写死的日期和百分比
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const monday = new Date(now.getTime() - ((now.getDay() + 6) % 7) * 86400000);
  const sunday = new Date(monday.getTime() + 6 * 86400000);
  const mmdd = (d) => String(d.getMonth() + 1).padStart(2, '0') + '.' + String(d.getDate()).padStart(2, '0');
  const weekRange = `本周 · ${mmdd(monday)} – ${mmdd(sunday)}`;
  const modMin = Stats.compute().modMin;
  const totalMin = Object.values(modMin).reduce((a, b) => a + b, 0);
  const topMods = DB.modules
    .map(m => ({ label: m.label, pct: totalMin ? Math.round((modMin[m.id] || 0) / totalMin * 100) : 0 }))
    .sort((a, b) => b.pct - a.pct).slice(0, 3);
  // 迁移：旧数据以 date 为主键，同日多条会互相误伤；补上唯一 id
  DB.reviews.forEach((r, i) => { if (!r.id) r.id = 'rv_' + (r.date || '') + '_' + i; });

  const card = (r) => `
    <div class="tl-node">
      <div class="tl-marker"><span class="tl-dot" style="background:${mod(r.tag).dot}"></span></div>
      <div class="tl-card card hover ${r.pin ? 'pinned' : ''}">
        <div class="tl-head">
          <div class="tl-date"><span class="tl-d">${r.date.slice(5)}</span><span class="tl-wd">${r.wd}</span></div>
          <span class="chip solid">${({ day: '日复盘', week: '周复盘', stage: '阶段复盘' })[r.rtype] || '日复盘'}</span>
          <span class="chip" style="border-color:transparent;background:color-mix(in oklab, ${mod(r.tag).dot} 16%, transparent);color:${mod(r.tag).dot}">${MD.esc(mod(r.tag).label)}</span>
          ${(() => { const s = r.stageId && DB.stages.find(x => x.id === r.stageId); return s ? `<span class="chip">${MD.esc(s.theme)}</span>` : ''; })()}
          ${r.pin ? `<span class="tl-pin">${IC.pin}<span>置顶</span></span>` : ''}
          <span style="flex:1"></span>
          <button class="tl-edit" title="编辑" data-revedit="${r.id}">${IC.edit}</button>
          <button class="tl-edit" title="${r.pin ? '取消置顶' : '置顶'}" data-revpin="${r.id}">${IC.pin}</button>
          <button class="tl-edit" title="删除" data-revdel="${r.id}" style="color:var(--red)">${IC.trash}</button>
        </div>
        <div class="tl-grid">
          <div class="tl-block gain">
            <div class="tlb-label">${IC.check}<span>当日核心收获</span></div>
            <ul>${(r.gain || []).map(g => `<li>${MD.esc(g)}</li>`).join('')}</ul>
          </div>
          <div class="tl-block doubt">
            <div class="tlb-label">${IC.target}<span>未掌握疑点</span></div>
            <ul>${(r.doubt || []).map(g => `<li>${MD.esc(g)}</li>`).join('')}</ul>
          </div>
          <div class="tl-block plan">
            <div class="tlb-label">${IC.arrow}<span>次日学习规划</span></div>
            <ul>${(r.plan || []).map(g => `<li>${MD.esc(g)}</li>`).join('')}</ul>
            ${(r.plan || []).length ? (r.planImported
              ? `<div class="plan-imported mono">${IC.check} 已转为任务</div>`
              : `<button class="btn ghost sm plan-to-task" data-revplan="${r.id}">${IC.plus}<span>转为今日任务</span></button>`) : ''}
          </div>
        </div>
      </div>
    </div>`;

  return `
    <div class="page-head">
      <div>
        <h1 class="page-title">复盘总结</h1>
        <div class="page-sub">AI 生成的每日收获、疑点汇总与次日建议 · 时间轴倒序展示</div>
      </div>
      <div class="kbar">
        <button class="btn primary" id="revAdd">${IC.plus}<span>新建复盘</span></button>
      </div>
    </div>

    <div class="week-summary card">
      <div class="ws-side">
        <div class="ws-badge">${IC.layers}</div>
        <div class="ws-label">本周知识串联</div>
        <div class="ws-range mono">${weekRange}</div>
      </div>
      <div class="ws-main">
        <p class="ws-text">${w.text}</p>
        <div class="ws-mods">
          ${topMods.map(m => `<div class="ws-mod">
            <div class="ws-mod-head"><span>${MD.esc(m.label)}</span><span class="mono hl">${m.pct}%</span></div>
            <div class="bar"><span style="width:${m.pct}%"></span></div></div>`).join('')}
        </div>
      </div>
    </div>

    <div class="section-title" style="margin:30px 0 4px">每日复盘记录<span class="meta">置顶优先 · 按日期倒序</span></div>
    <div class="timeline">${DB.reviews.slice()
      .sort((a, b) => (b.pin ? 1 : 0) - (a.pin ? 1 : 0) || String(b.date).localeCompare(String(a.date)))
      .map(card).join('')}</div>`;
};

/* 复盘的「次日学习规划」→ 批量生成今日任务（闭环回流，首页也调用）
   优先挂当前周任务，否则直挂当前阶段 */
window.__importPlanTasks = function (reviewId) {
  const r = DB.reviews.find(x => x.id === reviewId);
  if (!r || !(r.plan || []).length) return 0;
  if (r.planImported) { window.toast('该复盘的规划已转过任务', 'err'); return 0; }
  const cw = Stats.currentWeek(), cs = Stats.currentStage();
  const tday = Stats.ymd(new Date());
  r.plan.forEach((line, i) => {
    DB.tasks.push({
      id: 't' + Date.now() + '_' + i, level: 'day', name: line, mod: r.tag || 'base',
      weekId: cw ? cw.id : '', stageId: cw ? '' : (cs ? cs.id : ''),
      date: tday, dur: 30, done: false, fromReview: r.id,
    });
  });
  r.planImported = true;
  window.toast('已生成 ' + r.plan.length + ' 个今日任务', 'ok');
  return r.plan.length;
};

const REVIEW_TYPES = [['day', '日复盘'], ['week', '周复盘'], ['stage', '阶段复盘']];
const revLines = s => (s || '').split(/[；;\n]/).map(x => x.trim()).filter(Boolean);

/* 新建 / 编辑复盘（共用表单） */
function openReviewForm(editing) {
  const e = editing || {};
  window.__formModal(editing ? '编辑复盘' : '新建复盘', [
    { key: 'rtype', label: '复盘类型', type: 'segment', value: e.rtype || 'day', options: REVIEW_TYPES },
    { key: 'stageId', label: '关联阶段', type: 'select', value: e.stageId != null ? e.stageId : ((Stats.currentStage() || {}).id || ''), options: [['', '不关联']].concat(DB.stages.map(s => [s.id, s.name + ' · ' + s.theme])), hint: '阶段复盘必选；日/周复盘可选' },
    { key: 'gain', label: '核心收获', type: 'textarea', value: (e.gain || []).join('\n'), placeholder: '每行一条，或用 ； 分隔', required: true },
    { key: 'doubt', label: '未掌握疑点', type: 'textarea', value: (e.doubt || []).join('\n'), placeholder: '每行一条，可留空' },
    { key: 'plan', label: '下一步学习规划', type: 'textarea', value: (e.plan || []).join('\n'), placeholder: '每行一条，可一键转为任务' },
    { key: 'tag', label: '关联模块', type: 'select', value: e.tag, options: DB.modules.map(m => [m.id, m.label]) },
  ], {
    submitLabel: editing ? '保存修改' : '保存复盘', onSubmit(v) {
      const gain = revLines(v.gain);
      if (!gain.length) return '请至少填写一条收获';
      if (v.rtype === 'stage' && !v.stageId) return '阶段复盘请选择关联阶段';
      if (editing) {
        Object.assign(editing, { rtype: v.rtype, stageId: v.stageId || '', gain, doubt: revLines(v.doubt), plan: revLines(v.plan), tag: v.tag });
        window.toast('已更新复盘', 'ok');
      } else {
        const d = new Date();
        const wd = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()];
        DB.reviews.unshift({
          id: 'rv' + Date.now(), rtype: v.rtype, stageId: v.stageId || '',
          date: window.Stats ? Stats.ymd(d) : d.toISOString().slice(0, 10),
          wd, gain, doubt: revLines(v.doubt), plan: revLines(v.plan), tag: v.tag, pin: false,
        });
        window.toast('已新建复盘', 'ok');
      }
      window.__rerender();
    }
  });
}

window.__bindPage = window.__bindPage || {};
window.__bindPage.review = function () {
  // 新建
  const add = document.getElementById('revAdd');
  if (add) add.addEventListener('click', () => openReviewForm(null));
  // 编辑
  document.querySelectorAll('[data-revedit]').forEach(btn => btn.addEventListener('click', () => {
    const r = DB.reviews.find(x => x.id === btn.dataset.revedit);
    if (r) openReviewForm(r);
  }));

  // 次日规划 → 今日任务
  document.querySelectorAll('[data-revplan]').forEach(btn => btn.addEventListener('click', () => {
    if (window.__importPlanTasks(btn.dataset.revplan)) window.__rerender();
  }));

  // 置顶切换（按唯一 id）
  document.querySelectorAll('[data-revpin]').forEach(btn => btn.addEventListener('click', () => {
    const r = DB.reviews.find(x => x.id === btn.dataset.revpin);
    if (r) { r.pin = !r.pin; window.__rerender(); }
  }));
  // 删除（按唯一 id）
  document.querySelectorAll('[data-revdel]').forEach(btn => btn.addEventListener('click', () => {
    const id = btn.dataset.revdel;
    window.__confirm('确定删除这条复盘记录？', { danger: true, confirmLabel: '删除' }).then(ok => {
      if (!ok) return;
      DB.reviews = DB.reviews.filter(x => x.id !== id);
      window.toast('已删除复盘', 'ok'); window.__rerender();
    });
  }));
};
