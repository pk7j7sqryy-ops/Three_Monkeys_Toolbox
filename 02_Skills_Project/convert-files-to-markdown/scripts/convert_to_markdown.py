#!/usr/bin/env python3
"""Faithfully convert common documents and source files to portable Markdown."""

from __future__ import annotations

import argparse
import html as html_lib
import json
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

SUPPORTED = {".pdf", ".docx", ".doc", ".mmap", ".py", ".ipynb"}
W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"


class ConversionError(RuntimeError):
    pass


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def clean_text(value: str) -> str:
    value = value.replace("\r\n", "\n").replace("\r", "\n")
    value = re.sub(r"[ \t]+\n", "\n", value)
    value = re.sub(r"\n{3,}", "\n\n", value)
    return value.strip()


def safe_fence(text: str) -> str:
    longest = max((len(m.group(0)) for m in re.finditer(r"`+", text)), default=0)
    return "`" * max(3, longest + 1)


def title_for(path: Path) -> str:
    return path.stem.replace("_", " ").strip() or path.name


def add_frontmatter(body: str, source: Path, enabled: bool) -> str:
    if not enabled:
        return body.rstrip() + "\n"
    escaped = source.name.replace('"', '\\"')
    return f'---\nsource: "{escaped}"\n---\n\n{body.rstrip()}\n'


def pdf_text_with_pdftotext(path: Path) -> list[str] | None:
    executable = shutil.which("pdftotext")
    if not executable:
        return None
    result = subprocess.run(
        [executable, "-layout", str(path), "-"],
        capture_output=True,
        text=True,
        errors="replace",
        check=False,
    )
    if result.returncode != 0:
        return None
    return result.stdout.split("\f")


def pdf_text_with_python(path: Path) -> list[str] | None:
    for module_name in ("pypdf", "PyPDF2"):
        try:
            module = __import__(module_name)
            reader = module.PdfReader(str(path))
            return [(page.extract_text() or "") for page in reader.pages]
        except (ImportError, OSError, ValueError):
            continue
    return None


def ocr_pdf(path: Path) -> list[str] | None:
    pdftoppm = shutil.which("pdftoppm")
    tesseract = shutil.which("tesseract")
    if not pdftoppm or not tesseract:
        return None
    with tempfile.TemporaryDirectory(prefix="md-ocr-") as temp_dir:
        prefix = Path(temp_dir) / "page"
        rendered = subprocess.run(
            [pdftoppm, "-png", "-r", "200", str(path), str(prefix)],
            capture_output=True,
            text=True,
            check=False,
        )
        if rendered.returncode != 0:
            return None
        pages = []
        for image_path in sorted(Path(temp_dir).glob("page-*.png")):
            attempts = ([tesseract, str(image_path), "stdout", "-l", "chi_sim+eng"],
                        [tesseract, str(image_path), "stdout"])
            text = ""
            for command in attempts:
                result = subprocess.run(command, capture_output=True, text=True,
                                        errors="replace", check=False)
                if result.returncode == 0:
                    text = result.stdout
                    break
            pages.append(text)
        return pages or None


def convert_pdf(path: Path, _assets: Path, warnings: list[str], **_: object) -> str:
    pages = pdf_text_with_pdftotext(path) or pdf_text_with_python(path)
    if pages is None:
        raise ConversionError("PDF extraction requires pdftotext or the pypdf package")
    if sum(len(clean_text(page)) for page in pages) < 20:
        ocr_pages = ocr_pdf(path)
        if ocr_pages:
            pages = ocr_pages
            warnings.append("PDF contained little selectable text; OCR was used")
        else:
            warnings.append("PDF may be scanned; OCR tools were unavailable or produced no text")
    sections = [f"# {title_for(path)}"]
    for index, page in enumerate(pages, 1):
        content = clean_text(page)
        sections.append(f"## Page {index}\n\n{content or '> [!WARNING] No readable text extracted from this page.'}")
    return "\n\n".join(sections)


def load_docx_relationships(archive: zipfile.ZipFile) -> dict[str, tuple[str, str]]:
    try:
        root = ET.fromstring(archive.read("word/_rels/document.xml.rels"))
    except KeyError:
        return {}
    result = {}
    for rel in root:
        rid = rel.attrib.get("Id", "")
        target = rel.attrib.get("Target", "")
        kind = rel.attrib.get("Type", "").rsplit("/", 1)[-1]
        result[rid] = (kind, target)
    return result


