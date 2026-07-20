/* ============================================================
   Ailearn — 本地 AI 客户端 (Ollama)
   全程离线：直接请求本机 Ollama (http://localhost:11434)
   功能：笔记整理 / 自动出题 / 错题分析
   ============================================================ */
(function () {
  const SKEY = 'ailearn_ai_cfg_v1';
  const DEFAULTS = { url: 'http://localhost:11434', model: 'llama3.2', enabled: true };

  function cfg() {
    try { return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(SKEY) || '{}')); }
    catch (e) { return Object.assign({}, DEFAULTS); }
  }
  function setCfg(patch) {
    const next = Object.assign(cfg(), patch);
    try { localStorage.setItem(SKEY, JSON.stringify(next)); } catch (e) {}
    return next;
  }

  /* 基础生成调用（stream:false） */
  async function generate(prompt, system) {
    const c = cfg();
    const body = { model: c.model, prompt, stream: false };
    if (system) body.system = system;
    let res;
    try {
      res = await fetch(c.url.replace(/\/$/, '') + '/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (e) {
      throw new Error('无法连接到 Ollama（' + c.url + '）。请确认：① 已运行 `ollama serve`；② 已设置 OLLAMA_ORIGINS=* 允许跨域。');
    }
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error('Ollama 返回错误 ' + res.status + (t ? '：' + t.slice(0, 160) : ''));
    }
    const data = await res.json();
    return (data.response || '').trim();
  }

  /* 列出本地模型，用于「测试连接」 */
  async function listModels() {
    const c = cfg();
    const res = await fetch(c.url.replace(/\/$/, '') + '/api/tags').catch(() => { throw new Error('连接失败'); });
    if (!res.ok) throw new Error('状态 ' + res.status);
    const data = await res.json();
    return (data.models || []).map(m => m.name);
  }

  /* ---------- 高层能力 ---------- */

  // 把杂乱内容整理成结构化 Markdown 笔记
  async function organizeNote(raw) {
    const sys = '你是一名 AI 技术学习笔记整理助手。把用户提供的内容整理成结构清晰的 Markdown 学习笔记：用 # / ## 分级标题，提炼要点为无序列表，必要时保留或补充代码块（```），可在关键处用 > 标注盲区或易错点。只输出 Markdown 正文，不要任何解释或开场白。';
    return generate(raw || '（空）', sys);
  }

  // 基于主题/模块生成一道带答案与解析的题目
  async function generateQuestion(topic, type) {
    const sys = '你是 AI 技术出题老师。根据给定主题出一道高质量的' + (type || '简答') + '题，面向大模型/RAG/Agent/LLMOps 学习者。严格按以下格式输出，不要多余文字：\n【题目】...\n【答案】...\n【解析】...';
    return generate('主题：' + topic, sys);
  }

  // 分析一道错题，给出错因、盲区与巩固建议
  async function analyzeMistake(m) {
    const sys = '你是 AI 学习错题分析助手。针对学生的错题，简明给出：① 错因（为什么会答错）；② 涉及的知识盲区；③ 一条巩固建议。用中文，分点输出，每点一行，不超过 4 行。';
    const prompt = '题目：' + m.q + '\n学生答案：' + m.your + '\n正确答案：' + m.right;
    return generate(prompt, sys);
  }

  window.AI = { cfg, setCfg, generate, listModels, organizeNote, generateQuestion, analyzeMistake, DEFAULTS };
})();
