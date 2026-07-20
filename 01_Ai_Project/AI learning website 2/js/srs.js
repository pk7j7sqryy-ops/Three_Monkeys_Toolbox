/* ============================================================
   Ailearn — 间隔重复引擎 (SM-2)
   给错题（及任意可复习条目）赋予复习调度：到期才复习，按回忆质量
   动态拉长/重置间隔。纯前端、纯函数，状态存在条目的 .srs 字段里随表持久化。
   ------------------------------------------------------------
   srs 状态：{ ef, interval, reps, due, last }
     ef       记忆易度因子（>=1.3，越大间隔增长越快）
     interval 当前间隔（天）
     reps     连续答对次数
     due      下次到期时间（epoch ms）
     last     上次复习时间（epoch ms）
   评分 grade：'again'(重来) | 'hard'(困难) | 'good'(良好) | 'easy'(简单)
   ============================================================ */
window.SRS = (function () {
  const DAY = 86400000;
  const GRADE_Q = { again: 2, hard: 3, good: 4, easy: 5 }; // 映射到 SM-2 的 0..5 质量
  const GRADES = [
    { key: 'again', label: '重来', tone: 'var(--red)' },
    { key: 'hard', label: '困难', tone: '#f5a623' },
    { key: 'good', label: '良好', tone: 'var(--green)' },
    { key: 'easy', label: '简单', tone: 'var(--blue)' },
  ];

  function startOfDay(ms) { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); }

  /* 确保条目有初始 srs 状态：新条目立即到期（today），等待首次复习 */
  function ensure(item) {
    if (!item.srs) item.srs = { ef: 2.5, interval: 0, reps: 0, due: startOfDay(Date.now()), last: 0 };
    return item.srs;
  }

  function isDue(item, atMs) {
    const s = ensure(item);
    return s.due <= (atMs || Date.now());
  }

  /* 取到期待复习条目（默认按到期时间升序，最久未复习的优先） */
  function due(items, atMs) {
    const now = atMs || Date.now();
    return (items || []).filter(i => ensure(i).due <= now).sort((a, b) => a.srs.due - b.srs.due);
  }

  /* 按一次复习评分更新调度，返回更新后的 srs */
  function review(item, grade) {
    const s = ensure(item);
    const q = GRADE_Q[grade] != null ? GRADE_Q[grade] : 4;
    if (q < 3) {
      // 没记住：重置连对，明天再来
      s.reps = 0;
      s.interval = 1;
    } else {
      if (s.reps === 0) s.interval = 1;
      else if (s.reps === 1) s.interval = 6;
      else s.interval = Math.round(s.interval * s.ef);
      s.reps += 1;
      // easy 额外拉长
      if (grade === 'easy') s.interval = Math.round(s.interval * 1.3);
    }
    // 更新易度因子（SM-2 公式）
    s.ef = Math.max(1.3, s.ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
    s.last = Date.now();
    s.due = startOfDay(Date.now()) + s.interval * DAY;
    if (window.Store) Store.save();
    return s;
  }

  /* 人类可读的下次复习时间（用于 UI 提示） */
  function nextLabel(item) {
    const s = ensure(item);
    const days = Math.max(0, Math.round((startOfDay(s.due) - startOfDay(Date.now())) / DAY));
    if (days <= 0) return '今天';
    if (days === 1) return '明天';
    if (days < 30) return days + ' 天后';
    return Math.round(days / 30) + ' 个月后';
  }

  return { ensure, isDue, due, review, nextLabel, GRADES, DAY };
})();
