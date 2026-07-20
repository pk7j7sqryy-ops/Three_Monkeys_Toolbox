/* ===================== 自测刷题中心（题库版） ===================== */
const QUIZ_CATS = [['basic', '基础题'], ['stage', '阶段题'], ['interview', '面试题'], ['mixed', '混合题']];
const QUIZ_TYPES = [['single', '单选题'], ['multi', '多选题'], ['short', '简答题'], ['code', '代码问答']];

let QUIZ_CAT = 'basic';
let QUIZ_TYPE = 'single';
let QUIZ_IDX = 0;
let QUIZ_CHOSEN = [];   // 选择题已选项
let QUIZ_ANSWER = '';   // 简答/代码作答
let QUIZ_SUBMITTED = false;
let QUIZ_MOD_FILTER = '';  // 按当前月主题模块筛题（空 = 不筛）

function quizMod(id) { return DB.modules.find(m => m.id === id) || { label: id || '通用', dot: '#888' }; }
function quizList() {
  return (DB.questions || []).filter(q => q.cat === QUIZ_CAT && q.type === QUIZ_TYPE && (!QUIZ_MOD_FILTER || q.mod === QUIZ_MOD_FILTER));
}
function catLabel(c) { return (QUIZ_CATS.find(x => x[0] === c) || [, c])[1]; }
function typeLabel(t) { return (QUIZ_TYPES.find(x => x[0] === t) || [, t])[1]; }

window.renderQuiz = function () {
  const list = quizList();
  if (QUIZ_IDX >= list.length) QUIZ_IDX = 0;
  const q = list[QUIZ_IDX];

  // 真实统计（来自 quizResults）
  const qr = DB.quizResults || [];
  const correctN = qr.filter(x => x.correct).length;
  const attempts = qr.length;
  const liveAcc = attempts ? Math.round(correctN / attempts * 100) : 0;

  const catSeg = `<div class="seg" id="quizCatSeg">${QUIZ_CATS.map(([k, l]) =>
    `<button class="${k === QUIZ_CAT ? 'on' : ''}" data-cat="${k}">${l}</button>`).join('')}</div>`;
  const typeSeg = `<div class="seg" id="quizTypeSeg">${QUIZ_TYPES.map(([k, l]) => {
    const n = (DB.questions || []).filter(x => x.cat === QUIZ_CAT && x.type === k).length;
    return `<button class="${k === QUIZ_TYPE ? 'on' : ''}" data-type="${k}">${l}<span class="seg-ct">${n}</span></button>`;
  }).join('')}</div>`;

  return `
    <div class="page-head">
      <div>
        <h1 class="page-title">自测刷题中心</h1>
        <div class="page-sub">四类题集 × 四种题型 · 当前 <b>${catLabel(QUIZ_CAT)} · ${typeLabel(QUIZ_TYPE)}</b> · 共 <b>${list.length}</b> 题</div>
      </div>
      <div class="kbar">
        <button class="btn ghost" id="quizManage">${IC.list}<span>管理题库</span></button>
        <button class="btn ghost" id="quizImport">${IC.upload}<span>导入题库</span></button>
        <button class="btn primary" id="quizAdd">${IC.plus}<span>新增题目</span></button>
      </div>
    </div>

    ${(() => {
      // 与学习计划联动：推荐刷当前阶段对应模块的题
      const cs = Stats.currentStage();
      if (!cs) return '';
      const mi = cs.mod && DB.modules.find(m => m.id === cs.mod);
      return `<div class="quiz-theme card">
        <span class="qt-ic">${IC.target}</span>
        <div class="qt-body"><b>当前阶段</b>　${MD.esc(cs.name)} · ${MD.esc(cs.theme)}</div>
        ${mi ? `<button class="btn ${QUIZ_MOD_FILTER ? 'primary' : 'ghost'} sm" id="quizThemeFilter" data-mod="${mi.id}">${QUIZ_MOD_FILTER ? '✓ 只看「' + MD.esc(mi.label) + '」· 点击取消' : '只刷「' + MD.esc(mi.label) + '」的题'}</button>`
            : `<span class="qt-hint">在学习计划里给该阶段设置「关联模块」后，可一键筛题</span>`}
      </div>`;
    })()}

    <div class="quiz-filters">
      <div class="qf-row"><span class="qf-label">题集</span>${catSeg}</div>
      <div class="qf-row"><span class="qf-label">题型</span>${typeSeg}</div>
    </div>

    <div class="quiz-progress card">
      <div class="qp-item"><div class="qp-n hl">${list.length ? QUIZ_IDX + 1 : 0}<span>/${list.length}</span></div><div class="qp-l">本类进度</div></div>
      <div class="qp-bar"><div class="bar" style="height:9px"><span style="width:${list.length ? (QUIZ_IDX + 1) / list.length * 100 : 0}%"></span></div>
        <div class="qp-bar-meta"><span>累计作答 ${attempts} 题</span><span>本类共 ${list.length} 题</span></div></div>
      <div class="qp-item"><div class="qp-n" style="color:var(--green)">${correctN}</div><div class="qp-l">累计答对</div></div>
      <div class="qp-item"><div class="qp-n" style="color:var(--red)">${attempts - correctN}</div><div class="qp-l">累计答错</div></div>
      <div class="qp-item"><div class="qp-n">${liveAcc}<span>%</span></div><div class="qp-l">正确率</div></div>
    </div>

    ${q ? renderQuestionCard(q, list.length) : `
      <div class="card empty-card">
        「${catLabel(QUIZ_CAT)} · ${typeLabel(QUIZ_TYPE)}」下暂无题目。点右上角「新增题目」或「导入题库」添加。
      </div>`}

    <div class="ai-gen card">
      <div class="section-title">${IC.sparkles}<span style="margin-left:4px">AI 出题（本地 Ollama）</span></div>
      <div class="ai-gen-row">
        <input type="text" id="aiTopic" class="editor-input" style="flex:1" value="${MD.esc((Stats.currentStage() || {}).theme || '')}" placeholder="输入主题，如：RAG 重排序 / 多头注意力 / ReAct 循环…" />
        <select id="aiQType" class="editor-select">
          <option value="简答">简答题</option><option value="单选">单选题</option>
          <option value="多选">多选题</option><option value="代码">代码题</option>
        </select>
        <button class="ai-btn" id="aiGenBtn">${IC.sparkles}<span>生成题目</span></button>
      </div>
      <div id="aiGenOut"></div>
    </div>`;
};

