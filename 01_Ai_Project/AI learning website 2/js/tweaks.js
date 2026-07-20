/* ============================================================
   Ailearn — Tweaks 面板（原生 JS，零依赖，完全离线）
   外观/排版/布局偏好；持久化到 localStorage
   取代旧的 React+Babel 版本（tweaks-panel.jsx / tweaks.jsx）
   ============================================================ */
(function () {
  const SKEY = 'ailearn_tweaks_v1';
  const DEFAULTS = { accent: '#f5a623', theme: 'dark', font: 'noto', sidebar: 'expanded', density: 'comfy', name: '小孙' };

  const ACCENTS = {
    '#f5a623': { soft: 'rgba(245,166,35,0.14)', line: 'rgba(245,166,35,0.45)', ink: '#1a1205' },
    '#5b9dff': { soft: 'rgba(91,157,255,0.15)', line: 'rgba(91,157,255,0.5)', ink: '#06101f' },
    '#3fcf8e': { soft: 'rgba(63,207,142,0.15)', line: 'rgba(63,207,142,0.5)', ink: '#04150d' },
    '#b18cff': { soft: 'rgba(177,140,255,0.16)', line: 'rgba(177,140,255,0.5)', ink: '#100620' },
    '#f0795f': { soft: 'rgba(240,121,95,0.15)', line: 'rgba(240,121,95,0.5)', ink: '#1a0805' },
  };
  const FONTS = {
    noto:  '"Noto Sans SC", "PingFang SC", system-ui, sans-serif',
    serif: '"Noto Serif SC", "Songti SC", Georgia, serif',
    mono:  '"JetBrains Mono", "Noto Sans SC", monospace',
  };
  const DENSITY = {
    compact: { pad: '16px', gap: '12px', radius: '11px' },
    comfy:   { pad: '22px', gap: '18px', radius: '14px' },
    roomy:   { pad: '28px', gap: '24px', radius: '16px' },
  };

  function load() {
    try { return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(SKEY) || '{}')); }
    catch (e) { return Object.assign({}, DEFAULTS); }
  }
  function save(t) { try { localStorage.setItem(SKEY, JSON.stringify(t)); } catch (e) {} }

  function applyTweaks(t) {
    const root = document.documentElement;
    const a = ACCENTS[t.accent] || ACCENTS['#f5a623'];
    root.style.setProperty('--accent', t.accent);
    root.style.setProperty('--accent-soft', a.soft);
    root.style.setProperty('--accent-line', a.line);
    root.style.setProperty('--accent-ink', a.ink);
    root.setAttribute('data-theme', t.theme);
    root.style.setProperty('--font-sans', FONTS[t.font] || FONTS.noto);
    const d = DENSITY[t.density] || DENSITY.comfy;
    root.style.setProperty('--pad', d.pad);
    root.style.setProperty('--gap', d.gap);
    root.style.setProperty('--radius', d.radius);
    const app = document.getElementById('app');
    if (app) app.classList.toggle('collapsed', t.sidebar === 'collapsed');
    // 昵称同步到顶栏（头像取中文末字 / 英文首字母）
    const name = (t.name || '').trim() || DEFAULTS.name;
    const nm = document.querySelector('.user-chip .nm');
    const av = document.querySelector('.user-chip .av');
    if (nm) nm.textContent = name;
    if (av) av.textContent = /^[\x00-\x7F]/.test(name) ? name[0].toUpperCase() : name.slice(-1);
    try { localStorage.setItem('ai_theme', t.theme); } catch (e) {}
  }

  const STYLE = `
  .twk-fab{position:fixed;right:16px;bottom:16px;z-index:2147483646;width:40px;height:40px;
    border:0;border-radius:50%;cursor:pointer;background:var(--accent,#f5a623);color:#1a1205;
    box-shadow:0 6px 20px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center}
  .twk-fab svg{width:20px;height:20px}
  .twk-panel{position:fixed;right:16px;bottom:64px;z-index:2147483646;width:268px;
    max-height:calc(100vh - 96px);display:none;flex-direction:column;
    background:rgba(250,249,247,.86);color:#29261b;
    -webkit-backdrop-filter:blur(24px) saturate(160%);backdrop-filter:blur(24px) saturate(160%);
    border:.5px solid rgba(255,255,255,.6);border-radius:14px;
    box-shadow:0 1px 0 rgba(255,255,255,.5) inset,0 12px 40px rgba(0,0,0,.22);
    font:11.5px/1.4 ui-sans-serif,system-ui,-apple-system,sans-serif;overflow:hidden}
  .twk-panel.open{display:flex}
  .twk-hd{display:flex;align-items:center;justify-content:space-between;padding:10px 8px 10px 14px}
  .twk-hd b{font-size:12px;font-weight:600}
  .twk-x{border:0;background:transparent;color:rgba(41,38,27,.55);width:22px;height:22px;
    border-radius:6px;cursor:pointer;font-size:14px;line-height:1}
  .twk-x:hover{background:rgba(0,0,0,.06);color:#29261b}
  .twk-body{padding:2px 14px 14px;display:flex;flex-direction:column;gap:10px;overflow-y:auto}
  .twk-sect{font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;
    color:rgba(41,38,27,.45);padding:8px 0 0}
  .twk-lbl{font-weight:500;color:rgba(41,38,27,.72);margin-bottom:5px}
  .twk-seg{position:relative;display:flex;padding:2px;border-radius:8px;background:rgba(0,0,0,.06)}
  .twk-seg button{flex:1;border:0;background:transparent;color:inherit;font:inherit;font-weight:500;
    min-height:24px;border-radius:6px;cursor:pointer;padding:4px 6px}
  .twk-seg button[data-on="1"]{background:rgba(255,255,255,.9);box-shadow:0 1px 2px rgba(0,0,0,.12)}
  .twk-input{width:100%;box-sizing:border-box;border:1px solid rgba(0,0,0,.14);border-radius:6px;
    padding:6px 8px;font:inherit;background:rgba(255,255,255,.85);color:inherit;outline:none}
  .twk-input:focus{border-color:rgba(0,0,0,.4)}
  .twk-chips{display:flex;gap:6px}
  .twk-chip{flex:1;height:34px;border:0;border-radius:6px;cursor:pointer;
    box-shadow:0 0 0 .5px rgba(0,0,0,.12),0 1px 2px rgba(0,0,0,.06);transition:transform .12s}
  .twk-chip:hover{transform:translateY(-1px)}
  .twk-chip[data-on="1"]{box-shadow:0 0 0 2px rgba(0,0,0,.85)}
  `;

  function seg(label, key, opts, t, rerender) {
    const btns = opts.map(o =>
      `<button data-k="${key}" data-v="${o.value}" data-on="${t[key] === o.value ? '1' : '0'}">${o.label}</button>`
    ).join('');
    return `<div><div class="twk-lbl">${label}</div><div class="twk-seg">${btns}</div></div>`;
  }
  function chips(label, key, colors, t) {
    const cs = colors.map(c =>
      `<button class="twk-chip" data-k="${key}" data-v="${c}" data-on="${t[key] === c ? '1' : '0'}" style="background:${c}"></button>`
    ).join('');
    return `<div><div class="twk-lbl">${label}</div><div class="twk-chips">${cs}</div></div>`;
  }

  const escHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

  function buildPanel(t, panel) {
    panel.querySelector('.twk-body').innerHTML =
      `<div class="twk-sect">个人</div>` +
      `<div><div class="twk-lbl">昵称</div><input class="twk-input" data-k="name" maxlength="12" value="${escHtml(t.name || '')}" placeholder="你的称呼" /></div>` +
      `<div class="twk-sect">主题</div>` +
      chips('强调色', 'accent', ['#f5a623', '#5b9dff', '#3fcf8e', '#b18cff', '#f0795f'], t) +
      seg('明暗模式', 'theme', [{ value: 'dark', label: '深色' }, { value: 'light', label: '护眼浅色' }], t) +
      `<div class="twk-sect">排版</div>` +
      seg('字体风格', 'font', [{ value: 'noto', label: '黑体' }, { value: 'serif', label: '宋体' }, { value: 'mono', label: '等宽' }], t) +
      seg('卡片密度', 'density', [{ value: 'compact', label: '紧凑' }, { value: 'comfy', label: '舒适' }, { value: 'roomy', label: '宽松' }], t) +
      `<div class="twk-sect">布局</div>` +
      seg('侧边栏', 'sidebar', [{ value: 'expanded', label: '展开' }, { value: 'collapsed', label: '收起' }], t);
  }

  function mount() {
    const t = load();
    applyTweaks(t);

    const style = document.createElement('style'); style.textContent = STYLE; document.head.appendChild(style);

    const fab = document.createElement('button');
    fab.className = 'twk-fab'; fab.title = '外观设置';
    fab.innerHTML = `<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.3 1a7 7 0 0 0-1.7-1l-.3-2.6h-4l-.3 2.6a7 7 0 0 0-1.7 1l-2.3-1-2 3.4 2 1.5a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 1.7 1l.3 2.6h4l.3-2.6a7 7 0 0 0 1.7-1l2.3 1 2-3.4-2-1.5c.07-.3.1-.66.1-1Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`;

    const panel = document.createElement('div');
    panel.className = 'twk-panel';
    panel.innerHTML = `<div class="twk-hd"><b>外观设置</b><button class="twk-x" aria-label="关闭">✕</button></div><div class="twk-body"></div>`;

    document.body.appendChild(fab);
    document.body.appendChild(panel);
    buildPanel(t, panel);

    fab.addEventListener('click', () => panel.classList.toggle('open'));
    panel.querySelector('.twk-x').addEventListener('click', () => panel.classList.remove('open'));
    panel.querySelector('.twk-body').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-k]'); if (!b) return;
      t[b.dataset.k] = b.dataset.v;
      save(t); applyTweaks(t); buildPanel(t, panel);
      fab.style.background = t.accent;
    });
    // 文本类偏好（昵称）：失焦/回车时保存，不重建面板以免输入中失焦
    panel.querySelector('.twk-body').addEventListener('change', (e) => {
      if (!e.target.matches('input[data-k]')) return;
      t[e.target.dataset.k] = e.target.value.trim() || DEFAULTS[e.target.dataset.k];
      save(t); applyTweaks(t);
      if (window.__rerender) window.__rerender(); // 首页问候语等使用昵称的地方
    });

    // set(key, val)：供外部（如顶栏主题按钮）修改偏好，保持面板与存储同步
    window.__tweaks = {
      get: () => t,
      apply: applyTweaks,
      set(k, v) {
        t[k] = v;
        save(t); applyTweaks(t); buildPanel(t, panel);
        fab.style.background = t.accent;
      },
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
