/* ============================================================
   Ailearn — 工具层：模态框 / 提示 / 导入导出 / AI 设置
   ============================================================ */
(function () {
  /* ---------------- Toast ---------------- */
  function toast(msg, type) {
    let host = document.getElementById('toastHost');
    if (!host) {
      host = document.createElement('div');
      host.id = 'toastHost';
      host.className = 'toast-host';
      document.body.appendChild(host);
    }
    const t = document.createElement('div');
    t.className = 'toast ' + (type || '');
    t.textContent = (type === 'err' ? '⚠ ' : type === 'ok' ? '✓ ' : '') + msg; // textContent 防注入
    host.appendChild(t);
    requestAnimationFrame(() => t.classList.add('in'));
    setTimeout(() => { t.classList.remove('in'); setTimeout(() => t.remove(), 300); }, type === 'err' ? 5200 : 2600);
  }
  window.toast = toast;

  /* ---------------- Modal ---------------- */
  let _onClose = null;
  let _guard = null; // 软关闭守卫（Esc/遮罩/×）：返回 false 阻止关闭，用于防误关脏表单
  function modal(title, bodyHTML, opts) {
    opts = opts || {};
    closeModal();
    _onClose = opts.onClose || null;
    _guard = opts.guard || null;
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.id = 'modalBack';
    back.innerHTML = `
      <div class="modal" role="dialog">
        <div class="modal-head">
          <div class="modal-title">${title}</div>
          <button class="icon-btn" id="modalClose" title="关闭">
            <svg viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          </button>
        </div>
        <div class="modal-body">${bodyHTML}</div>
      </div>`;
    document.body.appendChild(back);
    requestAnimationFrame(() => back.classList.add('in'));
    back.addEventListener('mousedown', (e) => { if (e.target === back) requestClose(); });
    back.querySelector('#modalClose').addEventListener('click', requestClose);
    if (opts.onMount) opts.onMount(back.querySelector('.modal-body'));
    return back;
  }
  /* 软关闭：受守卫保护。代码主动关闭（保存成功等）请直接用 closeModal */
  function requestClose() {
    if (_guard && !_guard()) return;
    closeModal();
  }
  function closeModal() {
    const cb = _onClose; _onClose = null; _guard = null;
    const b = document.getElementById('modalBack');
    if (b) { b.classList.remove('in'); setTimeout(() => b.remove(), 220); }
    if (cb) cb();
  }
  window.__modal = modal;
  window.__closeModal = closeModal;
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') requestClose(); });

  /* ---------------- 统一风格的确认框 → Promise<bool> ---------------- */
  function confirmDialog(message, opts) {
    opts = opts || {};
    return new Promise((resolve) => {
      let settled = false; const finish = (v) => { if (!settled) { settled = true; resolve(v); } };
      modal(opts.title || '确认操作', `
        <div class="fm-msg">${message}</div>
        <div class="fm-foot" style="justify-content:flex-end">
          <button class="btn ghost" id="cfCancel">${opts.cancelLabel || '取消'}</button>
          <button class="btn ${opts.danger ? 'danger' : 'primary'}" id="cfOk">${opts.confirmLabel || '确定'}</button>
        </div>`, {
        onClose: () => finish(false),
        onMount(el) {
          el.querySelector('#cfOk').addEventListener('click', () => { finish(true); closeModal(); });
          el.querySelector('#cfCancel').addEventListener('click', closeModal);
        }
      });
    });
  }
  window.__confirm = confirmDialog;

  /* ---------------- 统一风格的表单弹窗 ----------------
     fields: [{ key, label, type:'text'|'number'|'textarea'|'select'|'segment'|'checks',
                value, placeholder, options:[[val,label]], hint, rows, required }]
     checks 为复选框多选，value 为选中值数组，提交时返回数组
     opts: { submitLabel, onSubmit(values)->true关闭/字符串报错, onDelete, deleteLabel } */
  function renderField(f) {
    const lbl = `<label>${f.label || ''}${f.required ? ' <span style="color:var(--accent)">*</span>' : ''}</label>`;
    let ctrl = '';
    const v = f.value == null ? '' : String(f.value);
    if (f.type === 'textarea') ctrl = `<textarea class="fm-control" data-key="${f.key}" rows="${f.rows || 4}" placeholder="${f.placeholder || ''}">${escAttr(v)}</textarea>`;
    else if (f.type === 'select') ctrl = `<select class="fm-control" data-key="${f.key}">${(f.options || []).map(o => `<option value="${o[0]}" ${o[0] === f.value ? 'selected' : ''}>${o[1]}</option>`).join('')}</select>`;
    else if (f.type === 'segment') ctrl = `<div class="seg fm-seg" data-key="${f.key}">${(f.options || []).map((o, i) => `<button type="button" data-val="${o[0]}" class="${(f.value != null ? f.value === o[0] : i === 0) ? 'on' : ''}">${o[1]}</button>`).join('')}</div>`;
    else if (f.type === 'checks') ctrl = `<div class="fm-checks" data-key="${f.key}">${
      (f.options || []).length
        ? (f.options || []).map(o => `<label class="fm-check"><input type="checkbox" value="${escAttr(o[0])}" ${(f.value || []).indexOf(o[0]) > -1 ? 'checked' : ''}/><span>${escAttr(o[1])}</span></label>`).join('')
        : '<div class="fm-checks-empty">暂无可选项</div>'
    }</div>`;
    else ctrl = `<input class="fm-control" data-key="${f.key}" type="${f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}" value="${escAttr(v)}" placeholder="${f.placeholder || ''}" />`;
    return `<div class="fm-field">${lbl}${ctrl}${f.hint ? `<div class="fm-hint">${f.hint}</div>` : ''}</div>`;
  }
  function escAttr(s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

  function formModal(title, fields, opts) {
    opts = opts || {};
    let dirty = false; // 用户改过表单后，Esc/遮罩关闭需先确认
    const body = fields.map(renderField).join('') + `
      <div class="fm-foot">
        ${opts.onDelete ? `<button class="btn danger ghost" id="fmDelete">${ICX('trash')}<span>${opts.deleteLabel || '删除'}</span></button>` : ''}
        <div style="flex:1"></div>
        <button class="btn ghost" id="fmCancel">取消</button>
        <button class="btn primary" id="fmSubmit">${ICX('check')}<span>${opts.submitLabel || '保存'}</span></button>
      </div>`;
    modal(title, body, {
      guard: () => !dirty || window.confirm('表单内容尚未保存，确定关闭？'),
      onMount(el) {
        el.addEventListener('input', () => { dirty = true; });
        el.querySelectorAll('.fm-seg').forEach(seg => seg.addEventListener('click', (e) => {
          const b = e.target.closest('button[data-val]'); if (!b) return;
          dirty = true;
          seg.querySelectorAll('button').forEach(x => x.classList.remove('on')); b.classList.add('on');
        }));
        el.querySelector('#fmSubmit').addEventListener('click', () => {
          const values = {};
          fields.forEach(f => {
            if (f.type === 'segment') { const on = el.querySelector(`.fm-seg[data-key="${f.key}"] button.on`); values[f.key] = on ? on.dataset.val : (f.options[0] || [])[0]; }
            else if (f.type === 'checks') values[f.key] = Array.from(el.querySelectorAll(`.fm-checks[data-key="${f.key}"] input:checked`)).map(i => i.value);
            else values[f.key] = el.querySelector(`[data-key="${f.key}"]`).value;
          });
          for (const f of fields) { if (f.required && !String(values[f.key]).trim()) return toast('请填写：' + f.label, 'err'); }
          const r = opts.onSubmit ? opts.onSubmit(values) : true;
          if (r === true || r === undefined) closeModal();
          else if (typeof r === 'string') toast(r, 'err');
        });
        if (opts.onDelete) el.querySelector('#fmDelete').addEventListener('click', () => { closeModal(); opts.onDelete(); });
        el.querySelector('#fmCancel').addEventListener('click', closeModal);
      }
    });
  }
  window.__formModal = formModal;

  /* ---------------- 数据：导出 JSON ---------------- */
  function download(filename, text, mime) {
    const blob = new Blob([text], { type: (mime || 'text/plain') + ';charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 100);
  }

  const LAST_EXPORT_KEY = 'ailearn_last_export';
  function exportJSON() {
    const data = window.Store.exportData();
    download('ailearn-backup-' + dateStamp() + '.json', JSON.stringify(data, null, 2), 'application/json');
    try { localStorage.setItem(LAST_EXPORT_KEY, String(Date.now())); } catch (e) {}
    toast('已导出 JSON 备份', 'ok');
    if (window.__rerender) window.__rerender(); // 刷新首页备份提醒
  }
  window.__exportJSON = exportJSON;
  // 距上次导出的天数；从未导出返回 null
  window.__daysSinceExport = function () {
    try {
      const t = parseInt(localStorage.getItem(LAST_EXPORT_KEY) || '', 10);
      if (!t) return null;
      return Math.floor((Date.now() - t) / 86400000);
    } catch (e) { return null; }
  };

  function exportMarkdown() {
    const notes = window.DB.notes || [];
    const modName = (id) => (window.DB.modules.find(m => m.id === id) || {}).label || id;
    let md = '# Ailearn 笔记导出\n\n> 导出时间：' + new Date().toLocaleString() + ' · 共 ' + notes.length + ' 篇\n\n';
    notes.forEach(n => {
      md += '\n---\n\n## ' + n.title + '\n\n';
      md += '**模块：** ' + modName(n.mod) + '　**更新：** ' + n.time + '\n\n';
      if (n.tags && n.tags.length) md += '**标签：** ' + n.tags.map(t => '#' + t).join(' ') + '\n\n';
      md += (n.md || n.preview || '') + '\n';
    });
    download('ailearn-notes-' + dateStamp() + '.md', md, 'text/markdown');
    toast('已导出 Markdown 笔记', 'ok');
  }

  function dateStamp() {
    const d = new Date();
    const p = (x) => String(x).padStart(2, '0');
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate());
  }

  /* ---------------- 数据：导入 ---------------- */
  function doImport(file, mode) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const obj = JSON.parse(reader.result);
        window.Store.importData(obj, mode);
        closeModal();
        toast('导入成功，已' + (mode === 'merge' ? '合并' : '替换') + '数据', 'ok');
        window.__rerender();
      } catch (e) {
        toast('导入失败：' + e.message, 'err');
      }
    };
    reader.readAsText(file);
  }

  /* ---------------- 数据中心弹窗 ---------------- */
  function openDataCenter() {
    const meta = window.Store.meta();
    const counts = ['notes', 'tasks', 'mistakes', 'reviews'].map(f => (window.DB[f] || []).length);
    const body = `
      <div class="dc-stats">
        ${[['笔记', counts[0]], ['任务', counts[1]], ['错题', counts[2]], ['复盘', counts[3]]].map(([l, n]) =>
          `<div class="dc-stat"><div class="dc-n">${n}</div><div class="dc-l">${l}</div></div>`).join('')}
      </div>
      <div class="dc-note mono">${meta ? '本地已保存 · ' + (meta.bytes / 1024).toFixed(1) + ' KB · ' + new Date(meta.savedAt).toLocaleString() : '尚未写入本地存储'}</div>

      <div class="dc-sec-label">导出备份</div>
      <div class="dc-row">
        <button class="btn" id="expJson">${ICX('download')}<span>导出 JSON（全部数据）</span></button>
        <button class="btn" id="expMd">${ICX('download')}<span>导出 Markdown（笔记）</span></button>
      </div>

      <div class="dc-sec-label">导入数据</div>
      <input type="file" id="impFile" accept="application/json,.json" class="dc-file" />
      <div class="dc-row" style="margin-top:10px">
        <button class="btn" id="impMerge">合并导入（保留现有）</button>
        <button class="btn" id="impReplace">替换导入（覆盖现有）</button>
      </div>
      <div class="dc-hint">导入 JSON 备份文件。合并仅追加新条目；替换会用文件内容覆盖当前数据。</div>

      <div class="divider"></div>
      <div class="dc-row">
        <button class="btn ghost" id="resetData" style="color:var(--red)">${ICX('trash')}<span>清空本地数据并恢复示例</span></button>
      </div>`;

    modal('数据中心 · 持久化与备份', body, {
      onMount(el) {
        el.querySelector('#expJson').addEventListener('click', exportJSON);
        el.querySelector('#expMd').addEventListener('click', exportMarkdown);
        const file = el.querySelector('#impFile');
        el.querySelector('#impMerge').addEventListener('click', () => {
          if (!file.files[0]) return toast('请先选择 JSON 文件', 'err');
          doImport(file.files[0], 'merge');
        });
        el.querySelector('#impReplace').addEventListener('click', () => {
          if (!file.files[0]) return toast('请先选择 JSON 文件', 'err');
          doImport(file.files[0], 'replace');
        });
        el.querySelector('#resetData').addEventListener('click', () => {
          confirmDialog('确定清空所有本地数据并恢复内置示例？此操作不可撤销。', { danger: true, confirmLabel: '清空并恢复' })
            .then(ok => { if (ok) window.Store.reset(); });
        });
      }
    });
  }

  /* ---------------- AI 设置弹窗 ---------------- */
  function openAISettings() {
    const c = window.AI.cfg();
    const body = `
      <div class="set-field">
        <label>Ollama 服务地址</label>
        <input type="text" id="aiUrl" value="${escAttr(c.url)}" placeholder="http://localhost:11434" />
      </div>
      <div class="set-field">
        <label>模型名称</label>
        <input type="text" id="aiModel" value="${escAttr(c.model)}" placeholder="llama3.2 / qwen2.5 / deepseek-r1 …" />
      </div>
      <div class="set-toggle">
        <label><input type="checkbox" id="aiEnabled" ${c.enabled ? 'checked' : ''}/> 启用 AI 辅助功能</label>
      </div>
      <div class="dc-row" style="margin-top:14px">
        <button class="btn" id="aiTest">${ICX('bolt')}<span>测试连接</span></button>
        <button class="btn primary" id="aiSave">${ICX('check')}<span>保存设置</span></button>
      </div>
      <div id="aiTestOut" class="ai-test-out"></div>
      <div class="divider"></div>
      <div class="ai-help">
        <div class="ai-help-t">本地离线 · 接入步骤</div>
        <ol>
          <li>安装并运行 <span class="mono">ollama serve</span></li>
          <li>拉取模型，如 <span class="mono">ollama pull llama3.2</span></li>
          <li>允许网页跨域访问：启动前设置环境变量 <span class="mono">OLLAMA_ORIGINS=*</span></li>
        </ol>
        <div class="ai-help-note">所有 AI 请求只发往你本机的 Ollama，数据不出本地。</div>
      </div>`;

    modal('AI 设置 · 本地 Ollama', body, {
      onMount(el) {
        el.querySelector('#aiSave').addEventListener('click', () => {
          window.AI.setCfg({
            url: el.querySelector('#aiUrl').value.trim() || window.AI.DEFAULTS.url,
            model: el.querySelector('#aiModel').value.trim() || window.AI.DEFAULTS.model,
            enabled: el.querySelector('#aiEnabled').checked,
          });
          closeModal();
          toast('AI 设置已保存', 'ok');
        });
        el.querySelector('#aiTest').addEventListener('click', async () => {
          const out = el.querySelector('#aiTestOut');
          // 临时应用当前输入框的值再测试
          window.AI.setCfg({ url: el.querySelector('#aiUrl').value.trim(), model: el.querySelector('#aiModel').value.trim() });
          out.className = 'ai-test-out show';
          out.innerHTML = '<span class="spin"></span> 正在连接 Ollama…';
          try {
            const models = await window.AI.listModels();
            out.className = 'ai-test-out show ok';
            out.innerHTML = '✓ 连接成功，本地模型：' + (models.length ? models.map(m => window.MD.esc(m)).join('、') : '（无，请先 pull 一个模型）');
          } catch (e) {
            out.className = 'ai-test-out show err';
            out.innerHTML = '⚠ 连接失败。请确认 Ollama 已运行，且设置了 OLLAMA_ORIGINS=*。';
          }
        });
      }
    });
  }

  /* 小图标取值（icons.js 的 IC 可能晚加载，做个兜底） */
  function ICX(name) { return (window.IC && window.IC[name]) || ''; }

  /* ---------------- 顶栏注入入口按钮 ---------------- */
  function injectTopbar() {
    const util = document.querySelector('.topbar .util');
    if (!util || document.getElementById('dataBtn')) return;
    const dataBtn = document.createElement('button');
    dataBtn.className = 'icon-btn';
    dataBtn.id = 'dataBtn';
    dataBtn.title = '数据中心（备份 / 导入导出）';
    dataBtn.innerHTML = ICX('archive');
    dataBtn.addEventListener('click', openDataCenter);

    const aiBtn = document.createElement('button');
    aiBtn.className = 'icon-btn';
    aiBtn.id = 'aiBtn';
    aiBtn.title = 'AI 设置（本地 Ollama）';
    aiBtn.innerHTML = ICX('bolt');
    aiBtn.addEventListener('click', openAISettings);

    util.insertBefore(aiBtn, util.firstChild);
    util.insertBefore(dataBtn, util.firstChild);
  }

  window.__openDataCenter = openDataCenter;
  window.__openAISettings = openAISettings;

  window.addEventListener('DOMContentLoaded', injectTopbar);
})();