function renderQuestionCard(q, total) {
  const m = quizMod(q.mod);
  let body = '';

  if (q.type === 'single' || q.type === 'multi') {
    const opt = (o) => {
      const chosen = QUIZ_CHOSEN.includes(o.k);
      const correct = (q.answer || []).includes(o.k);
      let cls = 'qopt';
      if (QUIZ_SUBMITTED) { if (correct) cls += ' correct'; else if (chosen) cls += ' wrong'; }
      else if (chosen) cls += ' chosen';
      const mark = QUIZ_SUBMITTED
        ? (correct ? `<span class="qmark ok">${IC.check}</span>` : (chosen ? `<span class="qmark no">✕</span>` : `<span class="qkey">${o.k}</span>`))
        : `<span class="qkey">${o.k}</span>`;
      return `<button class="${cls}" data-opt="${o.k}">${mark}<span class="qtext">${MD.esc(o.t)}</span></button>`;
    };
    body = `<div class="quiz-opts">${(q.options || []).map(opt).join('')}</div>
      ${QUIZ_SUBMITTED && q.explain ? `<div class="quiz-result"><div class="qr-head"><span class="qr-ic" style="background:var(--blue);color:#06101f">${IC.bulb}</span> 解析</div><div class="qr-explain">${MD.esc(q.explain)}</div></div>` : ''}`;
  } else {
    // 简答 / 代码：作答 → 显示参考答案 → 自评
    const isCode = q.type === 'code';
    body = `
      <textarea id="ansArea" class="${isCode ? 'code-editor' : 'q-textarea'}" placeholder="${isCode ? '在此写下你的实现…' : '请输入你的答案…'}" ${QUIZ_SUBMITTED ? 'disabled' : ''}>${MD.esc(QUIZ_ANSWER)}</textarea>
      ${QUIZ_SUBMITTED ? `
        <div class="quiz-result">
          <div class="qr-head"><span class="qr-ic ok">${IC.check}</span> 参考答案</div>
          ${isCode ? `<div class="code-window" style="margin:10px 0"><pre class="code">${MD.esc(q.answer || '')}</pre></div>` : `<div class="qr-explain">${MD.esc(q.answer || '').replace(/\n/g, '<br/>')}</div>`}
          ${q.explain ? `<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--line)"><b>解析：</b>${MD.esc(q.explain)}</div>` : ''}
          <div class="section-title" style="margin-top:16px">对照参考答案，你答对了吗？</div>
          <div class="quiz-actions" style="gap:10px">
            <button class="btn rev-grade" data-selfgrade="1" style="border-color:var(--green);color:var(--green)"><b>答对了</b></button>
            <button class="btn rev-grade" data-selfgrade="0" style="border-color:var(--red);color:var(--red)"><b>答错了</b></button>
          </div>
        </div>` : ''}`;
  }

  return `
    <div class="quiz-card card">
      <div class="quiz-q-head">
        <span class="chip solid">第 ${QUIZ_IDX + 1} 题</span>
        <span class="chip">${typeLabel(q.type)}</span>
        <span class="chip" style="border-color:transparent;background:color-mix(in oklab, ${m.dot} 16%, transparent);color:${m.dot}">${MD.esc(m.label)}</span>
        <span class="qflag mono">${QUIZ_SUBMITTED ? '已提交' : '作答中'}</span>
        <button class="btn ghost sm" data-qedit="${q.id}" style="margin-left:auto;padding:4px 10px" title="编辑">${IC.edit}</button>
        <button class="btn ghost sm" data-qdel="${q.id}" style="color:var(--red);padding:4px 10px" title="删除">${IC.trash}</button>
      </div>
      <div class="quiz-q">${MD.esc(q.q).replace(/\n/g, '<br/>')}</div>
      ${body}
      <div class="quiz-actions">
        <button class="btn ghost" id="qReset">${IC.refresh}<span>重置</span></button>
        <div style="flex:1"></div>
        <button class="btn" id="qPrev" ${QUIZ_IDX === 0 ? 'disabled' : ''}>上一题</button>
        ${(q.type === 'single' || q.type === 'multi') && !QUIZ_SUBMITTED
          ? `<button class="btn primary" id="qSubmit">${IC.check}<span>提交答案</span></button>`
          : (q.type === 'short' || q.type === 'code') && !QUIZ_SUBMITTED
            ? `<button class="btn primary" id="qSubmit">${IC.bulb}<span>显示参考答案</span></button>`
            : `<button class="btn primary" id="qNext">下一题 ${IC.arrow}</button>`}
      </div>
    </div>`;
}

