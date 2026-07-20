/* ============================================================
   Ailearn — 类 Typora 的所见即所得 Markdown 编辑器（零依赖）
   单栏 contenteditable：边写边渲染；Markdown 仍是存储格式。
   - 块级快捷输入：# ~ ###### / - / * / 1. / > / --- （行首敲标记+空格即转换）
   - 行内：Ctrl/⌘+B 加粗、Ctrl/⌘+I 斜体、Ctrl/⌘+E 行内代码；亦可用浮动工具栏
   - mdToEditable / editableToMd 双向转换，保证存的是干净 Markdown
   ============================================================ */
window.WYS = (function () {
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  /* ---------- 行内 Markdown → HTML ---------- */
  function inlineToHtml(s) {
    s = esc(s);
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    // 图片（须在链接之前）
    s = s.replace(/!\[([^\]]*)\]\((data:image\/[^)\s]+|https?:\/\/[^)\s]+|\.{0,2}\/[^)\s]+)\)/g, '<img src="$2" alt="$1">');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$1">$2</a>');
    return s || '<br>';
  }

  /* ---------- Markdown → 可编辑 HTML（块结构友好，便于就地编辑） ---------- */
  function mdToEditable(md) {
    const lines = String(md || '').replace(/\r\n/g, '\n').split('\n');
    const out = [];
    let list = null, listItems = [];
    const flushList = () => { if (list) { out.push(`<${list}>` + listItems.map(t => `<li>${inlineToHtml(t)}</li>`).join('') + `</${list}>`); list = null; listItems = []; } };
    for (let i = 0; i < lines.length;) {
      const t = lines[i];
      const fence = t.match(/^```(\w*)/);
      if (fence) {
        flushList(); const buf = []; i++;
        while (i < lines.length && !/^```/.test(lines[i])) { buf.push(lines[i]); i++; }
        i++; out.push(`<pre data-lang="${fence[1] || ''}"><code>${esc(buf.join('\n')) || '<br>'}</code></pre>`); continue;
      }
      const h = t.match(/^(#{1,6})\s+(.*)$/);
      if (h) { flushList(); out.push(`<h${h[1].length}>${inlineToHtml(h[2])}</h${h[1].length}>`); i++; continue; }
      if (/^([-*_])\1\1+$/.test(t.trim())) { flushList(); out.push('<hr>'); i++; continue; }
      if (/^>\s?/.test(t)) { flushList(); out.push(`<blockquote>${inlineToHtml(t.replace(/^>\s?/, ''))}</blockquote>`); i++; continue; }
      const ol = t.match(/^\d+\.\s+(.*)$/);
      if (ol) { if (list !== 'ol') flushList(); list = 'ol'; listItems.push(ol[1]); i++; continue; }
      const ul = t.match(/^[-*]\s+(.*)$/);
      if (ul) { if (list !== 'ul') flushList(); list = 'ul'; listItems.push(ul[1]); i++; continue; }
      if (t.trim() === '') { flushList(); i++; continue; }
      flushList(); out.push(`<p>${inlineToHtml(t)}</p>`); i++;
    }
    flushList();
    return out.join('') || '<p><br></p>';
  }

  /* ---------- 可编辑 HTML → Markdown（存储用） ---------- */
  function inlineToMd(node) {
    let out = '';
    node.childNodes.forEach(c => {
      if (c.nodeType === 3) out += c.nodeValue;
      else if (c.nodeType === 1) {
        const tag = c.tagName.toLowerCase();
        if (tag === 'strong' || tag === 'b') out += '**' + inlineToMd(c) + '**';
        else if (tag === 'em' || tag === 'i') out += '*' + inlineToMd(c) + '*';
        else if (tag === 'code') out += '`' + c.textContent + '`';
        else if (tag === 'br') out += '\n';
        else if (tag === 'img') out += '![' + (c.getAttribute('alt') || '') + '](' + (c.getAttribute('src') || '') + ')';
        else if (tag === 'a') out += '[' + inlineToMd(c) + '](' + (c.getAttribute('href') || '') + ')';
        else out += inlineToMd(c);
      }
    });
    return out.replace(/ /g, ' ');
  }
  function blockToMd(el) {
    const tag = el.tagName ? el.tagName.toLowerCase() : '';
    if (/^h[1-6]$/.test(tag)) return '#'.repeat(+tag[1]) + ' ' + inlineToMd(el).trim();
    if (tag === 'blockquote') return inlineToMd(el).split('\n').map(l => '> ' + l).join('\n');
    if (tag === 'ul') return [...el.children].map(li => '- ' + inlineToMd(li).trim()).join('\n');
    if (tag === 'ol') return [...el.children].map((li, i) => (i + 1) + '. ' + inlineToMd(li).trim()).join('\n');
    if (tag === 'pre') { const code = el.textContent.replace(/\n$/, ''); return '```' + (el.getAttribute('data-lang') || '') + '\n' + code + '\n```'; }
    if (tag === 'hr') return '---';
    if (tag === 'img') return '![' + (el.getAttribute('alt') || '') + '](' + (el.getAttribute('src') || '') + ')';
    return inlineToMd(el).trim();
  }
  function editableToMd(root) {
    const parts = [];
    root.childNodes.forEach(node => {
      if (node.nodeType === 3) { const t = node.nodeValue.trim(); if (t) parts.push(t); return; }
      if (node.nodeType !== 1) return;
      const md = blockToMd(node);
      if (md !== '') parts.push(md);
    });
    return parts.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  /* ---------- 选区 / 块工具 ---------- */
  function currentBlock(root) {
    const sel = window.getSelection(); if (!sel.rangeCount) return null;
    let n = sel.anchorNode;
    while (n && n.parentNode !== root) n = n.parentNode;
    return n && n.nodeType === 1 ? n : null;
  }
  function placeCaret(el, atStart) {
    const r = document.createRange(); r.selectNodeContents(el); r.collapse(!!atStart);
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); el.focus && el.focus();
  }
  function textBeforeCaret(block) {
    const sel = window.getSelection(); if (!sel.rangeCount) return '';
    const r = sel.getRangeAt(0).cloneRange(); r.selectNodeContents(block); r.setEnd(sel.anchorNode, sel.anchorOffset);
    return r.toString();
  }
  function replaceBlock(root, block, newEl) { block.replaceWith(newEl); placeCaret(newEl, true); }

  /* ---------- 块级快捷输入 ---------- */
  function handleSpace(root) {
    const block = currentBlock(root);
    if (!block || !/^(P|DIV)$/.test(block.tagName)) return false;
    const pre = textBeforeCaret(block).trim();
    const mk = (el) => { el.innerHTML = '<br>'; replaceBlock(root, block, el); return true; };
    if (/^#{1,6}$/.test(pre)) return mk(document.createElement('h' + pre.length));
    if (pre === '>') return mk(document.createElement('blockquote'));
    if (pre === '-' || pre === '*') { const ul = document.createElement('ul'); const li = document.createElement('li'); li.innerHTML = '<br>'; ul.appendChild(li); block.replaceWith(ul); placeCaret(li, true); return true; }
    if (/^\d+\.$/.test(pre)) { const ol = document.createElement('ol'); const li = document.createElement('li'); li.innerHTML = '<br>'; ol.appendChild(li); block.replaceWith(ol); placeCaret(li, true); return true; }
    return false;
  }
  function handleEnter(root) {
    const block = currentBlock(root);
    if (!block) return false;
    const txt = block.textContent.trim();
    // --- → 分割线
    if (/^(P|DIV)$/.test(block.tagName) && /^([-*_])\1\1+$/.test(txt)) {
      const hr = document.createElement('hr'); const p = document.createElement('p'); p.innerHTML = '<br>';
      block.replaceWith(hr); hr.after(p); placeCaret(p, true); return true;
    }
    // 标题/引用 末尾回车 → 退回普通段落
    if (/^(H[1-6]|BLOCKQUOTE)$/.test(block.tagName)) {
      const sel = window.getSelection();
      if (sel.anchorOffset === block.textContent.length || block.textContent === '') {
        const p = document.createElement('p'); p.innerHTML = '<br>'; block.after(p); placeCaret(p, true); return true;
      }
    }
    return false;
  }

  /* ---------- 行内格式（工具栏 / 快捷键） ---------- */
  function wrapInline(tag) {
    const sel = window.getSelection(); if (!sel.rangeCount || sel.isCollapsed) return;
    const text = sel.toString();
    const el = document.createElement(tag); el.textContent = text;
    const r = sel.getRangeAt(0); r.deleteContents(); r.insertNode(el);
    placeCaret(el, false);
  }
  function format(cmd) {
    if (cmd === 'bold') document.execCommand('bold');
    else if (cmd === 'italic') document.execCommand('italic');
    else if (cmd === 'code') wrapInline('code');
  }
  function setBlock(root, tag) {
    const block = currentBlock(root); if (!block) return;
    if (tag === 'pre') { const pre = document.createElement('pre'); pre.setAttribute('data-lang', ''); pre.innerHTML = '<code>' + (esc(block.textContent) || '<br>') + '</code>'; replaceBlock(root, block, pre); return; }
    if (tag === 'ul' || tag === 'ol') { const list = document.createElement(tag); const li = document.createElement('li'); li.innerHTML = block.innerHTML || '<br>'; list.appendChild(li); replaceBlock(root, block, list); placeCaret(li, false); return; }
    const el = document.createElement(tag); el.innerHTML = block.innerHTML || '<br>'; replaceBlock(root, block, el); placeCaret(el, false);
  }

  /* ---------- 图片：文件 → dataURL（大图自动压缩，省 localStorage） ---------- */
  function fileToDataURL(file, maxW) {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => {
        const img = new Image();
        img.onload = () => {
          const lim = maxW || 1280;
          if (img.width <= lim) { res(fr.result); return; }
          const scale = lim / img.width;
          const cv = document.createElement('canvas');
          cv.width = lim; cv.height = Math.round(img.height * scale);
          cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
          try { res(cv.toDataURL('image/jpeg', 0.85)); } catch (e) { res(fr.result); }
        };
        img.onerror = () => res(fr.result);
        img.src = fr.result;
      };
      fr.onerror = rej; fr.readAsDataURL(file);
    });
  }
  function insertImage(src, alt) {
    const safe = String(src).replace(/"/g, '&quot;');
    document.execCommand('insertHTML', false, '<img src="' + safe + '" alt="' + (alt || '') + '">');
  }

  /* ---------- 挂载 ---------- */
  function mount(editor, md) {
    editor.contentEditable = 'true';
    editor.innerHTML = mdToEditable(md);
    editor.addEventListener('keydown', (e) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && (e.key === 'b' || e.key === 'B')) { e.preventDefault(); format('bold'); return; }
      if (mod && (e.key === 'i' || e.key === 'I')) { e.preventDefault(); format('italic'); return; }
      if (mod && (e.key === 'e' || e.key === 'E')) { e.preventDefault(); format('code'); return; }
      if (e.key === ' ') { if (handleSpace(editor)) e.preventDefault(); }
      else if (e.key === 'Enter' && !e.shiftKey) { if (handleEnter(editor)) e.preventDefault(); }
    });
    // 粘贴图片：自动转 dataURL 内嵌
    editor.addEventListener('paste', (e) => {
      const items = e.clipboardData && e.clipboardData.items; if (!items) return;
      for (const it of items) {
        if (it.type && it.type.indexOf('image') === 0) {
          e.preventDefault();
          const f = it.getAsFile(); if (!f) return;
          fileToDataURL(f).then(url => { editor.focus(); insertImage(url); });
          return;
        }
      }
    });
    // 空了兜底，避免 contenteditable 丢失段落容器
    editor.addEventListener('input', () => { if (!editor.firstChild) editor.innerHTML = '<p><br></p>'; });
    return editor;
  }

  return { mount, mdToEditable, editableToMd, format, setBlock, fileToDataURL, insertImage };
})();
