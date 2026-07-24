#!/usr/bin/env python3
from __future__ import annotations

import argparse
import fnmatch
import hashlib
import json
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

DEFAULT_EXTENSIONS = {
    ".md", ".txt", ".py", ".sql", ".ipynb", ".pdf", ".docx", ".mmap"
}
EXCLUDED_DIRS = {
    ".git", ".venv", ".idea", ".obsidian", "__pycache__", "node_modules"
}
EXCLUDED_FILES = {
    ".DS_Store", "*.pyc", "*_digest.md", "*-digest.md", "*.manifest.json", "*.tmp", "*.temp"
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build a hash manifest for daily study sources.")
    parser.add_argument("target", type=Path, help="Study directory to scan")
    parser.add_argument("--root", type=Path, help="Repository root used for stored relative paths")
    parser.add_argument("--previous", type=Path, help="Previous manifest for change detection")
    parser.add_argument("--output", type=Path, help="Write manifest JSON to this path")
    parser.add_argument(
        "--extensions",
        help="Comma-separated extensions; defaults to md,txt,py,sql,ipynb,pdf,docx,mmap",
    )
    return parser.parse_args()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def excluded(path: Path, target: Path, output: Path | None) -> bool:
    relative = path.relative_to(target)
    if any(part in EXCLUDED_DIRS for part in relative.parts[:-1]):
        return True
    if output and path.resolve() == output.resolve():
        return True
    return any(fnmatch.fnmatch(path.name, pattern) for pattern in EXCLUDED_FILES)


def stored_path(path: Path, root: Path) -> str:
    try:
        return path.resolve().relative_to(root.resolve()).as_posix()
    except ValueError:
        return path.name


def scan(target: Path, root: Path, extensions: set[str], output: Path | None) -> list[dict]:
    files: list[dict] = []
    for path in sorted(target.rglob("*")):
        if not path.is_file() or path.is_symlink() or excluded(path, target, output):
            continue
        if path.suffix.lower() not in extensions:
            continue
        stat = path.stat()
        files.append(
            {
                "path": stored_path(path, root),
                "extension": path.suffix.lower(),
                "bytes": stat.st_size,
                "mtime_ns": stat.st_mtime_ns,
                "sha256": sha256(path),
            }
        )
    return files


def load_previous(path: Path | None) -> dict:
    if not path or not path.exists():
        return {"files": []}
    with path.open(encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data.get("files"), list):
        raise ValueError(f"Invalid previous manifest: {path}")
    return data


def changes(current_files: list[dict], previous_files: list[dict]) -> dict:
    current = {item["path"]: item for item in current_files}
    previous = {item["path"]: item for item in previous_files}

    added = sorted(current.keys() - previous.keys())
    removed = sorted(previous.keys() - current.keys())
    shared = current.keys() & previous.keys()
    modified = sorted(path for path in shared if current[path]["sha256"] != previous[path]["sha256"])
    unchanged = sorted(path for path in shared if current[path]["sha256"] == previous[path]["sha256"])

    old_by_hash: dict[str, list[str]] = defaultdict(list)
    new_by_hash: dict[str, list[str]] = defaultdict(list)
    for path in removed:
        old_by_hash[previous[path]["sha256"]].append(path)
    for path in added:
        new_by_hash[current[path]["sha256"]].append(path)

    renamed: list[dict[str, str]] = []
    renamed_old: set[str] = set()
    renamed_new: set[str] = set()
    for digest in sorted(old_by_hash.keys() & new_by_hash.keys()):
        for old_path, new_path in zip(sorted(old_by_hash[digest]), sorted(new_by_hash[digest])):
            renamed.append({"from": old_path, "to": new_path})
            renamed_old.add(old_path)
            renamed_new.add(new_path)

    return {
        "added": [path for path in added if path not in renamed_new],
        "modified": modified,
        "removed": [path for path in removed if path not in renamed_old],
        "renamed": renamed,
        "unchanged": unchanged,
    }


def duplicate_groups(files: list[dict]) -> list[dict]:
    groups: dict[str, list[str]] = defaultdict(list)
    sizes: dict[str, int] = {}
    for item in files:
        if item["bytes"] == 0:
            continue
        groups[item["sha256"]].append(item["path"])
        sizes[item["sha256"]] = item["bytes"]
    return [
        {"sha256": digest, "bytes": sizes[digest], "paths": sorted(paths)}
        for digest, paths in sorted(groups.items())
        if len(paths) > 1
    ]


def main() -> int:
    args = parse_args()
    target = args.target.resolve()
    if not target.is_dir():
        print(f"Target directory does not exist: {target}", file=sys.stderr)
        return 2

    root = (args.root or target).resolve()
    extensions = DEFAULT_EXTENSIONS
    if args.extensions:
        extensions = {
            value if value.startswith(".") else f".{value}"
            for value in (part.strip().lower() for part in args.extensions.split(","))
            if value
        }

    previous = load_previous(args.previous)
    files = scan(target, root, extensions, args.output)
    delta = changes(files, previous["files"])
    duplicates = duplicate_groups(files)
    manifest = {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_dir": stored_path(target, root),
        "source_count": len(files),
        "extensions": sorted(extensions),
        "summary": {
            "added": len(delta["added"]),
            "modified": len(delta["modified"]),
            "removed": len(delta["removed"]),
            "renamed": len(delta["renamed"]),
            "unchanged": len(delta["unchanged"]),
            "duplicate_groups": len(duplicates),
        },
        "changes": delta,
        "duplicates": duplicates,
        "files": files,
    }

    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(manifest["summary"], ensure_ascii=False))
    else:
        print(json.dumps(manifest, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