/* ---- 记录一次作答到 quizResults，并把答错的题归档进错题本 ---- */
function quizRecord(q, correct, yourAns) {
  if (window.Stats) Stats.logQuiz(!!correct);
  if (!correct) {
    const right = (q.type === 'single' || q.type === 'multi') ? (q.answer || []).join('、') : (q.answer || '');
    // 错题归档到阶段：优先题目自带 stageId，否则按模块匹配阶段，再否则当前阶段
    let stageId = q.stageId || '';
    if (!stageId) { const byMod = DB.stages.find(s => s.mod && s.mod === q.mod); stageId = byMod ? byMod.id : ((Stats.currentStage() || {}).id || ''); }
    DB.mistakes.unshift({
      id: 'm' + Date.now(), mod: q.mod || 'base', stageId, type: typeLabel(q.type) + '错题', time: '刚刚', createdAt: Date.now(),
      q: q.q, your: yourAns || '（未作答）', right: right,
      reason: '自测作答错误，待复盘归因。', blind: '', related: '', mastered: false, star: false,
    });
    window.toast && window.toast('已记入错题本', 'ok');
  }
}

window.__bindPage = window.__bindPage || {};
window.__bindPage.quiz = function () {
  const list = quizList();
  const q = list[QUIZ_IDX];

  const resetState = () => { QUIZ_SUBMITTED = false; QUIZ_CHOSEN = []; QUIZ_ANSWER = ''; };

  document.querySelectorAll('#quizCatSeg button').forEach(b => b.addEventListener('click', () => {
    QUIZ_CAT = b.dataset.cat; QUIZ_IDX = 0; resetState(); window.__rerender();
  }));
  document.querySelectorAll('#quizTypeSeg button').forEach(b => b.addEventListener('click', () => {
    QUIZ_TYPE = b.dataset.type; QUIZ_IDX = 0; resetState(); window.__rerender();
  }));

  // 主题筛题开关
  const tf = document.getElementById('quizThemeFilter');
  if (tf) tf.addEventListener('click', () => {
    QUIZ_MOD_FILTER = QUIZ_MOD_FILTER ? '' : tf.dataset.mod;
    QUIZ_IDX = 0; resetState(); window.__rerender();
  });

  // 选择题选项
  document.querySelectorAll('[data-opt]').forEach(b => b.addEventListener('click', () => {
    if (QUIZ_SUBMITTED) return;
    const k = b.dataset.opt;
    if (q.type === 'single') QUIZ_CHOSEN = [k];
    else { const i = QUIZ_CHOSEN.indexOf(k); if (i >= 0) QUIZ_CHOSEN.splice(i, 1); else QUIZ_CHOSEN.push(k); }
    window.__rerender();
  }));

  const ansArea = document.getElementById('ansArea');
  if (ansArea) ansArea.addEventListener('input', (e) => { QUIZ_ANSWER = e.target.value; });

  // 提交（选择题判分 / 简答代码揭示答案）
  const sub = document.getElementById('qSubmit');
  if (sub) sub.addEventListener('click', () => {
    if (q.type === 'single' || q.type === 'multi') {
      if (!QUIZ_CHOSEN.length) return;
      const correct = [...QUIZ_CHOSEN].sort().join('') === [...(q.answer || [])].sort().join('');
      QUIZ_SUBMITTED = true;
      quizRecord(q, correct, QUIZ_CHOSEN.join('、'));
    } else {
      QUIZ_SUBMITTED = true;  // 仅揭示，自评在下方
    }
    window.__rerender();
  });

  // 简答/代码自评
  document.querySelectorAll('[data-selfgrade]').forEach(b => b.addEventListener('click', () => {
    quizRecord(q, b.dataset.selfgrade === '1', QUIZ_ANSWER);
    QUIZ_IDX = Math.min(QUIZ_IDX + 1, list.length - 1); resetState(); window.__rerender();
  }));

  const reset = document.getElementById('qReset');
  if (reset) reset.addEventListener('click', () => { resetState(); window.__rerender(); });
  const prev = document.getElementById('qPrev');
  if (prev) prev.addEventListener('click', () => { QUIZ_IDX = Math.max(0, QUIZ_IDX - 1); resetState(); window.__rerender(); });
  const next = document.getElementById('qNext');
  if (next) next.addEventListener('click', () => { QUIZ_IDX = Math.min(QUIZ_IDX + 1, list.length - 1); resetState(); window.__rerender(); });

  // 删除题目
  const del = document.querySelector('[data-qdel]');
  if (del) del.addEventListener('click', () => {
    window.__confirm('确定删除这道题目？', { danger: true, confirmLabel: '删除' }).then(ok => {
      if (!ok) return;
      DB.questions = DB.questions.filter(x => x.id !== del.dataset.qdel);
      QUIZ_IDX = 0; resetState(); window.toast('已删除题目', 'ok'); window.__rerender();
    });
  });

  const edit = document.querySelector('[data-qedit]');
  if (edit) edit.addEventListener('click', () => { const item = DB.questions.find(x => x.id === edit.dataset.qedit); if (item) openQuizForm(item); });

  document.getElementById('quizAdd') && document.getElementById('quizAdd').addEventListener('click', openQuizAdd);
  document.getElementById('quizImport') && document.getElementById('quizImport').addEventListener('click', openQuizImport);
  document.getElementById('quizManage') && document.getElementById('quizManage').addEventListener('click', openQuizManage);

  // AI 出题
  const genBtn = document.getElementById('aiGenBtn');
  if (genBtn) genBtn.addEventListener('click', async () => {
    if (!window.AI.cfg().enabled) { window.toast('请先在 AI 设置中启用本地 Ollama', 'err'); return; }
    const topic = document.getElementById('aiTopic').value.trim();
    if (!topic) { window.toast('请先输入出题主题', 'err'); return; }
    const type = document.getElementById('aiQType').value;
    const out = document.getElementById('aiGenOut');
    out.innerHTML = '<div class="ai-out loading"><span class="spin"></span> AI 正在出题…</div>';
    try {
      const txt = await window.AI.generateQuestion(topic, type);
      out.innerHTML = '<div class="ai-out"><div class="ai-out-head">' + IC.sparkles + '生成结果 · ' + type + '题</div>' + MD.esc(txt).replace(/\n/g, '<br/>') + '</div>';
    } catch (e) { out.innerHTML = '<div class="ai-out" style="color:var(--red)">⚠ ' + e.message + '</div>'; }
  });
};

