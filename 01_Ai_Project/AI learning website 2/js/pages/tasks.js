/* ===================== 学习计划：目标 → 阶段 → 周任务 → 日任务 ===================== */

// 时长统一以分钟存储，展示时自动换算小时 / 天（1 天 = 24 小时）
function fmtDur(min) {
  min = +min || 0;
  if (min >= 1440 && min % 1440 === 0) return (min / 1440) + ' 天';
  if (min < 60) return min + ' 分钟';
  if (min % 60 === 0) return (min / 60) + ' 小时';
  return Math.floor(min / 60) + ' 小时 ' + (min % 60) + ' 分';
}
const fmtRange = (s, e) => (s || e) ? ((s || '?') + ' ~ ' + (e || '?')).replace(/\d{4}-/g, m => m.slice(2)) : '未设日期';
// 子区间须落在父区间内（任一端未设则不校验该端）
function rangeErr(cs, ce, ps, pe, what) {
  if (cs && ce && cs > ce) return what + '的开始日期晚于结束日期';
  if (ps && cs && cs < ps) return what + '开始日期早于上级区间（' + ps + '）';
  if (pe && ce && ce > pe) return what + '结束日期晚于上级区间（' + pe + '）';
  return '';
}

let PLAN_STAGE = null; // 当前选中的阶段 id

