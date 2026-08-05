# Repository Guidelines

## Project Structure & Module Organization

- `01_Ai_Project/` contains browser applications. `AI learning website 2/` is a dependency-free learning app; its `AGENTS.md` provides more specific rules. `three-monkeys-toolbox/` is a static branded HTML site with local assets.
- `02_Skills_Project/` contains portable Agent Skills. Each skill uses a kebab-case directory with a required `SKILL.md`; optional `scripts/`, `assets/`, `references/`, and `agents/` directories support it.
- `03_Security_Project/` contains the Sentinel design documents and the runnable covert-channel scanner.
- Keep generated reports, caches, local configuration, and extracted archives out of source directories. Do not edit vendored files such as `_shared/js/mermaid.min.js`.

## Build, Test, and Development Commands

There is no repository-wide build step. Validate the component you changed:

```bash
./02_Skills_Project/install.sh --detect
./02_Skills_Project/install.sh --list
python3 02_Skills_Project/redact-sensitive-paths/scripts/redact.py --repo . scan
python3 03_Security_Project/aiagent-covert-channel-scan/scripts/scan.py <path>
python3 -m http.server 8000 --directory "01_Ai_Project/AI learning website 2"
```

Open `http://localhost:8000/Ailearn.html` for manual testing and `test.html` for the browser test suite. Run a script with `--help` before adding new automation.

## Coding Style & Naming Conventions

Use four spaces and `snake_case` for Python; prefer type hints and `pathlib.Path`. JavaScript uses two spaces, `const`/`let`, single quotes, and camelCase. Shell scripts must use Bash and `set -euo pipefail`. Keep Markdown concise and use relative, portable paths. Skill frontmatter must contain `name` and `description`; never hardcode usernames, API keys, or machine-specific absolute paths.

## Testing Guidelines

No centralized test runner is configured. Add Python tests as `tests/test_<module>.py` with `pytest` when introducing reusable logic. For Ailearn changes, run `test.html` and smoke-test navigation, persistence, and import/export. Follow Sentinel's `docs/testing/testing_strategy.md` when implementation begins.

## Commit & Pull Request Guidelines

Follow the existing Conventional Commit style: `feat(skills): add converter`, `fix(scanner): handle binary input`, or `docs: update architecture`. Keep commits scoped to one component. Pull requests should explain motivation, changed paths, validation performed, and any security impact; include screenshots for UI changes and link relevant issues or design documents. Before pushing, run the redaction scan and review `git diff` for secrets and local paths.
