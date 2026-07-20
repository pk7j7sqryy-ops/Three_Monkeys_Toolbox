/* ============================================================
   Ailearn — app shell: routing, sidebar, theme, starfield
   ============================================================ */
(function () {
  const app = document.getElementById('app');
  const main = document.getElementById('main');
  const topnav = document.getElementById('topnav');
  const sideNav = document.getElementById('sideNav');
  const sideModules = document.getElementById('sideModules');

  let active = 'dashboard';
  let activeModule = null;

  const PAGES = {
    dashboard: window.renderDashboard,
    tasks: window.renderTasks,
    notes: window.renderNotes,
    quiz: window.renderQuiz,
    mistakes: window.renderMistakes,
    review: window.renderReview,
  };

  /* ---------- top nav ---------- */
  function buildTopNav() {
    topnav.innerHTML = DB.nav.map(n =>
      `<a data-route="${n.id}" role="button" tabindex="0" class="${n.id === active ? 'active' : ''}">${IC[n.icon]}<span>${n.label}</span></a>`
    ).join('');
    topnav.querySelectorAll('a').forEach(a =>
      a.addEventListener('click', () => go(a.dataset.route)));
  }

  /* ---------- sidebar ---------- */
  function buildSidebar() {
    sideNav.innerHTML = DB.nav.map(n =>
      `<div class="side-item ${n.id === active ? 'active' : ''}" data-route="${n.id}" role="button" tabindex="0">
        ${IC[n.icon]}<span class="lbl">${n.label}</span></div>`
    ).join('');
    sideNav.querySelectorAll('.side-item').forEach(el =>
      el.addEventListener('click', () => go(el.dataset.route)));

    const perMod = (window.Stats ? Stats.compute().notesPerMod : {});
    sideModules.innerHTML = DB.modules.map(m =>
      `<div class="side-item ${activeModule === m.id ? 'active' : ''}" data-mod="${m.id}" title="${m.label}" role="button" tabindex="0">
        <span class="side-dot" style="background:${m.dot}"></span>
        <span class="lbl">${m.label}</span>
        <span class="ct">${perMod[m.id] != null ? perMod[m.id] : m.notes}</span></div>`
    ).join('');
    sideModules.querySelectorAll('.side-item').forEach(el =>
      el.addEventListener('click', () => {
        activeModule = activeModule === el.dataset.mod ? null : el.dataset.mod;
        if (active !== 'notes') go('notes', true);
        else render();
      }));
  }

  /* ---------- router（hash 驱动：支持前进/后退与 URL 直达） ---------- */
  function routeFromHash() {
    const m = location.hash.match(/^#\/([\w-]+)/);
    return m && PAGES[m[1]] ? m[1] : null;
  }
  let _keepModule = false; // 模块筛选跳转 notes 时，跳过一次 activeModule 重置
  function applyRoute(route) {
    active = route;
    if (_keepModule) _keepModule = false; else activeModule = null;
    main.scrollTop = 0;
    render();
  }
  function go(route, keepModule) {
    if (!PAGES[route]) return;
    _keepModule = !!keepModule;
    if (routeFromHash() === route) applyRoute(route);
    else location.hash = '#/' + route; // 触发 hashchange → applyRoute
  }
  window.addEventListener('hashchange', () => {
    const r = routeFromHash() || 'dashboard';
    if (r !== active) applyRoute(r);
  });
  window.__go = go;
  window.__getModuleFilter = () => activeModule;
  window.__setModuleFilter = (v) => { activeModule = v; };

  function render() {
    buildTopNav();
    buildSidebar();
    const fn = PAGES[active] || PAGES.dashboard;
    main.innerHTML = `<section class="page active">${fn()}</section>`;
    if (window.__bindPage && window.__bindPage[active]) window.__bindPage[active]();
    updateBell();
  }
  window.__rerender = render;

  /* ---------- 通知铃铛：今日到期待复习错题数 ---------- */
  function updateBell() {
    const badge = document.getElementById('bellBadge');
    if (!badge || !window.SRS) return;
    const n = SRS.due((DB.mistakes || []).filter(m => !m.mastered)).length;
    badge.hidden = n === 0;
    badge.textContent = n > 99 ? '99+' : n;
    const btn = document.getElementById('bellBtn');
    if (btn) btn.title = n ? `今日待复习 ${n} 题，点击前往错题本` : '今日无待复习错题';
  }
  document.getElementById('bellBtn').addEventListener('click', () => go('mistakes'));

  /* ---------- 键盘可达：role=button 的元素支持 Enter / 空格触发 ---------- */
  document.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target instanceof HTMLElement
        && e.target.matches('[role="button"]') && e.target.tagName !== 'BUTTON') {
      e.preventDefault();
      e.target.click();
    }
  });

  /* ---------- sidebar collapse ---------- */
  document.getElementById('collapseBtn').addEventListener('click', () => {
    app.classList.toggle('collapsed');
    try { localStorage.setItem('ai_sidebar', app.classList.contains('collapsed') ? '1' : '0'); } catch (e) {}
  });

  /* ---------- theme ---------- */
  const html = document.documentElement;
  function setTheme(t) {
    html.setAttribute('data-theme', t);
    try { localStorage.setItem('ai_theme', t); } catch (e) {}
  }
  document.getElementById('themeBtn').addEventListener('click', () => {
    const next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    // 与 tweaks 面板共用同一份偏好，避免两套存储互相覆盖
    if (window.__tweaks && window.__tweaks.set) window.__tweaks.set('theme', next);
    else setTheme(next);
  });
  window.__setTheme = setTheme;

  /* ---------- restore prefs ---------- */
  try {
    if (localStorage.getItem('ai_sidebar') === '1') app.classList.add('collapsed');
    const th = localStorage.getItem('ai_theme'); if (th) html.setAttribute('data-theme', th);
  } catch (e) {}

  /* ---------- starfield ---------- */
  function stars() {
    const c = document.getElementById('stars');
    if (!c) return;
    const ctx = c.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    function draw() {
      const w = c.width = innerWidth * dpr, h = c.height = innerHeight * dpr;
      c.style.width = innerWidth + 'px'; c.style.height = innerHeight + 'px';
      ctx.clearRect(0, 0, w, h);
      const n = Math.floor((innerWidth * innerHeight) / 14000);
      for (let i = 0; i < n; i++) {
        const x = Math.random() * w, y = Math.random() * h;
        const r = Math.random() * 1.1 * dpr + 0.2;
        ctx.globalAlpha = Math.random() * 0.5 + 0.08;
        ctx.fillStyle = Math.random() > 0.9 ? '#f5a623' : '#9aa3c0';
        ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
      }
    }
    draw();
    let to; addEventListener('resize', () => { clearTimeout(to); to = setTimeout(draw, 200); });
  }

  /* ---------- boot ---------- */
  window.__bindPage = window.__bindPage || {};
  const r0 = routeFromHash();
  if (r0) active = r0;
  else location.replace('#/' + active); // 不产生历史记录的初始 hash
  stars();
  render();
})();