window.renderTasks = function () {
  const mod = (id) => DB.modules.find(m => m.id === id) || { label: id || '—', dot: '#888' };
  const goal = DB.goal || { name: '', start: '', end: '' };
  const gp = Stats.goalProgress();
  const cs = Stats.currentStage();
  if (!PLAN_STAGE || !DB.stages.find(s => s.id === PLAN_STAGE)) PLAN_STAGE = cs ? cs.id : (DB.stages[0] || {}).id;
  const sel = DB.stages.find(s => s.id === PLAN_STAGE);
  const tday = Stats.ymd(new Date());
  const daysLeft = goal.end ? Math.max(0, Math.round((new Date(goal.end) - new Date(tday)) / 86400000)) : null;

  /* ---- 日任务行 ---- */
  const dayRow = (t) => `
    <div class="task-row ${t.done ? 'done' : ''}" data-task="${t.id}">
      <button class="task-box" data-toggle="${t.id}">${t.done ? IC.check : ''}</button>
      <div class="task-main">
        <div class="task-name">${MD.esc(t.name)}</div>
        <div class="task-sub">
          <span class="chip" style="border-color:transparent;background:color-mix(in oklab, ${mod(t.mod).dot} 16%, transparent);color:${mod(t.mod).dot}">${MD.esc(mod(t.mod).label)}</span>
          <span class="task-meta">${IC.clock}<span>${fmtDur(t.dur)}</span></span>
          ${t.date ? `<span class="task-meta ${t.date === tday ? 'month-tag' : ''}">${IC.calendar}<span>${t.date === tday ? '今天' : t.date.slice(5)}</span></span>` : ''}
          ${t.done ? `<span class="task-meta" style="color:var(--green)">${IC.check}<span>${MD.esc(t.doneAt ? Stats.relTime(t.doneAt) : '已完成')}</span></span>` : ''}
        </div>
      </div>
      <button class="task-edit" data-editday="${t.id}" title="编辑">${IC.edit}</button>
    </div>`;

  /* ---- 周任务卡（内嵌其日任务） ---- */
  const weekCard = (w) => {
    const days = DB.tasks.filter(t => t.level === 'day' && t.weekId === w.id);
    const wp = Stats.weekProgress(w);
    const isNow = w.start && w.end && w.start <= tday && tday <= w.end;
    return `
    <div class="week-card ${wp.pct === 100 ? 'done' : ''}">
      <div class="week-head">
        ${!days.length ? `<button class="task-box" data-wtoggle="${w.id}">${w.done ? IC.check : ''}</button>` : ''}
        <div class="week-info">
          <div class="week-name">${MD.esc(w.name)}${isNow ? ' <span class="month-now">本周</span>' : ''}</div>
          <div class="week-meta mono">${fmtRange(w.start, w.end)}${days.length ? ` · ${wp.done}/${wp.total} 完成` : ''}</div>
        </div>
        <div class="bar week-bar"><span style="width:${wp.pct}%"></span></div>
        <span class="month-pct ${wp.pct === 100 ? 'hl' : ''}">${wp.pct}%</span>
        <button class="task-edit" data-editweek="${w.id}" title="编辑周任务">${IC.edit}</button>
      </div>
      ${days.length ? `<div class="task-list week-days">${days.map(dayRow).join('')}</div>` : ''}
      <button class="add-day" data-addday="${w.id}">${IC.plus}<span>添加日任务</span></button>
    </div>`;
  };

  /* ---- 阶段侧栏行 ---- */
  const stageRow = (s, i) => {
    const prog = Stats.stageProgress(s);
    const isCur = cs && cs.id === s.id;
    return `
    <div class="month-row ${s.id === PLAN_STAGE ? 'current' : ''}" data-stage="${s.id}" role="button" tabindex="0" style="cursor:pointer">
      <div class="month-l">
        <div class="month-m">${MD.esc(s.name)}${isCur ? ' <span class="month-now">进行中</span>' : ''}</div>
        <div class="month-t">${MD.esc(s.theme)}</div>
        <div class="month-tasks mono">${fmtRange(s.start, s.end)}${prog.derived ? ` · ${prog.done}/${prog.total}` : ''}</div>
      </div>
      <div class="month-r">
        <div class="bar" style="width:90px"><span style="width:${prog.pct}%"></span></div>
        <span class="month-pct ${prog.pct === 100 ? 'hl' : ''}">${prog.pct}%</span>
        <button class="task-edit" data-editstage="${s.id}" title="编辑阶段">${IC.edit}</button>
      </div>
    </div>`;
  };

  const selWeeks = sel ? DB.tasks.filter(t => t.level === 'week' && t.stageId === sel.id) : [];
  const selLoose = sel ? DB.tasks.filter(t => t.level === 'day' && t.stageId === sel.id && !t.weekId) : [];
  const selProg = sel ? Stats.stageProgress(sel) : { pct: 0 };
  const selNotes = sel ? (sel.noteIds || []).map(id => DB.notes.find(n => n.id === id)).filter(Boolean) : [];

  return `
    <div class="page-head">
      <div>
        <h1 class="page-title">学习计划</h1>
        <div class="page-sub">目标 → 阶段 → 周任务 → 日任务 · 进度逐级自动计算</div>
      </div>
      <div class="kbar">
        <button class="btn ghost" id="addStage">${IC.plus}<span>新增阶段</span></button>
        <button class="btn primary" id="addWeek">${IC.plus}<span>新增周任务</span></button>
      </div>
    </div>

    <!-- 总目标横幅 -->
    <div class="card goal-bar" id="goalBar" role="button" tabindex="0" title="点击编辑总目标">
      <div class="goal-ic">${IC.target}</div>
      <div class="goal-main">
        <div class="goal-name">${goal.name ? MD.esc(goal.name) : '<span style="color:var(--ink-4)">点击设定总目标</span>'}</div>
        <div class="goal-meta mono">${fmtRange(goal.start, goal.end)}${daysLeft !== null ? ` · 剩余 ${daysLeft} 天` : ''} · ${DB.stages.length} 个阶段</div>
      </div>
      <div class="goal-prog">
        <div class="bar" style="width:160px;height:9px"><span style="width:${gp}%"></span></div>
        <span class="month-pct ${gp === 100 ? 'hl' : ''}">${gp}%</span>
      </div>
    </div>

    <div class="task-layout">
      <div>
        ${sel ? `
        <div class="card" id="taskPanel">
          <div class="stage-head">
            <div>
              <div class="section-title" style="margin:0">${MD.esc(sel.name)} · ${MD.esc(sel.theme)}
                <span class="meta">${fmtRange(sel.start, sel.end)} · ${selProg.pct}%</span></div>
              ${selNotes.length ? `<div class="month-notes" style="margin-top:8px">${selNotes.map(n =>
                `<span class="month-note" data-note="${n.id}" role="button" tabindex="0">${IC.notes}<span class="mn-t">${MD.esc(n.title)}</span></span>`).join('')}</div>` : ''}
            </div>
          </div>

          <div class="section-title" style="margin-top:18px">周任务<span class="meta">${selWeeks.length} 个 · 日任务挂在周任务下</span></div>
          ${selWeeks.length ? selWeeks.map(weekCard).join('') : '<div class="task-empty">该阶段还没有周任务，点右上角「新增周任务」</div>'}

          ${selLoose.length ? `
            <div class="section-title" style="margin-top:22px">散任务<span class="meta">直挂阶段、未归入周任务</span></div>
            <div class="task-list">${selLoose.map(dayRow).join('')}</div>` : ''}
          <button class="add-task" id="addLooseDay">${IC.plus}<span>新增日任务</span></button>
        </div>` : '<div class="card task-empty">还没有阶段。先点「新增阶段」拆解你的目标。</div>'}
      </div>

      <div class="task-side">
        <div class="card plan-card">
          <div class="section-title">阶段列表<span class="meta">点击切换 · ✎ 编辑</span></div>
          <div class="month-list">${DB.stages.map(stageRow).join('') || '<div class="task-empty">暂无阶段</div>'}</div>
        </div>

        <div class="card">
          <div class="section-title">模块时长占比<span class="meta">按学习记录实时统计</span></div>
          ${(() => {
            const modMin = Stats.compute().modMin;
            const totalMin = Object.values(modMin).reduce((a, b) => a + b, 0);
            return DB.modules.map(m => {
              const p = totalMin ? Math.round((modMin[m.id] || 0) / totalMin * 100) : 0;
              return `<div class="mod-prog">
                <div class="mod-prog-head"><span>${MD.esc(m.label)}</span><span class="mono" style="color:${m.dot}">${p}%</span></div>
                <div class="bar"><span style="width:${p}%;background:${m.dot}"></span></div>
              </div>`;
            }).join('');
          })()}
        </div>
      </div>
    </div>`;
};

