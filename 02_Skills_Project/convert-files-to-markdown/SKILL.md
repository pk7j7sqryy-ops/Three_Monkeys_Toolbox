---
name: convert-files-to-markdown
description: Convert PDF, Word (.docx/.doc), MindManager (.mmap), Python (.py), and Jupyter Notebook (.ipynb) files or folders into portable, ordinary Markdown without summarizing or rewriting the source. Use when Codex is asked to convert, export, normalize, archive, or batch-process documents, mind maps, Python source, notebooks, course materials, or mixed study files into .md files.
---

# Convert Files to Markdown

Convert source files faithfully into UTF-8 CommonMark/GFM. Preserve source order and meaning. Do not summarize, explain, correct, or invent content unless the user separately requests it.

## Workflow

1. Inspect the requested inputs and resolve the output location.
2. In Codex Desktop, load the bundled workspace dependencies for PDF/document work and use the returned Python executable when available. Otherwise use `python3`.
3. Run the bundled converter:

   ```bash
   python3 scripts/convert_to_markdown.py INPUT [INPUT ...] [--output-dir DIR]
   ```

4. Review every reported warning and spot-check each output. For PDF or DOCX with important layout, tables, diagrams, or OCR, also use the available PDF or document-reading skill to compare the Markdown against the rendered source.
5. Report the created `.md` files and any content that could not be represented faithfully.

## Output Rules

- For one file without `--output-dir`, write beside the source as `<stem>.md`.
- For a directory without `--output-dir`, write to a sibling `<directory>_markdown/` tree.
- Store extracted media in `<stem>_assets/` and use relative Markdown links.
- Refuse to overwrite by default. Pass `--overwrite` only when the user authorizes replacement.
- Omit YAML frontmatter by default. Pass `--frontmatter` only when requested.
- Preserve Python verbatim in a fenced `python` block.
- Preserve notebook Markdown and code-cell order. Include cell outputs only with `--keep-notebook-output`.
- Convert mind-map topics to a numbered heading tree in exact source order; preserve notes, links, and packaged media when detectable.
- Mark lossy or unreadable content with a visible warning instead of guessing.

## Format Routing

- **PDF:** Extract text page by page. Attempt OCR only when command-line OCR tools are installed. For scanned or layout-heavy PDFs, use the PDF skill to verify or repair the result.
- **DOCX:** Preserve headings, paragraphs, lists, tables, links, and embedded media where the OOXML structure exposes them. Use the document skill when visual order or tracked content matters.
- **DOC:** Use an installed system converter (`textutil`, `antiword`, or `pandoc`). If none exists, report the dependency instead of silently producing an empty file.
- **MMAP:** Parse packaged MindManager XML without reorganizing it. Render the central topic as an unnumbered document title. Render its direct children as H1 headings numbered `一.`, `二.`, and so on; render deeper descendants as H2–H6 headings numbered `1.1.`, `1.1.1.`, and so on. For source depths beyond six, keep H6 while retaining the complete numeric path. Use only each topic's own text, preserve sibling order, skip empty headings without promoting descendants, and never invent topic names.
- **PY/IPYNB:** Archive source faithfully. Do not turn docstrings into prose or execute code.

## Batch and Safety

- Recurse only through explicitly supplied directories.
- Support `.pdf`, `.docx`, `.doc`, `.mmap`, `.py`, and `.ipynb`; skip other files with a warning.
- Never execute source code, notebook cells, macros, or embedded objects.
- Never delete inputs or extracted assets.
- Use `--dry-run` to preview mappings before a large conversion.

Run `python3 scripts/convert_to_markdown.py --help` for all options.