def load_docx_styles(archive: zipfile.ZipFile) -> dict[str, dict[str, str]]:
    try:
        root = ET.fromstring(archive.read("word/styles.xml"))
    except (KeyError, ET.ParseError):
        return {}
    styles: dict[str, dict[str, str]] = {}
    for style in root.findall(W + "style"):
        style_id = style.attrib.get(W + "styleId", "")
        name_node = style.find(W + "name")
        based_node = style.find(W + "basedOn")
        outline_node = style.find("./" + W + "pPr/" + W + "outlineLvl")
        styles[style_id] = {
            "name": name_node.attrib.get(W + "val", "") if name_node is not None else "",
            "based_on": based_node.attrib.get(W + "val", "") if based_node is not None else "",
            "outline": outline_node.attrib.get(W + "val", "") if outline_node is not None else "",
        }
    return styles


def resolve_docx_style(style_id: str, styles: dict[str, dict[str, str]]) -> tuple[str, str]:
    names = [style_id] if style_id else []
    outline = ""
    seen = set()
    current = style_id
    while current and current not in seen:
        seen.add(current)
        style = styles.get(current, {})
        if style.get("name"):
            names.append(style["name"])
        if not outline and style.get("outline"):
            outline = style["outline"]
        current = style.get("based_on", "")
    return " ".join(names), outline


def convert_vector_media(source: Path, assets: Path) -> Path | None:
    soffice = shutil.which("soffice")
    if not soffice or source.suffix.lower() not in {".emf", ".wmf"}:
        return None
    destination = assets / f"{source.stem}_converted.png"
    if destination.exists():
        return destination
    with tempfile.TemporaryDirectory(prefix="docx-vector-") as temp_dir:
        result = subprocess.run(
            [soffice, "--headless", "--convert-to", "png", "--outdir", temp_dir, str(source)],
            capture_output=True,
            text=True,
            check=False,
        )
        converted = Path(temp_dir) / f"{source.stem}.png"
        if result.returncode != 0 or not converted.exists():
            return None
        shutil.copy2(converted, destination)
        return destination


def extract_docx_media(archive: zipfile.ZipFile, assets: Path,
                       warnings: list[str]) -> dict[str, str]:
    media = [name for name in archive.namelist() if name.startswith("word/media/") and not name.endswith("/")]
    if not media:
        return {}
    assets.mkdir(parents=True, exist_ok=True)
    mapped = {}
    converted_count = 0
    for name in media:
        destination = assets / Path(name).name
        destination.write_bytes(archive.read(name))
        rendered = convert_vector_media(destination, assets)
        output_name = rendered.name if rendered is not None else destination.name
        converted_count += int(rendered is not None)
        mapped[name] = output_name
        mapped["media/" + Path(name).name] = output_name
    vector_count = sum(Path(name).suffix.lower() in {".emf", ".wmf"} for name in media)
    if converted_count:
        warnings.append(f"Converted {converted_count} vector images to PNG for Markdown compatibility")
    if vector_count > converted_count:
        warnings.append(f"Kept {vector_count - converted_count} vector images in their original format")
    return mapped


def docx_property_enabled(node: ET.Element | None) -> bool:
    return node is not None and node.attrib.get(W + "val", "true").lower() not in {"0", "false", "off"}


def docx_run_text(node: ET.Element, relationships: dict[str, tuple[str, str]],
                  media: dict[str, str], assets_name: str, used_media: set[str],
                  format_runs: bool) -> str:
    parts: list[str] = []
    for child in node.iter():
        kind = local_name(child.tag)
        if kind == "t" and child.text:
            parts.append(child.text)
        elif kind == "tab":
            parts.append("\t")
        elif kind in {"br", "cr"}:
            parts.append("\n")
        elif kind in {"blip", "imagedata"}:
            rid = child.attrib.get(R + "embed") or child.attrib.get(R + "id")
            if rid and rid in relationships:
                target = relationships[rid][1].lstrip("/")
                filename = media.get(target) or media.get("word/" + target)
                if filename:
                    used_media.add(filename)
                    parts.append(f"![embedded image]({assets_name}/{filename})")
    text = "".join(parts)
    if not text or not format_runs or text.startswith("![embedded image]"):
        return text
    props = node.find(W + "rPr")
    if props is not None:
        if docx_property_enabled(props.find(W + "b")):
            text = f"<strong>{text}</strong>"
        if docx_property_enabled(props.find(W + "i")):
            text = f"<em>{text}</em>"
        if docx_property_enabled(props.find(W + "strike")) or docx_property_enabled(props.find(W + "dstrike")):
            text = f"<del>{text}</del>"
    return text


