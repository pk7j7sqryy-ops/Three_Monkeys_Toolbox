# Ailearn — Agent Guide by sunqiyu

## Quick Start

```bash
# Dev server (no-cache, auto-redirects / to Ailearn.html)
python3 .claude/serve.py 4180
# Open http://127.0.0.1:4180/
```

Entry: `Ailearn.html` → loads scripts in order → `app.js` boots router.

## Architecture

Pure vanilla JS. Zero dependencies, zero build, zero CDN.

- `js/data.js` — seed data + global `window.DB`
- `js/store.js` — localStorage persistence (must load after data.js, before app.js)
- `js/app.js` — hash router, sidebar, theme, stars
- `js/pages/*.js` — 6 page renderers (dashboard, notes, quiz, tasks, mistakes, review)
- `js/srs.js` — SM-2 spaced repetition engine
- `js/ai.js` — local Ollama client (optional)
- `js/stats.js` — real-time derived statistics
- `css/theme.css` — global theme variables
- `css/pages.css` — page styles

## Script Load Order

Order in `Ailearn.html` is load-order dependent:
```
data.js → store.js → srs.js → stats.js → ai.js → icons.js → markdown.js → importers.js → tools.js → pages/*.js → app.js → tweaks.js
```
`store.js` calls `Store.load()` at module scope and wraps `window.__rerender` after DOMContentLoaded.

## Testing

Browser-only. Open `/test.html` — no CLI test runner.
Covers: `markdown.js`, `srs.js`, `importers.js`. All green = pass.

## Data Model

All state in `window.DB` with arrays: `notes`, `tasks`, `mistakes`, `reviews`, `questions`, `quizResults`, `activity`, `months`.
Persisted to `localStorage` key `ailearn_data_v1`. Clearing browser data = data loss.
Data center in UI supports JSON export/import and Markdown export.

## Conventions

- Chinese UI text throughout.
- Each page renderer is `window.renderXxx()`, called by router.
- Event binding happens in `window.__bindPage[active]` after render.
- Theme: `data-theme="dark|light"` on `<html>`, CSS vars in `theme.css`.
- Module filtering: `__getModuleFilter()` / `__setModuleFilter()`.
- Icons: `IC.xxx` from `js/icons.js`.
