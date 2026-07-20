/* ============================================================
   Ailearn — 文件导入解析（零依赖，纯前端离线）
   · 笔记：导入 .md
   · 题库：导入 .md / .docx，解析单选/多选/简答/代码题
   .docx 解压用浏览器内置 DecompressionStream('deflate-raw')，不引第三方库
   ============================================================ */
window.Importers = (function () {
  let _seq = 0;
  const uid = (p) => p + Date.now().toString(36) + (_seq++).toString(36);

  /* ---------------- 笔记：.md → note ---------------- */
  function noteFromMd(text, filename) {
    text = String(text || '').replace(/\r\n?/g, '\n');  // 统一换行，避免 CRLF 影响标题/大纲解析
    const title = (window.MD && MD.firstHeading(text)) || (filename || '导入笔记').replace(/\.md$/i, '');
    return {
      id: uid('n'), title, mod: 'base', time: '刚刚', createdAt: Date.now(),
      tags: [], preview: window.MD ? MD.plainPreview(text, 90) : text.slice(0, 90),
      code: text.includes('```'), pin: false, md: text,
    };
  }

  /* ---------------- HTML 实体解码（docx 文本） ---------------- */
  function decodeEntities(s) {
    return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
      .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
      .replace(/&amp;/g, '&');
  }

  /* ---------------- 极简 ZIP 读取：取出指定条目并 inflate ---------------- */
  async function unzipEntry(buf, name) {
    const dv = new DataView(buf), u8 = new Uint8Array(buf);
    let eocd = -1;
    for (let i = u8.length - 22; i >= 0; i--) { if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; } }
    if (eocd < 0) throw new Error('不是合法的 docx/zip 文件');
    let p = dv.getUint32(eocd + 16, true);
    const count = dv.getUint16(eocd + 10, true);
    for (let n = 0; n < count; n++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true);
      const compSize = dv.getUint32(p + 20, true);
      const nameLen = dv.getUint16(p + 28, true);
      const extraLen = dv.getUint16(p + 30, true);
      const commentLen = dv.getUint16(p + 32, true);
      const lfh = dv.getUint32(p + 42, true);
      const fname = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nameLen));
      if (fname === name) {
        const lNameLen = dv.getUint16(lfh + 26, true);
        const lExtraLen = dv.getUint16(lfh + 28, true);
        const start = lfh + 30 + lNameLen + lExtraLen;
        const comp = u8.subarray(start, start + compSize);
        if (method === 0) return new TextDecoder().decode(comp);
        const ds = new DecompressionStream('deflate-raw');
        const ab = await new Response(new Blob([comp]).stream().pipeThrough(ds)).arrayBuffer();
        return new TextDecoder().decode(new Uint8Array(ab));
      }
      p += 46 + nameLen + extraLen + commentLen;
    }
    throw new Error('docx 内未找到 ' + name);
  }

  /* docx → 段落数组（每段一行；保留代码缩进，仅去掉纯空段） */
  async function docxToLines(arrayBuffer) {
    const xml = await unzipEntry(arrayBuffer, 'word/document.xml');
    return xml.split(/<\/w:p>/).map(p => {
      const runs = p.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) || [];
      const text = runs.map(r => r.replace(/<[^>]+>/g, '')).join('');
      return decodeEntities(text);
    }).filter(l => l.trim() !== '');
  }

  /* ---------------- 题库解析（md 文本行 / docx 段落，统一走这里） ---------------- */
  // 章节标题 → 题型；返回 type 或 null
  function sectionType(t) {
    if (t.length > 24) return null;
    const isHead = /^[一二三四五六七八九十]+[、.]/.test(t) || /^#{1,4}\s/.test(t);
    if (!isHead && !/题$|题（|题\(/.test(t)) return null;
    if (/多选/.test(t)) return 'multi';
    if (/单选|选择/.test(t)) return 'single';
    if (/简答|问答|论述/.test(t)) return 'short';
    if (/编程|代码/.test(t)) return 'code';
    if (/填空/.test(t)) return 'short';
    return null;
  }
  const reOption = /^([A-H])[.、．)）]\s*(.*)$/;
  const reAnswer = /^(答案|参考答案|Answer)\s*[:：]\s*(.*)$/i;
  const reExplain = /^(分析|解析|说明|Explanation)\s*[:：]\s*(.*)$/i;
  const reMdQ = /^#{2,6}\s*(?:题目\s*\d*\s*[:：、.]?\s*)?(.*)$/;

  function parseQuestions(lines, category) {
    const out = [];
    let type = 'short';          // 默认简答：无章节、无选项的开放题归为简答；章节出现前的标题等噪声会被丢弃
    let cq = null;               // 当前选择题
    let recent = [], tq = null, tphase = null;  // 简答/代码：缓冲行 + 当前题 + 阶段

    const isChoice = () => type === 'single' || type === 'multi';
    const newQ = (stem) => ({ id: uid('q'), cat: category, type, mod: 'base', q: stem || '', options: [], answer: '', explain: '', _ans: '' });

    function pushChoice() {
      if (!cq) return;
      cq.options = cq.options.filter(o => o.t.trim() !== '');
      if (cq.q.trim() && cq.options.length) {
        const letters = (cq._ans || '').toUpperCase().match(/[A-H]/g) || [];
        cq.answer = [...new Set(letters)];
        if (cq.answer.length > 1) cq.type = 'multi';
        cq.q = cq.q.trim().replace(/[（(]\s*[）)]\s*$/, '').trim(); delete cq._ans; out.push(cq);
      }
      cq = null;
    }
    function flushRecent() {
      if (tq && recent.length) {
        const txt = recent.join('\n').replace(/\n{3,}/g, '\n\n').trim();
        if (txt) { if (tphase === 'explain') tq.explain += (tq.explain ? '\n' : '') + txt; else tq._ans += (tq._ans ? '\n' : '') + txt; }
      }
      recent = [];
    }
    function pushText() {
      flushRecent();
      if (tq && tq.q.trim()) { tq.answer = (tq._ans || '').trim(); tq.q = tq.q.trim(); delete tq._ans; out.push(tq); }
      tq = null; tphase = null; recent = [];
    }
    function closeAll() { pushChoice(); pushText(); }

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i], t = raw.trim();

      const st = sectionType(t);
      if (st) { closeAll(); type = st; continue; }

      const mq = (/^#{2,6}\s/.test(t)) ? t.match(reMdQ) : null;
      if (mq) { closeAll(); if (isChoice()) { cq = newQ(mq[1] ? mq[1].trim() : ''); cq._phase = 'stem'; } else { tq = newQ(mq[1] ? mq[1].trim() : ''); tphase = 'stembody'; } continue; }

      if (t === '') { if (!isChoice() && tq && tphase !== 'stembody') recent.push(''); continue; }

      const am = t.match(reAnswer), em = t.match(reExplain), op = t.match(reOption);

      if (isChoice()) {
        if (am) { if (!cq) { cq = newQ(''); cq._phase = 'stem'; } cq._ans = am[2] || ''; cq._phase = 'answer'; continue; }
        if (em) { if (!cq) { cq = newQ(''); cq._phase = 'stem'; } cq.explain = em[2] || ''; cq._phase = 'explain'; continue; }
        if (op && cq && cq._phase !== 'answer' && cq._phase !== 'explain') { cq.options.push({ k: op[1], t: op[2] }); cq._phase = 'options'; continue; }
        if (!cq) { cq = newQ(t); cq._phase = 'stem'; continue; }
        if (cq._phase === 'stem') cq.q += (cq.q ? ' ' : '') + t;
        else if (cq._phase === 'options') { if (cq.options.length) cq.options[cq.options.length - 1].t += ' ' + t; }
        else { pushChoice(); cq = newQ(t); cq._phase = 'stem'; }
        continue;
      }

      // 简答 / 代码
      if (am) {
        if (tq && tphase === 'stembody') { tphase = 'answer'; tq._ans = am[2] || ''; continue; }
        const stem = recent.pop();        // 紧贴“答案：”上方的一行 = 题干
        pushText();                        // 余下缓冲行归给上一题
        tq = newQ(stem || ''); tphase = 'answer'; tq._ans = am[2] || '';
        continue;
      }
      if (em) { flushRecent(); if (tq) { tphase = 'explain'; tq.explain = em[2] || ''; } continue; }
      if (tq && tphase === 'stembody') { tq.q += (tq.q ? '\n' : '') + raw; continue; }
      recent.push(raw);
    }
    closeAll();
    return out;
  }

  function quizFromMd(text, category) { return parseQuestions(text.replace(/\r\n/g, '\n').split('\n'), category); }
  async function quizFromDocx(arrayBuffer, category) { return parseQuestions(await docxToLines(arrayBuffer), category); }

  /* 文件读取助手 */
  function readText(file) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsText(file); }); }
  function readBuffer(file) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsArrayBuffer(file); }); }

  return { noteFromMd, quizFromMd, quizFromDocx, docxToLines, parseQuestions, readText, readBuffer };
})();