def docx_inline_text(node: ET.Element, relationships: dict[str, tuple[str, str]],
                     media: dict[str, str], assets_name: str, used_media: set[str],
                     format_runs: bool = True) -> str:
    parts: list[str] = []
    for child in node:
        kind = local_name(child.tag)
        if kind == "r":
            parts.append(docx_run_text(child, relationships, media, assets_name,
                                       used_media, format_runs))
        elif kind == "hyperlink":
            content = "".join(
                docx_run_text(run, relationships, media, assets_name, used_media, format_runs)
                for run in child if local_name(run.tag) == "r"
            )
            rid = child.attrib.get(R + "id")
            if rid and rid in relationships and relationships[rid][0] == "hyperlink" and content:
                parts.append(f"[{content}]({relationships[rid][1]})")
            else:
                parts.append(content)
        elif kind not in {"pPr", "bookmarkStart", "bookmarkEnd", "proofErr"}:
            parts.append(docx_inline_text(child, relationships, media, assets_name,
                                          used_media, format_runs))
    text = "".join(parts).strip()
    for _ in range(2):
        for tag in ("strong", "em", "del"):
            text = text.replace(f"</{tag}><{tag}>", "")
    return text


CHINESE_LEVELS = {"一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6,
                  "七": 7, "八": 8, "九": 9}


def docx_heading_level(style: str, outline: str) -> int | None:
    if outline.isdigit() and 0 <= int(outline) <= 5:
        return int(outline) + 1
    match = re.search(r"(?:Heading|标题)\s*([1-9])", style, re.IGNORECASE)
    if match:
        return min(6, int(match.group(1)))
    match = re.search(r"([一二三四五六七八九])级(?:标题)?", style)
    if match:
        return min(6, CHINESE_LEVELS[match.group(1)])
    if "文档主标题" in style or re.search(r"(?:^|\s)Title(?:\s|$)", style, re.IGNORECASE):
        return 1
    return None


def docx_paragraph(node: ET.Element, relationships: dict[str, tuple[str, str]],
                   media: dict[str, str], assets_name: str, used_media: set[str],
                   styles: dict[str, dict[str, str]]) -> str:
    props = node.find(W + "pPr")
    style_id = ""
    numbered = False
    list_level = 0
    if props is not None:
        style_node = props.find(W + "pStyle")
        if style_node is not None:
            style_id = style_node.attrib.get(W + "val", "")
        num_props = props.find(W + "numPr")
        numbered = num_props is not None
        if num_props is not None:
            level_node = num_props.find(W + "ilvl")
            if level_node is not None and level_node.attrib.get(W + "val", "").isdigit():
                list_level = int(level_node.attrib[W + "val"])
    style, outline = resolve_docx_style(style_id, styles)
    is_code = bool(re.search(r"(?:代码|Code)", style, re.IGNORECASE))
    text = docx_inline_text(node, relationships, media, assets_name, used_media,
                            format_runs=not is_code)
    if not text:
        return ""
    heading_level = docx_heading_level(style, outline)
    if heading_level:
        level = min(6, heading_level)
        return f"{'#' * level} {text}"
    if is_code:
        fence = safe_fence(text)
        return f"{fence}\n{text}\n{fence}"
    if numbered or re.search(r"(?:List|列表|Bullet)", style, re.IGNORECASE):
        return f"{'  ' * list_level}- {text}"
    return text