/* ---- 手动新增题目（模态表单） ---- */
function openQuizAdd() { openQuizForm(null); }

function openQuizForm(editing) {
  const cur = editing || {};
  const sel = (v, x) => v === x ? 'selected' : '';
  const catV = editing ? cur.cat : QUIZ_CAT, typeV = editing ? cur.type : QUIZ_TYPE;
  const catOpts = QUIZ_CATS.map(([k, l]) => `<option value="${k}" ${sel(k, catV)}>${l}</option>`).join('');
  const typeOpts = QUIZ_TYPES.map(([k, l]) => `<option value="${k}" ${sel(k, typeV)}>${l}</option>`).join('');
  const modOpts = DB.modules.map(m => `<option value="${m.id}" ${sel(m.id, cur.mod)}>${m.label}</option>`).join('');
  // 选择题选项回填：正确项前加 *
  const optsText = (cur.options || []).map(o => ((cur.answer || []).includes(o.k) ? '*' : '') + o.t).join('\n');
  const ansText = Array.isArray(cur.answer) ? '' : (cur.answer || '');
  const body = `
    <div style="display:flex;gap:12px">
      <div class="fm-field" style="flex:1"><label>题集分类</label><select id="qaCat" class="fm-control">${catOpts}</select></div>
      <div class="fm-field" style="flex:1"><label>题型</label><select id="qaType" class="fm-control">${typeOpts}</select></div>
      <div class="fm-field" style="flex:1"><label>模块</label><select id="qaMod" class="fm-control">${modOpts}</select></div></div>
    <div class="fm-field"><label>题目 <span style="color:var(--accent)">*</span></label><textarea id="qaQ" class="fm-control" rows="3">${MD.esc(cur.q || '')}</textarea></div>
    <div id="qaOptWrap" class="fm-field"><label>选项（每行一个，正确项以 * 开头）</label>
      <textarea id="qaOpts" class="fm-control" rows="4" placeholder="*带重叠窗口的分块&#10;查询改写 / HyDE&#10;top-k 设为 1">${MD.esc(optsText)}</textarea>
      <div class="fm-hint">用 <span class="mono">*</span> 标出正确项，多选可标多个。</div></div>
    <div id="qaAnsWrap" class="fm-field" style="display:none"><label>参考答案</label><textarea id="qaAns" class="fm-control" rows="3">${MD.esc(ansText)}</textarea></div>
    <div class="fm-field"><label>解析（可选）</label><input id="qaExplain" class="fm-control" value="${MD.esc(cur.explain || '')}" /></div>
    <div class="fm-foot"><div style="flex:1"></div><button class="btn ghost" id="qaCancel">取消</button><button class="btn primary" id="qaSave">${IC.check}<span>${editing ? '保存修改' : '保存题目'}</span></button></div>`;
  window.__modal(editing ? '编辑题目' : '新增题目', body, {
    onMount(el) {
      const sync = () => {
        const t = el.querySelector('#qaType').value;
        el.querySelector('#qaOptWrap').style.display = (t === 'single' || t === 'multi') ? '' : 'none';
        el.querySelector('#qaAnsWrap').style.display = (t === 'short' || t === 'code') ? '' : 'none';
      };
      el.querySelector('#qaType').addEventListener('change', sync); sync();
      el.querySelector('#qaCancel').addEventListener('click', window.__closeModal);
      el.querySelector('#qaSave').addEventListener('click', () => {
        const type = el.querySelector('#qaType').value;
        const qtext = el.querySelector('#qaQ').value.trim();
        if (!qtext) return window.toast('请输入题目', 'err');
        const patch = { cat: el.querySelector('#qaCat').value, type, mod: el.querySelector('#qaMod').value, q: qtext, options: [], answer: '', explain: el.querySelector('#qaExplain').value.trim() };
        if (type === 'single' || type === 'multi') {
          const rows = el.querySelector('#qaOpts').value.split('\n').map(s => s.trim()).filter(Boolean);
          const keys = 'ABCDEFGH';
          patch.answer = [];
          patch.options = rows.map((r, i) => { const corr = r.startsWith('*'); const txt = corr ? r.slice(1).trim() : r; if (corr) patch.answer.push(keys[i]); return { k: keys[i], t: txt }; });
          if (!patch.options.length) return window.toast('请填写选项', 'err');
          if (!patch.answer.length) return window.toast('请用 * 标出至少一个正确项', 'err');
        } else {
          patch.answer = el.querySelector('#qaAns').value.trim();
        }
        if (editing) { Object.assign(editing, patch); }
        else { const item = Object.assign({ id: 'q' + Date.now() }, patch); DB.questions.push(item); }
        QUIZ_CAT = patch.cat; QUIZ_TYPE = patch.type; QUIZ_IDX = Math.max(0, quizList().findIndex(x => x.id === (editing ? editing.id : DB.questions[DB.questions.length - 1].id)));
        QUIZ_SUBMITTED = false; QUIZ_CHOSEN = []; QUIZ_ANSWER = '';
        window.__closeModal(); window.toast(editing ? '已保存修改' : '已新增题目', 'ok'); window.__rerender();
      });
    }
  });
}

