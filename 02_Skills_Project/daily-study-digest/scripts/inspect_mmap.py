#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import re
import zipfile
from dataclasses import dataclass, field
from pathlib import Path
from xml.etree import ElementTree as ET


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


@dataclass
class Topic:
    text: str
    path: tuple[str, ...]
    element: ET.Element
    children: list["Topic"] = field(default_factory=list)
    image_uris: list[str] = field(default_factory=list)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Audit a MindManager .mmap topic tree and extract topic-bound images."
    )
    parser.add_argument("mmap", type=Path)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument(
        "--include",
        action="append",
        default=[],
        help="Include a topic subtree whose title contains this text; repeat as needed",
    )
    return parser.parse_args()


def direct_text(element: ET.Element) -> str:
    for child in element:
        if local_name(child.tag) == "Text":
            return child.attrib.get("PlainText", "").strip()
    return ""


def direct_topic_children(element: ET.Element) -> list[ET.Element]:
    for child in element:
        if local_name(child.tag) == "SubTopics":
            return [item for item in child if local_name(item.tag) == "Topic"]
    return []


def own_image_uris(element: ET.Element) -> list[str]:
    found: list[str] = []

    def walk(node: ET.Element) -> None:
        for child in node:
            if local_name(child.tag) == "Topic":
                continue
            if local_name(child.tag) == "Uri" and child.text:
                match = re.fullmatch(r"mmarch://(bin/[^/]+)", child.text.strip())
                if match:
                    found.append(match.group(1))
            walk(child)

    walk(element)
    return found


def build_topic(element: ET.Element, parent_path: tuple[str, ...]) -> Topic:
    text = direct_text(element)
    path = parent_path + ((text or "<无标题>"),)
    topic = Topic(text=text, path=path, element=element, image_uris=own_image_uris(element))
    topic.children = [build_topic(child, path) for child in direct_topic_children(element)]
    return topic


def flatten(topic: Topic) -> list[Topic]:
    return [topic, *(item for child in topic.children for item in flatten(child))]


def image_extension(data: bytes) -> str:
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png"
    if data.startswith(b"\xff\xd8\xff"):
        return ".jpg"
    if data.startswith((b"GIF87a", b"GIF89a")):
        return ".gif"
    if data.lstrip().startswith(b"<svg"):
        return ".svg"
    return ".bin"


def write_outline(path: Path, title: str, roots: list[Topic]) -> None:
    lines = [f"# {title}", ""]

    def emit(topic: Topic, depth: int) -> None:
        label = topic.text or "<无标题>"
        suffix = f" — images: {len(topic.image_uris)}" if topic.image_uris else ""
        lines.append(f"{'  ' * depth}- {label}{suffix}")
        for child in topic.children:
            emit(child, depth + 1)

    for root in roots:
        emit(root, 0)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    args = parse_args()
    output_dir = args.output_dir.resolve()
    image_dir = output_dir / "images"
    output_dir.mkdir(parents=True, exist_ok=True)
    image_dir.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(args.mmap) as archive:
        xml_data = archive.read("Document.xml")
        xml_root = ET.fromstring(xml_data)
        all_elements = [item for item in xml_root.iter() if local_name(item.tag) == "Topic"]
        child_ids = {
            id(child)
            for item in all_elements
            for child in direct_topic_children(item)
        }
        root_elements = [item for item in all_elements if id(item) not in child_ids]
        roots = [build_topic(item, ()) for item in root_elements]
        topics = [item for root in roots for item in flatten(root)]

        if args.include:
            candidates = [
                topic
                for topic in topics
                if any(term.casefold() in topic.text.casefold() for term in args.include)
            ]
            if not candidates:
                raise SystemExit("no topic matched --include values")
            selected = [
                topic
                for topic in candidates
                if not any(
                    topic is not other and id(topic) in {id(item) for item in flatten(other)[1:]}
                    for other in candidates
                )
            ]
            included_ids = {
                id(item)
                for topic in selected
                for item in flatten(topic)
            }
            included_topics = [topic for topic in topics if id(topic) in included_ids]
        else:
            selected = roots
            included_topics = topics

        records: list[dict[str, object]] = []
        first_by_hash: dict[str, str] = {}
        missing: list[str] = []
        for topic in included_topics:
            for uri in topic.image_uris:
                try:
                    data = archive.read(uri)
                except KeyError:
                    missing.append(uri)
                    continue
                digest = hashlib.sha256(data).hexdigest()
                ext = image_extension(data)
                name = f"{digest[:12]}-{Path(uri).stem}{ext}"
                target = image_dir / name
                if not target.exists():
                    target.write_bytes(data)
                duplicate_of = first_by_hash.setdefault(digest, name)
                records.append({
                    "topic_path": list(topic.path),
                    "resource": uri,
                    "sha256": digest,
                    "file": f"images/{name}",
                    "duplicate_of": None if duplicate_of == name else duplicate_of,
                })

    write_outline(output_dir / "outline.md", "完整主题树", roots)
    write_outline(output_dir / "included-outline.md", "纳入主题子树", selected)
    all_refs = [uri for topic in topics for uri in topic.image_uris]
    report = {
        "source": str(args.mmap),
        "topic_count": len(topics),
        "image_reference_count": len(all_refs),
        "unique_image_resource_count": len(set(all_refs)),
        "include_terms": args.include,
        "matched_roots": [list(topic.path) for topic in selected],
        "included_topic_count": len(included_topics),
        "included_image_reference_count": len(records) + len(missing),
        "included_unique_content_count": len({item["sha256"] for item in records}),
        "missing_resources": sorted(set(missing)),
        "images": records,
    }
    (output_dir / "audit.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps({key: value for key, value in report.items() if key != "images"}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