def docx_table(node: ET.Element, relationships: dict[str, tuple[str, str]],
               media: dict[str, str], assets_name: str, used_media: set[str]) -> str:
    rows: list[list[str]] = []
    for row in node.findall(W + "tr"):
        cells = []
        for cell in row.findall(W + "tc"):
            parts = [docx_inline_text(p, relationships, media, assets_name, used_media)
                     for p in cell.findall(".//" + W + "p")]
            value = "<br>".join(part for part in parts if part).replace("|", "\\|")
            cells.append(value)
        rows.append(cells)
    if not rows:
        return ""
    width = max(len(row) for row in rows)
    rows = [row + [""] * (width - len(row)) for row in rows]
    lines = ["| " + " | ".join(rows[0]) + " |", "| " + " | ".join(["---"] * width) + " |"]
    lines.extend("| " + " | ".join(row) + " |" for row in rows[1:])
    return "\n".join(lines)


def convert_docx(path: Path, assets: Path, warnings: list[str], **_: object) -> str:
    try:
        with zipfile.ZipFile(path) as archive:
            root = ET.fromstring(archive.read("word/document.xml"))
            relationships = load_docx_relationships(archive)
            styles = load_docx_styles(archive)
            media = extract_docx_media(archive, assets, warnings)
    except (zipfile.BadZipFile, KeyError, ET.ParseError) as exc:
        raise ConversionError(f"invalid DOCX: {exc}") from exc
    body = root.find(W + "body")
    if body is None:
        raise ConversionError("DOCX has no document body")
    blocks = []
    used_media: set[str] = set()
    for node in body:
        kind = local_name(node.tag)
        if kind == "p":
            value = docx_paragraph(node, relationships, media, assets.name,
                                   used_media, styles)
        elif kind == "tbl":
            value = docx_table(node, relationships, media, assets.name, used_media)
        else:
            continue
        if value:
            blocks.append(value)
    unplaced_media = sorted(set(media.values()) - used_media)
    if unplaced_media:
        warnings.append(f"Appended {len(unplaced_media)} media files whose inline position was unavailable")
        links = []
        for name in unplaced_media:
            prefix = "!" if Path(name).suffix.lower() in {".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp"} else ""
            links.append(f"{prefix}[{name}]({assets.name}/{name})")
        blocks.append("## Extracted media\n\n" + "\n".join(links))
    return "\n\n".join(blocks) or f"# {title_for(path)}\n\n> [!WARNING] No readable content extracted."


def convert_doc(path: Path, _assets: Path, warnings: list[str], **_: object) -> str:
    commands = []
    if shutil.which("textutil"):
        commands.append(["textutil", "-convert", "txt", "-stdout", str(path)])
    if shutil.which("antiword"):
        commands.append(["antiword", str(path)])
    if shutil.which("pandoc"):
        commands.append(["pandoc", str(path), "-t", "gfm"])
    for command in commands:
        result = subprocess.run(command, capture_output=True, text=True, errors="replace", check=False)
        if result.returncode == 0 and result.stdout.strip():
            warnings.append("Legacy DOC conversion may not preserve layout or embedded media")
            return f"# {title_for(path)}\n\n{clean_text(result.stdout)}"
    raise ConversionError("legacy DOC requires textutil, antiword, or pandoc")


def mmap_topic_text(node: ET.Element) -> str:
    for item in node:
        if local_name(item.tag) != "Text":
            continue
        value = item.attrib.get("PlainText") or item.attrib.get("Text") or item.text
        if value and value.strip():
            return value.strip()
    for key in ("PlainText", "Text", "Name"):
        value = node.attrib.get(key)
        if value:
            return value.strip()
    return ""


def mmap_direct_topics(node: ET.Element) -> list[ET.Element]:
    topics = []
    for child in node:
        kind = local_name(child.tag)
        if kind == "Topic":
            topics.append(child)
        elif kind in {"Topics", "SubTopics"}:
            topics.extend(item for item in child if local_name(item.tag) == "Topic")
    return topics


def mmap_xhtml_text(node: ET.Element) -> str:
    parts: list[str] = []

    def visit(item: ET.Element) -> None:
        kind = local_name(item.tag).lower()
        if kind in {"p", "div", "li"} and parts and not parts[-1].endswith("\n"):
            parts.append("\n")
        if item.text:
            parts.append(item.text)
        for child in item:
            if local_name(child.tag).lower() == "br":
                parts.append("\n")
            else:
                visit(child)
            if child.tail:
                parts.append(child.tail)
        if kind in {"p", "div", "li"}:
            parts.append("\n")

    visit(node)
    return clean_text(html_lib.unescape("".join(parts)))