/* ---- 导入题库（md / docx） ---- */
function openQuizImport() {
  const catOpts = QUIZ_CATS.map(([k, l]) => `<option value="${k}" ${k === QUIZ_CAT ? 'selected' : ''}>${l}</option>`).join('');
  const body = `
    <div class="fm-field"><label>导入到分类</label><select id="qiCat" class="fm-control">${catOpts}</select></div>
    <div class="fm-field"><label>选择文件（.md 或 .docx）</label><input type="file" id="qiFile" accept=".md,.markdown,.docx" class="dc-file" /></div>
    <div class="fm-hint">支持「答案：/分析：」格式的 Word 试卷，以及 Markdown 题库；自动识别单选 / 多选 / 简答 / 代码题。</div>
    <div id="qiOut" class="ai-test-out"></div>
    <div class="fm-foot"><div style="flex:1"></div><button class="btn ghost" id="qiCancel">取消</button><button class="btn primary" id="qiGo">${IC.upload}<span>解析并导入</span></button></div>`;
  window.__modal('导入题库', body, {
    onMount(el) {
      el.querySelector('#qiCancel').addEventListener('click', window.__closeModal);
      el.querySelector('#qiGo').addEventListener('click', async () => {
        const f = el.querySelector('#qiFile').files[0];
        if (!f) return window.toast('请先选择文件', 'err');
        const cat = el.querySelector('#qiCat').value;
        const out = el.querySelector('#qiOut'); out.className = 'ai-test-out show'; out.innerHTML = '<span class="spin"></span> 正在解析…';
        try {
          let qs;
          if (/\.docx$/i.test(f.name)) qs = await window.Importers.quizFromDocx(await window.Importers.readBuffer(f), cat);
          else qs = window.Importers.quizFromMd(await window.Importers.readText(f), cat);
          if (!qs.length) { out.className = 'ai-test-out show err'; out.innerHTML = '⚠ 未解析出题目，请检查文件格式。'; return; }
          // 按题型+题干内容去重，重复导入同一文件不再产生重复题
          const sig = (x) => x.type + '|' + String(x.q).replace(/\s+/g, ' ').trim();
          const have = new Set((DB.questions || []).map(sig));
          const fresh = qs.filter(x => !have.has(sig(x)));
          const skipped = qs.length - fresh.length;
          if (!fresh.length) { out.className = 'ai-test-out show err'; out.innerHTML = '⚠ ' + qs.length + ' 道题均已存在，未重复导入。'; return; }
          DB.questions.push(...fresh);
          QUIZ_CAT = cat; QUIZ_IDX = 0; QUIZ_SUBMITTED = false; QUIZ_CHOSEN = []; QUIZ_ANSWER = '';
          window.__closeModal();
          window.toast('已导入 ' + fresh.length + ' 道题目' + (skipped ? '（跳过重复 ' + skipped + ' 道）' : ''), 'ok');
          window.__rerender();
        } catch (e) { out.className = 'ai-test-out show err'; out.innerHTML = '⚠ 导入失败：' + e.message; }
      });
    }
  });
}

