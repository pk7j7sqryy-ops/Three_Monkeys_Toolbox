/* ============================================================
   Ailearn — 派生统计层
   所有首页 KPI / 趋势 / 热力 / 模块计数都从真实数据表实时计算：
     notes / tasks / mistakes / reviews + activity(学习活动日志) + quizResults
   不再使用 data.js 里写死的 stats / trend / heat 等常量。
   ============================================================ */
window.Stats = (function () {
  const DAY = 86400000;
  function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function today() { return startOfDay(new Date()); }
  function ymd(d) {
    const x = new Date(d);
    return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
  }
  // 确定性 PRNG：保证种子数据在持久化之前每次刷新一致
  function makeRnd(seed) { return function () { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }; }

  /* 首次运行时补种历史数据，使图表非空且此后完全数据驱动 */
  function ensureSeed() {
    let changed = false;
    if (!Array.isArray(DB.activity)) DB.activity = [];
    if (!Array.isArray(DB.quizResults)) DB.quizResults = [];

    if (DB.activity.length === 0) {
      const mods = DB.modules.map(m => m.id), rnd = makeRnd(20260610), base = today();
      for (let i = 34; i >= 0; i--) {
        const d = new Date(base.getTime() - i * DAY), wd = d.getDay();
        if (rnd() < 0.08 && i > 2) continue; // 偶有休息日（近 3 天保证有记录，连续打卡好看）
        const min = Math.round((55 + rnd() * 160) * (wd === 0 ? 0.55 : wd === 6 ? 0.8 : 1));
        DB.activity.push({ date: ymd(d), min, mod: mods[Math.floor(rnd() * mods.length)] });
      }
      changed = true;
    }
    if (DB.quizResults.length === 0) {
      const rnd = makeRnd(771), base = today();
      for (let i = 0; i < 24; i++) DB.quizResults.push({ id: 'seedq' + i, correct: rnd() < 0.81, at: base.getTime() - Math.floor(rnd() * 30) * DAY });
      changed = true;
    }
    // 给内置记录补真实时间戳，使「本周新增」类指标真实可算
    const t = today().getTime(), r2 = makeRnd(424242), r3 = makeRnd(99);
    (DB.notes || []).forEach(n => { if (!n.createdAt) { n.createdAt = t - Math.floor(r2() * 20) * DAY; changed = true; } });
    (DB.mistakes || []).forEach(m => { if (!m.createdAt) { m.createdAt = t - Math.floor(r3() * 14) * DAY; changed = true; } });

    if (changed && window.Store) Store.save();
  }

  function minutesByDay() {
    const map = {};
    (DB.activity || []).forEach(a => { map[a.date] = (map[a.date] || 0) + (a.min || 0); });
    return map;
  }

  function quizAccuracy() {
    const qr = DB.quizResults || [];
    if (!qr.length) return null;
    return Math.round(qr.filter(q => q.correct).length / qr.length * 100);
  }

  function compute() {
    ensureSeed();
    const t = today(), tms = t.getTime(), byDay = minutesByDay();
    const notes = DB.notes || [], tasks = DB.tasks || [], mistakes = DB.mistakes || [];

    /* ---- 计数类（当前状态直接派生） ---- */
    const notesTotal = notes.length;
    const notesPerMod = {}; DB.modules.forEach(m => notesPerMod[m.id] = 0);
    notes.forEach(n => { if (notesPerMod[n.mod] != null) notesPerMod[n.mod]++; });
    const weekAgo = tms - 6 * DAY;
    const notesThisWeek = notes.filter(n => n.createdAt && n.createdAt >= weekAgo).length;

    // 今日任务 = 日级任务且日期为今天（无日期的旧数据也算，避免被隐藏）
    const tday = ymd(today());
    const dayTasks = tasks.filter(x => x.level === 'day' && (!x.date || x.date === tday));
    const tasksDayDone = dayTasks.filter(x => x.done).length;
    const tasksAllDone = tasks.filter(x => x.done).length;
    const studyDone = tasks.reduce((a, x) => a + (x.done ? (x.dur || 0) : 0), 0);

    const mistakesTotal = mistakes.length;
    const mistakesMastered = mistakes.filter(m => m.mastered).length;
    const mistakesPending = mistakesTotal - mistakesMastered;
    // 今日待复习：未掌握且已到期的错题（SM-2 调度）
    const reviewDue = window.SRS ? SRS.due(mistakes.filter(m => !m.mastered)).length : 0;

    /* ---- 时间序列类（来自活动日志） ---- */
    // 本周趋势：周一..周日
    const dow = (t.getDay() + 6) % 7; // 周一=0
    const monday = tms - dow * DAY;
    const trend = [], trendLabels = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
    for (let i = 0; i < 7; i++) trend.push(byDay[ymd(new Date(monday + i * DAY))] || 0);
    const weeklyTotal = trend.reduce((a, b) => a + b, 0);
    const activeDays = trend.filter(v => v > 0).length;
    const dailyAvg = activeDays ? Math.round(weeklyTotal / activeDays) : 0;
    let prevTotal = 0; for (let i = 1; i <= 7; i++) prevTotal += byDay[ymd(new Date(monday - i * DAY))] || 0;
    const weekDeltaPct = prevTotal ? Math.round((weeklyTotal - prevTotal) / prevTotal * 100) : 0;

    // 近 35 天热力（0..4 档）
    const heat = [];
    for (let i = 34; i >= 0; i--) {
      const v = byDay[ymd(new Date(tms - i * DAY))] || 0;
      heat.push(v === 0 ? 0 : v < 40 ? 1 : v < 90 ? 2 : v < 150 ? 3 : 4);
    }

    // 连续打卡 & 阶段天数
    let streak = 0; for (let i = 0; ; i++) { if ((byDay[ymd(new Date(tms - i * DAY))] || 0) > 0) streak++; else break; }
    const dates = Object.keys(byDay).sort();
    const stageDays = dates.length ? Math.round((tms - startOfDay(dates[0]).getTime()) / DAY) + 1 : 0;

    // 各模块学习时长占比（供模块完成率派生）
    const modMin = {}; (DB.activity || []).forEach(a => { modMin[a.mod] = (modMin[a.mod] || 0) + (a.min || 0); });

    const quizDone = (DB.quizResults || []).length;
    const accuracy = quizAccuracy();

    return {
      notesTotal, notesPerMod, notesThisWeek, modulesCount: DB.modules.length,
      tasksDayDone, tasksDayTotal: dayTasks.length, tasksAllDone, tasksTotal: tasks.length, studyDone,
      mistakesTotal, mistakesMastered, mistakesPending, reviewDue,
      trend, trendLabels, weeklyTotal, dailyAvg, weekDeltaPct, heat, streak, stageDays, modMin,
      quizDone, accuracy,
    };
  }

  /* 时间戳 → 相对时间文案。有 createdAt 的条目用它实时换算，
     避免写死的「刚刚 / 今天」字符串永久停留 */
  function relTime(ms) {
    if (!ms) return '';
    const diff = Date.now() - ms;
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return Math.floor(diff / 60000) + ' 分钟前';
    const days = Math.floor((today().getTime() - startOfDay(ms).getTime()) / DAY);
    if (days === 0) return Math.floor(diff / 3600000) + ' 小时前';
    if (days === 1) return '昨天';
    if (days < 7) return days + ' 天前';
    return ymd(ms);
  }
  /* 条目显示时间：优先 createdAt 实时换算，旧数据回退 time 字符串 */
  function timeLabel(item) { return item.createdAt ? relTime(item.createdAt) : (item.time || ''); }

  /* 记录一次学习活动（任务完成 / 刷题等调用），驱动趋势与热力增长 */
  function logStudy(min, mod) {
    ensureSeed();
    if (!min) return;
    DB.activity.push({ date: ymd(today()), min: min, mod: mod || 'base' });
    if (window.Store) Store.save();
  }

  /* 记录一次刷题结果，驱动正确率与自测次数 */
  function logQuiz(correct) {
    ensureSeed();
    DB.quizResults.push({ id: 'q' + Date.now(), correct: !!correct, at: Date.now() });
    if (window.Store) Store.save();
  }

  /* ============ 计划层级派生（目标→阶段→周→日，进度只算不填） ============ */

  /* 周任务进度 = 其下日任务完成度；无日任务时看自身勾选 */
  function weekProgress(w) {
    const days = (DB.tasks || []).filter(t => t.level === 'day' && t.weekId === w.id);
    if (!days.length) return { pct: w.done ? 100 : 0, total: 0, done: 0 };
    const done = days.filter(d => d.done).length;
    return { pct: Math.round(done / days.length * 100), total: days.length, done };
  }

  /* 阶段进度 = 叶子完成度。叶子 = 阶段下所有日任务 + 没有日任务的周任务 */
  function stageProgress(s) {
    const tasks = DB.tasks || [];
    const weeks = tasks.filter(t => t.level === 'week' && t.stageId === s.id);
    const weekIds = new Set(weeks.map(w => w.id));
    const days = tasks.filter(t => t.level === 'day' && (t.stageId === s.id || weekIds.has(t.weekId)));
    const withDays = new Set(days.map(d => d.weekId).filter(Boolean));
    const leaves = days.concat(weeks.filter(w => !withDays.has(w.id)));
    if (!leaves.length) return { pct: s.pct || 0, total: 0, done: 0, derived: false };
    const done = leaves.filter(x => x.done).length;
    return { pct: Math.round(done / leaves.length * 100), total: leaves.length, done, derived: true };
  }

  /* 总目标进度 = 各阶段进度均值 */
  function goalProgress() {
    const ss = DB.stages || [];
    if (!ss.length) return 0;
    return Math.round(ss.reduce((a, s) => a + stageProgress(s).pct, 0) / ss.length);
  }

  /* 当前阶段：今天落在哪个日期区间就是哪个；没设日期则取第一个未完成的 */
  function currentStage() {
    const t = ymd(today());
    const ss = DB.stages || [];
    return ss.find(s => s.start && s.end && s.start <= t && t <= s.end)
      || ss.find(s => stageProgress(s).pct < 100) || ss[ss.length - 1] || null;
  }

  /* 当前周任务：当前阶段下今天落在其区间内的周任务；否则第一个未完成的 */
  function currentWeek() {
    const cs = currentStage();
    if (!cs) return null;
    const t = ymd(today());
    const weeks = (DB.tasks || []).filter(x => x.level === 'week' && x.stageId === cs.id);
    return weeks.find(w => w.start && w.end && w.start <= t && t <= w.end)
      || weeks.find(w => weekProgress(w).pct < 100) || null;
  }

  return { compute, logStudy, logQuiz, ensureSeed, ymd, relTime, timeLabel,
    weekProgress, stageProgress, goalProgress, currentStage, currentWeek };
})();