def mmap_note_text(group: ET.Element) -> str:
    xhtml_data = next((item for item in group if local_name(item.tag) == "NotesXhtmlData"), None)
    if xhtml_data is None:
        return ""
    html_node = next((item for item in xhtml_data.iter() if local_name(item.tag).lower() == "html"), None)
    if html_node is not None:
        text = mmap_xhtml_text(html_node)
        if text:
            return text
    preview = xhtml_data.attrib.get("PreviewPlainText", "")
    preview = re.sub(r"(?i)<br\s*/?>", "\n", preview)
    preview = re.sub(r"<[^>]+>", "", preview)
    return clean_text(html_lib.unescape(preview))


def media_extension(data: bytes, hint: str = "") -> str:
    hinted = Path(hint).suffix.lower()
    if hinted in {".png", ".jpg", ".jpeg", ".gif", ".bmp", ".tif", ".tiff", ".webp", ".svg"}:
        return ".jpg" if hinted == ".jpeg" else hinted
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png"
    if data.startswith(b"\xff\xd8\xff"):
        return ".jpg"
    if data.startswith((b"GIF87a", b"GIF89a")):
        return ".gif"
    if data.startswith(b"BM"):
        return ".bmp"
    if data.startswith((b"II*\x00", b"MM\x00*")):
        return ".tiff"
    if data.startswith(b"RIFF") and data[8:12] == b"WEBP":
        return ".webp"
    if b"<svg" in data[:512].lower():
        return ".svg"
    return ".bin"


def mmap_media_references(root: ET.Element) -> list[tuple[str, str]]:
    references: list[tuple[str, str]] = []
    for topic in (item for item in root.iter() if local_name(item.tag) == "Topic"):
        for group in direct_mmap_groups(topic, "NotesGroup"):
            for data_node in (item for item in group if local_name(item.tag) == "NotesData"):
                uri_node = next((item for item in data_node if local_name(item.tag) == "Uri"), None)
                uri = (uri_node.text or "").strip() if uri_node is not None else ""
                if uri.startswith("mmarch://"):
                    references.append((uri, data_node.attrib.get("ImageUri", "")))
        for image_group in direct_mmap_groups(topic, "OneImage"):
            data_node = next((item for item in image_group.iter()
                              if local_name(item.tag) == "ImageData"), None)
            uri_node = next((item for item in (data_node if data_node is not None else [])
                             if local_name(item.tag) == "Uri"), None)
            uri = (uri_node.text or "").strip() if uri_node is not None else ""
            if uri.startswith("mmarch://"):
                image_type = data_node.attrib.get("ImageType", "").rsplit(":", 1)[-1]
                hint = "." + image_type.removesuffix("Image").lower()
                references.append((uri, hint))
    return list(dict.fromkeys(references))


def extract_mmap_media(archive: zipfile.ZipFile, root: ET.Element, assets: Path,
                       warnings: list[str]) -> dict[str, str]:
    mapped: dict[str, str] = {}
    references = mmap_media_references(root)
    if not references:
        return mapped
    assets.mkdir(parents=True, exist_ok=True)
    for uri, hint in references:
        archive_name = uri.removeprefix("mmarch://").lstrip("/")
        try:
            data = archive.read(archive_name)
        except KeyError:
            warnings.append(f"Missing packaged media: {archive_name}")
            continue
        extension = media_extension(data, hint)
        filename = f"{Path(archive_name).stem}{extension}"
        destination = assets / filename
        if not destination.exists():
            destination.write_bytes(data)
        mapped[uri] = filename
    return mapped


def direct_mmap_groups(node: ET.Element, name: str) -> list[ET.Element]:
    return [item for item in node if local_name(item.tag) == name]