window.__bindPage = window.__bindPage || {};
window.__bindPage.tasks = function () {
  const modOpts = DB.modules.map(m => [m.id, m.label]);
  const goal = DB.goal || (DB.goal = { name: '', start: '', end: '' });
  const sel = DB.stages.find(s => s.id === PLAN_STAGE);
  const tday = Stats.ymd(new Date());

  /* ---------- 时长字段（分钟/小时/天 → 分钟存储） ---------- */
  const durFields = (min) => {
    let unit = 'min', val = (min == null ? 30 : min);
    if (min != null) {
      if (min >= 1440 && min % 1440 === 0) { unit = 'day'; val = min / 1440; }
      else if (min >= 60 && min % 30 === 0) { unit = 'hr'; val = min / 60; }
    }
    return [
      { key: 'dur', label: '时长', type: 'number', value: val },
      { key: 'durUnit', label: '时长单位', type: 'segment', value: unit, options: [['min', '分钟'], ['hr', '小时'], ['day', '天']] },
    ];
  };
  const parseDur = (v) => {
    const n = parseFloat(v.dur);
    if (isNaN(n) || n <= 0) return null;
    return Math.max(1, Math.round(n * (v.durUnit === 'day' ? 1440 : v.durUnit === 'hr' ? 60 : 1)));
  };

  /* ---------- 勾选：日任务 / 无子周任务 ---------- */
  document.querySelectorAll('[data-toggle]').forEach(btn => btn.addEventListener('click', () => {
    const t = DB.tasks.find(x => x.id === btn.dataset.toggle);
    t.done = !t.done;
    if (t.done) { t.doneAt = Date.now(); if (window.Stats) Stats.logStudy(t.dur, t.mod); }
    window.__rerender();
  }));
  document.querySelectorAll('[data-wtoggle]').forEach(btn => btn.addEventListener('click', () => {
    const w = DB.tasks.find(x => x.id === btn.dataset.wtoggle);
    w.done = !w.done;
    if (w.done) w.doneAt = Date.now();
    window.__rerender();
  }));

  /* ---------- 总目标 ---------- */
  document.getElementById('goalBar').addEventListener('click', () => {
    window.__formModal('设定总目标', [
      { key: 'name', label: '目标名称', type: 'text', value: goal.name, placeholder: '例如：6 个月学完 AI 大模型相关知识', required: true },
      { key: 'start', label: '开始日期', type: 'date', value: goal.start },
      { key: 'end', label: '结束日期', type: 'date', value: goal.end },
    ], {
      onSubmit(v) {
        const err = rangeErr(v.start, v.end, '', '', '目标'); if (err) return err;
        goal.name = v.name.trim(); goal.start = v.start; goal.end = v.end;
        window.toast('目标已更新', 'ok'); window.__rerender();
      }
    });
  });

  /* ---------- 阶段 增/改/删 ---------- */
  const noteOpts = DB.notes.map(n => [n.id, n.title]);
  const stageFields = (s) => [
    { key: 'name', label: '阶段名称', type: 'text', value: s.name, placeholder: '例如：第 1 阶段', required: true },
    { key: 'theme', label: '阶段主题', type: 'text', value: s.theme, placeholder: '例如：Python 筑基', required: true },
    { key: 'start', label: '开始日期', type: 'date', value: s.start, hint: '须在总目标区间内：' + fmtRange(goal.start, goal.end) },
    { key: 'end', label: '结束日期', type: 'date', value: s.end },
    { key: 'mod', label: '关联模块', type: 'select', value: s.mod || '', options: [['', '不关联']].concat(modOpts), hint: '刷题中心按阶段筛题、错题自动归档到阶段' },
    { key: 'noteIds', label: '关联笔记', type: 'checks', value: s.noteIds || [], options: noteOpts },
  ];
  const applyStage = (s, v) => {
    const err = rangeErr(v.start, v.end, goal.start, goal.end, '阶段'); if (err) return err;
    s.name = v.name.trim(); s.theme = v.theme.trim(); s.start = v.start; s.end = v.end;
    s.mod = v.mod || ''; s.noteIds = v.noteIds;
    return '';
  };
  document.getElementById('addStage').addEventListener('click', () => {
    window.__formModal('新增阶段', stageFields({ name: '第 ' + (DB.stages.length + 1) + ' 阶段', theme: '', start: '', end: '', noteIds: [] }), {
      submitLabel: '新增',
      onSubmit(v) {
        const s = { id: 'st' + Date.now(), pct: 0 };
        const err = applyStage(s, v); if (err) return err;
        DB.stages.push(s); PLAN_STAGE = s.id;
        window.toast('已新增阶段', 'ok'); window.__rerender();
      }
    });
  });
  document.querySelectorAll('[data-editstage]').forEach(btn => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const s = DB.stages.find(x => x.id === btn.dataset.editstage); if (!s) return;
    window.__formModal('编辑阶段 · ' + s.name, stageFields(s), {
      onSubmit(v) { const err = applyStage(s, v); if (err) return err; window.toast('已更新阶段', 'ok'); window.__rerender(); },
      deleteLabel: '删除阶段',
      onDelete() {
        const n = DB.tasks.filter(t => t.level === 'week' && t.stageId === s.id || t.level === 'day' && t.stageId === s.id).length;
        window.__confirm('删除阶段「' + MD.esc(s.theme) + '」？' + (n ? '其下 ' + n + ' 个任务将解除挂靠（不会删除）。' : ''), { danger: true, confirmLabel: '删除' }).then(ok => {
          if (!ok) return;
          DB.tasks.forEach(t => { if (t.stageId === s.id) t.stageId = ''; });
          DB.stages = DB.stages.filter(x => x.id !== s.id);
          window.toast('已删除阶段', 'ok'); window.__rerender();
        });
      }
    });
  }));
  // 点击阶段行 → 切换选中
  document.querySelectorAll('[data-stage]').forEach(row => row.addEventListener('click', () => {
    PLAN_STAGE = row.dataset.stage; window.__rerender();
  }));

  /* ---------- 周任务 增/改/删 ---------- */
  const stageOpts = DB.stages.map(s => [s.id, s.name + ' · ' + s.theme]);
  const weekFields = (w) => {
    const st = DB.stages.find(s => s.id === (w.stageId || PLAN_STAGE)) || {};
    return [
      { key: 'name', label: '周任务名称', type: 'text', value: w.name, placeholder: '例如：Python 函数和类学习', required: true },
      { key: 'stageId', label: '所属阶段', type: 'select', value: w.stageId || PLAN_STAGE, options: stageOpts },
      { key: 'start', label: '开始日期', type: 'date', value: w.start, hint: '须在阶段区间内：' + fmtRange(st.start, st.end) },
      { key: 'end', label: '结束日期', type: 'date', value: w.end },
    ];
  };
  const applyWeek = (w, v) => {
    const st = DB.stages.find(s => s.id === v.stageId) || {};
    const err = rangeErr(v.start, v.end, st.start, st.end, '周任务'); if (err) return err;
    w.name = v.name.trim(); w.stageId = v.stageId; w.start = v.start; w.end = v.end;
    return '';
  };
  document.getElementById('addWeek').addEventListener('click', () => {
    window.__formModal('新增周任务', weekFields({}), {
      submitLabel: '新增',
      onSubmit(v) {
        const w = { id: 'w' + Date.now(), level: 'week', done: false };
        const err = applyWeek(w, v); if (err) return err;
        DB.tasks.push(w); PLAN_STAGE = w.stageId;
        window.toast('已新增周任务', 'ok'); window.__rerender();
      }
    });
  });
  document.querySelectorAll('[data-editweek]').forEach(btn => btn.addEventListener('click', () => {
    const w = DB.tasks.find(x => x.id === btn.dataset.editweek); if (!w) return;
    window.__formModal('编辑周任务', weekFields(w), {
      onSubmit(v) { const err = applyWeek(w, v); if (err) return err; window.toast('已更新', 'ok'); window.__rerender(); },
      deleteLabel: '删除',
      onDelete() {
        const n = DB.tasks.filter(t => t.weekId === w.id).length;
        window.__confirm('删除周任务「' + MD.esc(w.name) + '」？' + (n ? '其下 ' + n + ' 个日任务将转为阶段散任务。' : ''), { danger: true, confirmLabel: '删除' }).then(ok => {
          if (!ok) return;
          DB.tasks.forEach(t => { if (t.weekId === w.id) { t.weekId = ''; t.stageId = w.stageId; } });
          DB.tasks = DB.tasks.filter(x => x.id !== w.id);
          window.toast('已删除周任务', 'ok'); window.__rerender();
        });
      }
    });
  }));

  /* ---------- 日任务 增/改/删 ---------- */
  const dayFields = (t, fixedWeekId) => {
    const weeks = DB.tasks.filter(x => x.level === 'week' && x.stageId === PLAN_STAGE);
    const parentOpts = weeks.map(w => ['w:' + w.id, '周任务 · ' + w.name]).concat([['s:' + PLAN_STAGE, '直挂阶段（散任务）']]);
    const parentVal = fixedWeekId ? 'w:' + fixedWeekId : (t.weekId ? 'w:' + t.weekId : 's:' + (t.stageId || PLAN_STAGE));
    return [
      { key: 'name', label: '日任务名称', type: 'text', value: t.name, placeholder: '例如：Python 关键字学习', required: true },
      { key: 'parent', label: '挂靠', type: 'select', value: parentVal, options: parentOpts },
      { key: 'date', label: '日期', type: 'date', value: t.date || tday, hint: '须在所挂周任务 / 阶段的区间内' },
      { key: 'mod', label: '模块', type: 'select', value: t.mod || (sel && sel.mod) || 'base', options: modOpts },
      ...durFields(t.dur),
    ];
  };
  const applyDay = (t, v) => {
    const d = parseDur(v); if (!d) return '时长需为正数';
    const isWeek = v.parent.startsWith('w:');
    const pid = v.parent.slice(2);
    const p = isWeek ? (DB.tasks.find(x => x.id === pid) || {}) : (DB.stages.find(x => x.id === pid) || {});
    const err = rangeErr(v.date, v.date, p.start, p.end, '日任务'); if (err) return err;
    t.name = v.name.trim(); t.date = v.date; t.mod = v.mod; t.dur = d;
    t.weekId = isWeek ? pid : ''; t.stageId = isWeek ? '' : pid;
    return '';
  };
  const openDayForm = (t, fixedWeekId) => {
    const isNew = !t.id;
    window.__formModal(isNew ? '新增日任务' : '编辑日任务', dayFields(t, fixedWeekId), {
      submitLabel: isNew ? '新增' : '保存',
      onSubmit(v) {
        const target = isNew ? { id: 't' + Date.now(), level: 'day', done: false } : t;
        const err = applyDay(target, v); if (err) return err;
        if (isNew) DB.tasks.push(target);
        window.toast(isNew ? '已新增日任务' : '已更新', 'ok'); window.__rerender();
      },
      deleteLabel: isNew ? undefined : '删除',
      onDelete: isNew ? undefined : function () {
        window.__confirm('删除日任务「' + MD.esc(t.name) + '」？', { danger: true, confirmLabel: '删除' }).then(ok => {
          if (!ok) return;
          DB.tasks = DB.tasks.filter(x => x.id !== t.id);
          window.toast('已删除', 'ok'); window.__rerender();
        });
      }
    });
  };
  document.querySelectorAll('[data-addday]').forEach(btn => btn.addEventListener('click', () => openDayForm({}, btn.dataset.addday)));
  const loose = document.getElementById('addLooseDay');
  if (loose) loose.addEventListener('click', () => openDayForm({}, null));
  document.querySelectorAll('[data-editday]').forEach(btn => btn.addEventListener('click', () => {
    const t = DB.tasks.find(x => x.id === btn.dataset.editday);
    if (t) openDayForm(t, null);
  }));

  // 阶段关联笔记 → 跳转
  document.querySelectorAll('.month-note[data-note]').forEach(chip => chip.addEventListener('click', (e) => {
    e.stopPropagation();
    if (window.__openNote && window.__openNote(chip.dataset.note)) window.__go('notes');
    else window.toast('笔记不存在（可能已删除）', 'err');
  }));
};
