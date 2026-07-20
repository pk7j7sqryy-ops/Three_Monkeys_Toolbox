/* ===================== 首页仪表盘 ===================== */
window.renderDashboard = function () {
  const S = Stats.compute();
  const goalMin = 28 * 60; // 周目标 28h
  const weekPct = Math.min(100, Math.round(S.weeklyTotal / goalMin * 100));
  const acc = S.accuracy == null ? '—' : S.accuracy + '%';
  // 卡片数值全部来自派生统计层（不再读 data.js 写死的 DB.stats）
  const s = [
    { id:'todo', label:'今日待学任务', value:(S.tasksDayTotal - S.tasksDayDone), unit:'项', icon:'tasks', sub:`已完成 ${S.tasksDayDone} / ${S.tasksDayTotal}`, pct:S.tasksDayTotal?Math.round(S.tasksDayDone/S.tasksDayTotal*100):0, tone:'accent' },
    { id:'week', label:'本周学习进度', value:weekPct, unit:'%', icon:'target', sub:`目标 28h · 已学 ${(S.weeklyTotal/60).toFixed(1)}h`, pct:weekPct, tone:'green' },
    { id:'notes', label:'已积累笔记', value:S.notesTotal, unit:'篇', icon:'notes', sub:`本周新增 ${S.notesThisWeek} 篇`, pct:Math.min(100, S.notesTotal), tone:'blue' },
    { id:'mistake', label:'错题总数', value:S.mistakesTotal, unit:'题', icon:'mistakes', sub:`待复盘 ${S.mistakesPending} 题`, pct:S.mistakesTotal?Math.round(S.mistakesPending/S.mistakesTotal*100):0, tone:'red' },
    { id:'self', label:'已完成自测', value:S.quizDone, unit:'次', icon:'quiz', sub:`平均正确率 ${acc}`, pct:S.accuracy||0, tone:'purple' },
    { id:'days', label:'阶段学习天数', value:S.stageDays, unit:'天', icon:'flame', sub:`连续打卡 ${S.streak} 天`, pct:Math.min(100, S.streak*8), tone:'accent' },
  ];
  const toneVar = { accent:'var(--accent)', green:'var(--green)', blue:'var(--blue)', red:'var(--red)', purple:'var(--purple)' };

  const statCard = (x) => `
    <div class="stat card hover">
      <div class="stat-top">
        <div class="stat-ic" style="color:${toneVar[x.tone]};background:color-mix(in oklab, ${toneVar[x.tone]} 14%, transparent)">${IC[x.icon]}</div>
        <div class="stat-label">${x.label}</div>
      </div>
      <div class="stat-num"><b>${x.value}</b><span class="stat-unit">${x.unit}</span></div>
      <div class="bar ${x.tone === 'green' ? 'green' : x.tone === 'blue' ? 'blue' : ''}" style="margin:12px 0 9px">
        <span style="width:${x.pct}%;background:${toneVar[x.tone]}"></span>
      </div>
      <div class="stat-sub">${x.sub}</div>
    </div>`;

  // weekly trend → svg line
  const W = 560, H = 170, pad = 26;
  const max = Math.max(...S.trend, 1) * 1.15; // 防止全 0 时除零产生 NaN
  const xs = (i) => pad + i * (W - pad * 2) / (S.trend.length - 1);
  const ys = (v) => H - pad - (v / max) * (H - pad * 1.6);
  const pts = S.trend.map((v, i) => [xs(i), ys(v)]);
  const linePath = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const areaPath = linePath + ` L${xs(S.trend.length - 1)} ${H - pad} L${xs(0)} ${H - pad} Z`;
  const dots = pts.map((p, i) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.4" fill="var(--accent)" stroke="var(--panel)" stroke-width="2"/>`).join('');
  const xlabels = S.trendLabels.map((l, i) => `<text x="${xs(i).toFixed(1)}" y="${H - 6}" fill="var(--ink-4)" font-size="11" text-anchor="middle" font-family="var(--font-mono)">${l}</text>`).join('');
  const grid = [0.25, 0.5, 0.75].map(f => `<line x1="${pad}" x2="${W - pad}" y1="${(H - pad) - f * (H - pad * 1.6)}" y2="${(H - pad) - f * (H - pad * 1.6)}" stroke="var(--line)" stroke-dasharray="3 5"/>`).join('');

  const trendSvg = `
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:${H}px">
      <defs><linearGradient id="ga" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stop-color="var(--accent)" stop-opacity="0.28"/>
        <stop offset="1" stop-color="var(--accent)" stop-opacity="0"/>
      </linearGradient></defs>
      ${grid}
      <path d="${areaPath}" fill="url(#ga)"/>
      <path d="${linePath}" fill="none" stroke="var(--accent)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
      ${dots}${xlabels}
    </svg>`;

  // calendar heatmap
  const heatCell = (v, i) => {
    const op = [0.05, 0.28, 0.5, 0.74, 1][v];
    return `<div class="heat-cell" title="第 ${i + 1} 天 · 强度 ${v}" style="background:color-mix(in oklab, var(--accent) ${op * 100}%, var(--inset))"></div>`;
  };
  const weekdays = ['一','二','三','四','五','六','日'];

  const moduleName = (id) => (DB.modules.find(m => m.id === id) || {}).label || id;

  return `
    <div class="page-head">
      <div>
        <h1 class="page-title">学习仪表盘</h1>
        <div class="page-sub">${(h => h < 6 ? '夜深了' : h < 12 ? '早上好' : h < 18 ? '下午好' : '晚上好')(new Date().getHours())}，${MD.esc((() => {
          try {
            const t = window.__tweaks ? window.__tweaks.get() : JSON.parse(localStorage.getItem('ailearn_tweaks_v1') || '{}');
            return (t.name || '').trim() || '小孙';
          } catch (e) { return '小孙'; }
        })())} 👋 今天是阶段第 <b>${S.stageDays}</b> 天 · 已连续打卡 <b>${S.streak}</b> 天，保持节奏。</div>
      </div>
      <div class="kbar">
        ${(() => {
          const d = window.__daysSinceExport ? window.__daysSinceExport() : null;
          const stale = d === null || d >= 7; // 从未导出 或 超 7 天 → 提醒
          const label = d === null ? '从未备份' : d === 0 ? '今天已备份' : d + ' 天未备份';
          return `<button class="btn ghost ${stale ? 'warn-pulse' : ''}" id="dashExport" title="一键导出 JSON 备份（学习数据存在浏览器，建议定期备份）">${IC.download}<span>导出备份</span>${stale ? `<span class="backup-flag">${label}</span>` : ''}</button>`;
        })()}
        <button class="btn ghost" onclick="window.__go('review')">${IC.review}<span>查看复盘</span></button>
        <button class="btn primary" onclick="window.__go('tasks')">${IC.plus}<span>开始今日学习</span></button>
      </div>
    </div>

    ${(() => {
      // ---- 今日行动驾驶舱：今天该干啥，一眼三件事 ----
      const tday = Stats.ymd(new Date());
      const dayTasks = DB.tasks.filter(t => t.level === 'day' && (!t.date || t.date === tday));
      const undone = dayTasks.filter(t => !t.done);
      const show = undone.concat(dayTasks.filter(t => t.done)).slice(0, 5);
      const lastRev = DB.reviews.slice().sort((a, b) => String(b.date).localeCompare(String(a.date))).find(r => (r.plan || []).length);
      return `
      <div class="grid cockpit-grid">
        <div class="card ck-card">
          <div class="section-title">${IC.tasks}<span style="margin-left:6px">今日任务</span><span class="meta">${dayTasks.length - undone.length}/${dayTasks.length} · 点击勾选</span></div>
          ${show.length ? `<div class="ck-tasks">${show.map(t => `
            <div class="ck-task ${t.done ? 'done' : ''}" data-dashtoggle="${t.id}" role="button" tabindex="0">
              <span class="mt-box">${t.done ? IC.check : ''}</span>
              <span class="mt-name">${MD.esc(t.name)}</span>
              <span class="mt-dur mono">${t.dur}min</span>
            </div>`).join('')}</div>`
          : `<div class="ck-empty">今天还没有任务。${lastRev && !lastRev.planImported ? '右侧有昨日复盘的规划可一键转入 →' : '去「学习计划」添加，或从复盘规划生成。'}</div>`}
          <button class="btn ghost sm" style="margin-top:12px;width:100%;justify-content:center" onclick="window.__go('tasks')">管理计划 ${IC.arrow}</button>
        </div>

        <div class="card ck-card ck-srs">
          <div class="section-title">${IC.refresh}<span style="margin-left:6px">待复习错题</span></div>
          <div class="ck-big ${S.reviewDue ? 'hl' : ''}">${S.reviewDue}<span class="ck-unit">题到期</span></div>
          <div class="ck-sub">${S.reviewDue ? '间隔重复引擎已为你排好今天的复习队列' : '今日复习已清空，明天再来 🎉'}</div>
          <button class="btn ${S.reviewDue ? 'primary' : 'ghost'} sm" style="margin-top:auto;width:100%;justify-content:center" id="ckStartReview" ${S.reviewDue ? '' : 'disabled style="margin-top:auto;width:100%;justify-content:center;opacity:.5"'}>${IC.bolt}<span>开始复习</span></button>
        </div>

        <div class="card ck-card">
          <div class="section-title">${IC.review}<span style="margin-left:6px">复盘 → 今日规划</span>${lastRev ? `<span class="meta">${lastRev.date.slice(5)} ${lastRev.wd}</span>` : ''}</div>
          ${lastRev ? `
            <ul class="ck-plan">${lastRev.plan.slice(0, 4).map(p => `<li>${MD.esc(p)}</li>`).join('')}</ul>
            ${lastRev.planImported
              ? `<div class="plan-imported mono" style="margin-top:auto">${IC.check} 已转为任务</div>`
              : `<button class="btn primary sm" style="margin-top:auto;width:100%;justify-content:center" id="ckImportPlan" data-rev="${lastRev.id}">${IC.plus}<span>转为今日任务</span></button>`}`
          : `<div class="ck-empty">还没有写过带「次日规划」的复盘。今晚学完写一条，明早这里就会提醒你。</div>
             <button class="btn ghost sm" style="margin-top:auto;width:100%;justify-content:center" onclick="window.__go('review')">去写复盘 ${IC.arrow}</button>`}
        </div>
      </div>`;
    })()}

    <div class="grid stat-grid">${s.map(statCard).join('')}</div>

    <div class="grid dash-lower">
      <div class="card">
        <div class="section-title">本周学习趋势<span class="meta">单位：分钟 / 天</span></div>
        <div class="trend-meta">
          <div><div class="tm-num hl">${S.weeklyTotal}<span class="tm-u">min</span></div><div class="tm-l">本周累计</div></div>
          <div><div class="tm-num">${S.dailyAvg}<span class="tm-u">min</span></div><div class="tm-l">日均</div></div>
          <div><div class="tm-num" style="color:${S.weekDeltaPct>=0?'var(--green)':'var(--red)'}">${S.weekDeltaPct>=0?'+':''}${S.weekDeltaPct}%</div><div class="tm-l">较上周</div></div>
        </div>
        ${trendSvg}
      </div>

      <div class="card">
        <div class="section-title">近期学习轨迹<span class="meta">近 5 周</span></div>
        <div class="heat-week">${weekdays.map(d => `<div class="heat-wd">${d}</div>`).join('')}</div>
        <div class="heat-grid">${S.heat.map(heatCell).join('')}</div>
        <div class="heat-legend"><span>少</span>
          ${[0,1,2,3,4].map(v => `<div class="heat-cell sm" style="background:color-mix(in oklab, var(--accent) ${[0.05,0.28,0.5,0.74,1][v]*100}%, var(--inset))"></div>`).join('')}
          <span>多</span>
        </div>
      </div>
    </div>

    <div class="grid dash-lower2">
      <div class="card">
        ${(() => {
          const cs = Stats.currentStage();
          if (!cs) return `<div class="section-title">当前阶段</div><div class="ck-empty">还没有学习计划。去「学习计划」设定目标并拆解阶段。</div>
            <button class="btn ghost sm" style="margin-top:14px;width:100%;justify-content:center" onclick="window.__go('tasks')">建立计划 ${IC.arrow}</button>`;
          const prog = Stats.stageProgress(cs);
          const cw = Stats.currentWeek();
          const modInfo = cs.mod && DB.modules.find(m => m.id === cs.mod);
          const gp = Stats.goalProgress();
          return `
          <div class="section-title">当前阶段<span class="meta">${MD.esc(cs.name)} · ${cs.start ? cs.start.slice(5) + ' ~ ' + (cs.end || '').slice(5) : '进行中'}</span></div>
          <div class="cm-theme">${MD.esc(cs.theme)}</div>
          <div class="bar" style="height:9px;margin:14px 0 8px"><span style="width:${prog.pct}%"></span></div>
          <div class="cm-meta mono">${prog.derived ? `任务 ${prog.done}/${prog.total} 完成 · ${prog.pct}%` : `进度 ${prog.pct}%（暂无挂靠任务）`}${cw ? ` · 本周：${MD.esc(cw.name)}` : ''}</div>
          <div class="mini-stat-row" style="margin-top:14px">
            <div class="mini-stat"><div class="ms-n hl">${gp}%</div><div class="ms-l">总目标进度</div></div>
            <div class="mini-stat"><div class="ms-n">${prog.total}</div><div class="ms-l">阶段任务</div></div>
            <div class="mini-stat"><div class="ms-n">${modInfo ? MD.esc(modInfo.label) : '—'}</div><div class="ms-l">关联模块</div></div>
          </div>
          <button class="btn ghost sm" style="margin-top:14px;width:100%;justify-content:center" onclick="window.__go('quiz')">刷本阶段的题 ${IC.arrow}</button>`;
        })()}
      </div>

      <div class="card">
        <div class="section-title">最近笔记<span class="meta">本周 +${S.notesThisWeek}</span></div>
        <div class="recent-notes">
          ${DB.notes.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 3).map(n => {
            const m = DB.modules.find(x => x.id === n.mod) || DB.modules[0];
            return `<div class="recent-note" onclick="window.__go('notes')" role="button" tabindex="0">
              <span class="rn-dot" style="background:${m.dot}"></span>
              <div class="rn-body"><div class="rn-title">${MD.esc(n.title)}</div>
              <div class="rn-meta"><span class="mono" style="color:${m.dot}">${MD.esc(m.label)}</span> · ${MD.esc(Stats.timeLabel(n))}</div></div>
              <span class="rn-arrow">${IC.chevron}</span>
            </div>`;
          }).join('')}
        </div>
        <div class="divider"></div>
        <div class="mini-stat-row">
          <div class="mini-stat"><div class="ms-n hl">${S.notesTotal}</div><div class="ms-l">总笔记</div></div>
          <div class="mini-stat"><div class="ms-n">${S.modulesCount}</div><div class="ms-l">知识模块</div></div>
          <div class="mini-stat"><div class="ms-n" style="color:var(--green)">${acc}</div><div class="ms-l">平均正确率</div></div>
        </div>
      </div>
    </div>`;
};

window.__bindPage = window.__bindPage || {};
window.__bindPage.dashboard = function () {
  const exp = document.getElementById('dashExport');
  if (exp && window.__exportJSON) exp.addEventListener('click', window.__exportJSON);

  // 驾驶舱：勾选今日任务
  document.querySelectorAll('[data-dashtoggle]').forEach(el => el.addEventListener('click', () => {
    const t = DB.tasks.find(x => x.id === el.dataset.dashtoggle);
    if (!t) return;
    t.done = !t.done;
    if (t.done) { t.doneAt = Date.now(); if (window.Stats) Stats.logStudy(t.dur, t.mod); }
    window.__rerender();
  }));

  // 驾驶舱：直接进入错题复习会话
  const sr = document.getElementById('ckStartReview');
  if (sr) sr.addEventListener('click', () => {
    if (window.__startMistakeReview) window.__startMistakeReview();
    window.__go('mistakes');
  });

  // 驾驶舱：昨日复盘规划 → 今日任务
  const ip = document.getElementById('ckImportPlan');
  if (ip) ip.addEventListener('click', () => {
    if (window.__importPlanTasks && window.__importPlanTasks(ip.dataset.rev)) window.__rerender();
  });
};