def chinese_number(value: int) -> str:
    digits = "零一二三四五六七八九"
    if value < 10:
        return digits[value]
    if value < 20:
        return "十" + (digits[value % 10] if value % 10 else "")
    if value < 100:
        return digits[value // 10] + "十" + (digits[value % 10] if value % 10 else "")
    return str(value)


def mmap_outline_number(path: tuple[int, ...]) -> str:
    if len(path) == 1:
        return f"{chinese_number(path[0])}."
    return ".".join(str(item) for item in path) + "."


def render_mmap_payload(node: ET.Element, lines: list[str], media: dict[str, str],
                        assets_name: str) -> None:
    for group in direct_mmap_groups(node, "NotesGroup"):
        note = mmap_note_text(group)
        if note:
            lines.append(note)
        for data_node in (item for item in group if local_name(item.tag) == "NotesData"):
            uri_node = next((item for item in data_node if local_name(item.tag) == "Uri"), None)
            uri = (uri_node.text or "").strip() if uri_node is not None else ""
            if uri in media:
                filename = media[uri]
                label = data_node.attrib.get("ImageUri") or filename
                prefix = "!" if Path(filename).suffix.lower() != ".bin" else ""
                lines.append(f"{prefix}[{label}]({assets_name}/{filename})")
    for image_group in direct_mmap_groups(node, "OneImage"):
        uri_node = next((item for item in image_group.iter() if local_name(item.tag) == "Uri"), None)
        uri = (uri_node.text or "").strip() if uri_node is not None else ""
        if uri in media:
            filename = media[uri]
            prefix = "!" if Path(filename).suffix.lower() != ".bin" else ""
            lines.append(f"{prefix}[{filename}]({assets_name}/{filename})")


def render_mmap_topic(node: ET.Element, path: tuple[int, ...], lines: list[str],
                      media: dict[str, str], assets_name: str) -> None:
    text = mmap_topic_text(node).replace("\n", "<br>")
    if text:
        heading_level = min(6, len(path))
        lines.append(f"{'#' * heading_level} {mmap_outline_number(path)} {text}")
    render_mmap_payload(node, lines, media, assets_name)
    for index, child in enumerate(mmap_direct_topics(node), 1):
        render_mmap_topic(child, path + (index,), lines, media, assets_name)


def convert_mmap(path: Path, assets: Path, warnings: list[str], **_: object) -> str:
    try:
        with zipfile.ZipFile(path) as archive:
            xml_names = [name for name in archive.namelist()
                         if name.lower().endswith(".xml") and "document" in name.lower()]
            if not xml_names:
                xml_names = [name for name in archive.namelist() if name.lower().endswith(".xml")]
            if not xml_names:
                raise ConversionError("MMAP contains no XML document")
            root = ET.fromstring(archive.read(xml_names[0]))
            media = extract_mmap_media(archive, root, assets, warnings)
    except (zipfile.BadZipFile, KeyError, ET.ParseError) as exc:
        raise ConversionError(f"invalid MMAP: {exc}") from exc
    topics = [item for item in root.iter() if local_name(item.tag) == "OneTopic"]
    start = None
    if topics:
        start = next((item for item in topics[0].iter() if local_name(item.tag) == "Topic"), None)
    if start is None:
        start = next((item for item in root.iter() if local_name(item.tag) == "Topic"), None)
    if start is None:
        raise ConversionError("MMAP contains no recognizable topic")
    lines: list[str] = []
    title = mmap_topic_text(start).replace("\n", "<br>")
    if title:
        lines.append(f"<div align=\"center\"><strong>{title}</strong></div>")
    render_mmap_payload(start, lines, media, assets.name)
    for index, child in enumerate(mmap_direct_topics(start), 1):
        render_mmap_topic(child, (index,), lines, media, assets.name)
    return "\n\n".join(lines)


def convert_python(path: Path, _assets: Path, _warnings: list[str], **_: object) -> str:
    text = path.read_text(encoding="utf-8", errors="replace")
    fence = safe_fence(text)
    return f"# {title_for(path)}\n\n{fence}python\n{text.rstrip()}\n{fence}"


def output_text(output: object) -> str:
    if isinstance(output, str):
        return output
    if isinstance(output, list):
        return "\n".join(output_text(item) for item in output)
    if isinstance(output, dict):
        for key in ("text", "data"):
            if key in output:
                value = output[key]
                if isinstance(value, dict):
                    return output_text(value.get("text/plain", json.dumps(value, ensure_ascii=False)))
                return output_text(value)
    return str(output)


def convert_notebook(path: Path, _assets: Path, warnings: list[str],
                     keep_notebook_output: bool = False, **_: object) -> str:
    try:
        notebook = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as exc:
        raise ConversionError(f"invalid notebook: {exc}") from exc
    lines = [f"# {title_for(path)}"]
    language = notebook.get("metadata", {}).get("kernelspec", {}).get("language", "python")
    for cell in notebook.get("cells", []):
        source = "".join(cell.get("source", []))
        if cell.get("cell_type") == "markdown":
            lines.append(source.rstrip())
        elif cell.get("cell_type") == "code":
            fence = safe_fence(source)
            lines.append(f"{fence}{language}\n{source.rstrip()}\n{fence}")
            if keep_notebook_output and cell.get("outputs"):
                rendered = "\n\n".join(output_text(item) for item in cell["outputs"])
                lines.append(f"<details>\n<summary>Output</summary>\n\n```text\n{rendered}\n```\n\n</details>")
        elif source:
            warnings.append(f"Unknown notebook cell type: {cell.get('cell_type', 'missing')}")
            lines.append(source.rstrip())
    return "\n\n".join(part for part in lines if part)


CONVERTERS = {
    ".pdf": convert_pdf,
    ".docx": convert_docx,
    ".doc": convert_doc,
    ".mmap": convert_mmap,
    ".py": convert_python,
    ".ipynb": convert_notebook,
}


def source_files(inputs: list[Path]) -> list[tuple[Path, Path | None]]:
    result = []
    for item in inputs:
        if item.is_file():
            result.append((item, None))
        elif item.is_dir():
            result.extend((path, item) for path in sorted(item.rglob("*"))
                          if path.is_file() and path.suffix.lower() in SUPPORTED)
        else:
            print(f"WARNING: input does not exist: {item}", file=sys.stderr)
    return result


def destination_for(source: Path, root: Path | None, output_dir: Path | None) -> Path:
    if output_dir:
        relative = source.relative_to(root) if root else Path(source.name)
        return (output_dir / relative).with_suffix(".md")
    if root:
        relative = source.relative_to(root)
        return (root.parent / f"{root.name}_markdown" / relative).with_suffix(".md")
    return source.with_suffix(".md")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("inputs", nargs="+", type=Path, help="files or directories to convert")
    parser.add_argument("--output-dir", type=Path, help="write all results under this directory")
    parser.add_argument("--overwrite", action="store_true", help="replace existing Markdown files")
    parser.add_argument("--frontmatter", action="store_true", help="add minimal YAML source metadata")
    parser.add_argument("--keep-notebook-output", action="store_true", help="include saved notebook outputs")
    parser.add_argument("--dry-run", action="store_true", help="show mappings without writing files")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    files = source_files(args.inputs)
    if not files:
        print("ERROR: no supported input files found", file=sys.stderr)
        return 2
    failures = 0
    planned: set[Path] = set()
    for source, root in files:
        destination = destination_for(source, root, args.output_dir)
        if destination in planned:
            destination = destination.with_name(
                f"{destination.stem}_{source.suffix.lower().lstrip('.')}.md"
            )
        counter = 2
        candidate = destination
        while candidate in planned:
            candidate = destination.with_name(f"{destination.stem}_{counter}.md")
            counter += 1
        destination = candidate
        planned.add(destination)
        print(f"{source} -> {destination}")
        if args.dry_run:
            continue
        if destination.exists() and not args.overwrite:
            print(f"WARNING: skipped existing output: {destination}", file=sys.stderr)
            continue
        warnings: list[str] = []
        assets = destination.parent / f"{destination.stem}_assets"
        try:
            body = CONVERTERS[source.suffix.lower()](
                source, assets, warnings,
                keep_notebook_output=args.keep_notebook_output,
            )
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_text(add_frontmatter(body, source, args.frontmatter), encoding="utf-8")
            for warning in warnings:
                print(f"WARNING: {source.name}: {warning}", file=sys.stderr)
        except (ConversionError, OSError) as exc:
            failures += 1
            print(f"ERROR: {source}: {exc}", file=sys.stderr)
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