/* ---- 管理题库：批量删除 ---- */
function openQuizManage() {
  const rows = (list) => list.length ? list.map(q => `
    <label class="qm-row">
      <input type="checkbox" class="qm-cb" value="${q.id}" />
      <span class="qm-meta"><span class="chip sm">${catLabel(q.cat)}</span><span class="chip sm">${typeLabel(q.type)}</span></span>
      <span class="qm-q">${MD.esc(q.q)}</span>
    </label>`).join('') : '<div class="fm-hint" style="padding:20px;text-align:center">题库为空</div>';
  const body = `
    <div class="qm-toolbar"><label class="qm-allwrap"><input type="checkbox" id="qmAll" /> 全选</label><span id="qmCount" class="fm-hint" style="margin:0">已选 0 题</span></div>
    <div class="qm-list">${rows(DB.questions)}</div>
    <div class="fm-foot"><div style="flex:1"></div><button class="btn ghost" id="qmClose">关闭</button><button class="btn danger" id="qmDel">${IC.trash}<span>删除选中</span></button></div>`;
  window.__modal('管理题库 · 共 ' + DB.questions.length + ' 题', body, {
    onMount(el) {
      const cbs = () => [...el.querySelectorAll('.qm-cb')];
      const upd = () => { el.querySelector('#qmCount').textContent = '已选 ' + cbs().filter(c => c.checked).length + ' 题'; };
      el.addEventListener('change', upd);
      el.querySelector('#qmAll').addEventListener('change', (e) => { cbs().forEach(c => c.checked = e.target.checked); upd(); });
      el.querySelector('#qmClose').addEventListener('click', window.__closeModal);
      el.querySelector('#qmDel').addEventListener('click', () => {
        const ids = new Set(cbs().filter(c => c.checked).map(c => c.value));
        if (!ids.size) return window.toast('请先勾选题目', 'err');
        window.__confirm('确定删除选中的 ' + ids.size + ' 道题目？', { danger: true, confirmLabel: '删除' }).then(ok => {
          if (!ok) return;
          DB.questions = DB.questions.filter(q => !ids.has(q.id));
          QUIZ_IDX = 0; QUIZ_SUBMITTED = false; QUIZ_CHOSEN = []; QUIZ_ANSWER = '';
          window.__closeModal(); window.toast('已删除 ' + ids.size + ' 题', 'ok'); window.__rerender();
        });
      });
    }
  });
}
