/* ============================================================
   Ailearn — 本地持久化层 (localStorage)
   持久化 notes / tasks / mistakes / reviews，并自动随每次重渲染保存
   ============================================================ */
(function () {
  const KEY = 'ailearn_data_v1';
  // 哪些 DB 字段需要持久化（用户可变的数据）
  const FIELDS = ['notes', 'tasks', 'mistakes', 'reviews', 'activity', 'quizResults', 'questions', 'stages', 'months'];
  const OBJ_FIELDS = ['goal'];  // 非数组的持久化字段
  let _lastSaveWarn = 0;
  let _lastSaved = ''; // 上次写入的序列化结果，内容未变时跳过写盘
  // 合并去重键：有 id 用 id；无 id 的表（如 activity）退化为整条内容签名
  const dedupKey = (x) => (x && x.id != null) ? 'id:' + x.id : 'j:' + JSON.stringify(x);

  const Store = {
    /* 把 localStorage 的数据合并进内存 DB（开机调用，须在首次渲染之前） */
    load() {
      try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return false;
        const saved = JSON.parse(raw);
        FIELDS.forEach(f => {
          if (Array.isArray(saved[f])) window.DB[f] = saved[f];
        });
        OBJ_FIELDS.forEach(f => {
          if (saved[f] && typeof saved[f] === 'object') window.DB[f] = saved[f];
        });
        return true;
      } catch (e) {
        console.warn('[Store] load failed', e);
        return false;
      }
    },

    /* 将内存 DB 写回 localStorage */
    save() {
      try {
        const out = {};
        FIELDS.forEach(f => { out[f] = window.DB[f]; });
        OBJ_FIELDS.forEach(f => { out[f] = window.DB[f]; });
        const body = JSON.stringify(out);
        if (body === _lastSaved) return true; // 数据没变，跳过写盘
        _lastSaved = body;
        out.__savedAt = Date.now();
        localStorage.setItem(KEY, JSON.stringify(out));
        return true;
      } catch (e) {
        console.warn('[Store] save failed', e);
        // 静默丢数据是最糟的失败方式——提示用户，但限频避免每次重渲染都弹
        if (window.toast && Date.now() - _lastSaveWarn > 60000) {
          _lastSaveWarn = Date.now();
          window.toast('本地保存失败（存储可能已满），请尽快导出 JSON 备份', 'err');
        }
        return false;
      }
    },

    /* 完整导出对象（含全部可持久字段 + 元信息） */
    exportData() {
      const out = { __app: 'Ailearn', __version: 2, __exportedAt: new Date().toISOString() };
      FIELDS.forEach(f => { out[f] = window.DB[f]; });
      OBJ_FIELDS.forEach(f => { out[f] = window.DB[f]; });
      return out;
    },

    /* 从对象导入；mode = 'replace' | 'merge' */
    importData(obj, mode) {
      if (!obj || typeof obj !== 'object') throw new Error('数据格式无效');
      FIELDS.forEach(f => {
        if (!Array.isArray(obj[f])) return;
        if (mode === 'merge') {
          const existing = window.DB[f] || [];
          const seen = new Set(existing.map(dedupKey));
          const incoming = obj[f].filter(x => !seen.has(dedupKey(x)));
          window.DB[f] = existing.concat(incoming);
        } else {
          window.DB[f] = obj[f];
        }
      });
      this.save();
    },

    /* 重置为内置示例数据（清空 localStorage） */
    reset() {
      try { localStorage.removeItem(KEY); } catch (e) {}
      location.reload();
    },

    meta() {
      try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return null;
        const o = JSON.parse(raw);
        return { savedAt: o.__savedAt, bytes: raw.length };
      } catch (e) { return null; }
    },
  };

  window.Store = Store;

  // 立即水合（此脚本须在 data.js 之后、app.js 之前加载）
  Store.load();

  /* ---- v1 → v2 迁移：月主题 → 带日期的阶段；扁平任务 → 周/日层级 ---- */
  (function migrate() {
    const DB = window.DB;
    // 旧档有 months 而没存过 stages → months 转 stages（日期留空，由用户补）
    let savedHasStages = false;
    try { savedHasStages = Array.isArray(JSON.parse(localStorage.getItem(KEY) || '{}').stages); } catch (e) {}
    if (!savedHasStages && Array.isArray(DB.months) && DB.months.length) {
      DB.stages = DB.months.map((m, i) => ({
        id: m.id || 'st' + (i + 1), name: m.m || ('第 ' + (i + 1) + ' 阶段'), theme: m.theme || '',
        start: '', end: '', mod: m.mod || '', noteIds: m.noteIds || [], pct: m.pct || 0,
      }));
    }
    delete DB.months;
    // 旧任务（stage:'day'|'week'|'month' + monthId）→ 新层级
    const stageIdOf = (mid) => { const i = (DB.stages || []).findIndex(s => s.id === mid || s.id === String(mid).replace('mo', 'st')); return i >= 0 ? DB.stages[i].id : ''; };
    (DB.tasks || []).forEach(t => {
      if (t.level) return;
      if (t.stage === 'day') { t.level = 'day'; t.stageId = stageIdOf(t.monthId); }
      else { t.level = 'week'; t.stageId = stageIdOf(t.monthId); }
      delete t.stage; delete t.monthId;
    });
    // 回填阶段绑定：按模块匹配阶段（mistakes / notes 缺 stageId 时）
    const stageByMod = (mod) => { const s = (DB.stages || []).find(x => x.mod && x.mod === mod); return s ? s.id : ''; };
    (DB.mistakes || []).forEach(m => { if (m.stageId == null) m.stageId = stageByMod(m.mod); });
    (DB.notes || []).forEach(n => { if (n.stageId == null) n.stageId = stageByMod(n.mod); if (n.parentId == null) n.parentId = ''; });
    (DB.reviews || []).forEach(r => { if (!r.rtype) r.rtype = 'day'; if (r.stageId == null) r.stageId = stageByMod(r.tag); });
  })();

  // app.js 启动后包裹 __rerender，使每次数据变更后自动保存
  window.addEventListener('DOMContentLoaded', function () {
    if (typeof window.__rerender === 'function' && !window.__rerender.__wrapped) {
      const inner = window.__rerender;
      const wrapped = function () { inner.apply(this, arguments); Store.save(); };
      wrapped.__wrapped = true;
      window.__rerender = wrapped;
    }
  });
})();
