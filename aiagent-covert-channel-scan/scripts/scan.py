#!/usr/bin/env python3
"""AI Agent 客户端隐蔽信道扫描器(自包含零依赖版)。

仅依赖 Python 标准库。检测能力:
  1. 静态代码扫描 —— 按特征库匹配时区/代理/主机指纹/区域判定/系统提示词拼接等
  2. 提示词隐写检测 —— 零宽字符/控制字符/Unicode 标签/Base64 明文,并尝试解码
  3. 二进制字符串扫描 —— 对 native 二进制跑 strings,再命中关键词
  4. 双重编码解码 —— 暴力尝试 base64+XOR(0x00-0xFF)解出隐藏字符串

用法:
  python3 scan.py <PATH>                     # 扫描,结果输出到控制台
  python3 scan.py <PATH> -o rep.md           # 输出到指定文件
  python3 scan.py <PATH> --save              # 存到 OS 标准目录(macOS: ~/Library/Application Support/secscan/reports/)
  python3 scan.py <PATH> --strings-only      # 仅对二进制做 strings 扫描

报告默认目录(跨平台):
  macOS  : ~/Library/Application Support/secscan/reports/
  Windows: %LOCALAPPDATA%\\secscan\\reports\\
  Linux  : ~/.local/share/secscan/reports/
  默认保留 30 天,超期自动清理。

退出码: 0=干净  1=有 high  2=有 critical
"""

from __future__ import annotations

import argparse
import base64
import binascii
import json
import os
import re
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional, Tuple


# ============ 跨平台报告目录 ============
def default_report_dir() -> Path:
    """返回 OS 标准报告目录(不存在则创建)。"""
    if sys.platform == "win32":
        base = Path(os.environ.get("LOCALAPPDATA", "") ) or (Path.home() / "AppData" / "Local")
        d = base / "secscan" / "reports"
    elif sys.platform == "darwin":
        d = Path.home() / "Library" / "Application Support" / "secscan" / "reports"
    else:  # Linux/Unix,遵循 XDG
        xdg = os.environ.get("XDG_DATA_HOME", "")
        base = Path(xdg) if xdg else (Path.home() / ".local" / "share")
        d = base / "secscan" / "reports"
    d.mkdir(parents=True, exist_ok=True)
    return d


def cleanup_old_reports(retention_days: int = 30) -> int:
    """清理默认报告目录中超过 retention_days 天的报告,返回删除数。
    容错:目录无法创建/访问时直接返回 0,不抛异常。"""
    try:
        d = default_report_dir()
    except (OSError, PermissionError):
        return 0
    if not d.exists():
        return 0
    cutoff = time.time() - retention_days * 86400
    deleted = 0
    try:
        items = list(d.iterdir())
    except (OSError, PermissionError):
        return 0
    for f in items:
        if not f.is_file() or f.suffix not in (".md", ".json"):
            continue
        try:
            if f.stat().st_mtime < cutoff:
                f.unlink()
                deleted += 1
        except OSError:
            pass
    return deleted

# ============ 特征库(内置,源自 Claude Code 2.1.197 实战) ============
RULES: List[dict] = [
    {"id": "CC-TZ-001", "name": "读取本地时区(JS)", "severity": "medium",
     "patterns": [r"Intl\.DateTimeFormat\(\)\.resolvedOptions\(\)\.timeZone",
                  r"getTimezoneOffset", r"process\.env\.TZ\b"],
     "desc": "读取本地时区,是中国用户识别的核心信号",
     "attack": ["T1612.001", "T1082"],
     "confidence": "low",
     "recommendation": "时区读取本身有合法用途(本地化显示),需结合上下文判断。若出现在条件判定或拼接系统提示词的路径上,建议拦截或环境变量覆盖。"},
    {"id": "CC-TZ-002", "name": "读取本地时区(Python)", "severity": "medium",
     "patterns": [r"from\s+tzlocal\s+import", r"from\s+zoneinfo\s+import",
                  r"time\.tzname", r"datetime\.now\(\)\.astimezone"],
     "desc": "Python 端读取时区",
     "attack": ["T1612.001", "T1082"],
     "confidence": "low",
     "recommendation": "同 CC-TZ-001,需结合用途判定。"},
    {"id": "CC-PROXY-001", "name": "读取代理环境变量", "severity": "high",
     "patterns": [r"HTTP_PROXY|HTTPS_PROXY|ALL_PROXY|NO_PROXY",
                  r"http_proxy|https_proxy|all_proxy|no_proxy"],
     "desc": "读取代理环境变量,可推断用户是否走代理(识别大陆代理用户)",
     "attack": ["T1612.001"],
     "confidence": "medium",
     "recommendation": "代理读取有合法用途(出站请求),但在 Claude Code 事件中被用于辅助识别代理用户。建议在容器/沙箱中固定代理环境变量,消除差异性。"},
    {"id": "CC-HOST-001", "name": "读取主机/平台指纹", "severity": "high",
     "patterns": [r"os\.hostname\(\)|os\.platform\(\)|os\.arch\(\)|os\.userInfo\(",
                  r"process\.platform|process\.arch", r"networkInterfaces\(\)",
                  r"platform\.node\(\)|platform\.system\(\)", r"socket\.gethostname",
                  r"uuid\.getnode\(\)"],
     "desc": "采集主机名/平台/CPU/MAC 构成设备指纹",
     "attack": ["T1082", "T1612.001"],
     "confidence": "medium",
     "recommendation": "主机指纹采集用于 telemetry 上报。建议在敏感环境使用容器化运行,统一 hostname/platform,并在网络层拦截非必要外联。"},
    {"id": "CC-REGION-001", "name": "中国时区判定(Asia/Shanghai 等)", "severity": "critical",
     "patterns": [r"Asia/Shanghai", r"Asia/Urumqi", r"Asia/Chongqing",
                  r"Asia/Harbin", r"Asia/Chungking", r"\bPRC\b|\bCTT\b"],
     "desc": "直接出现中国时区标识。实战样本:t===\"Asia/Shanghai\"||t===\"Asia/Urumqi\"",
     "attack": ["T1612.001", "T1082"],
     "confidence": "high",
     "recommendation": "高可信中国用户识别信号。若为判定逻辑而非 timezone 数据库枚举,需在运行时 hook `Intl.DateTimeFormat` 返回固定时区,或直接弃用该客户端。"},
    {"id": "CC-REGION-002", "name": "中国用户标记变量", "severity": "critical",
     "patterns": [r"cnTZ|cnProxy|cn_proxy|isCNUser|isChinaUser|cnUser",
                  r"\blabKw\b", r"cnBlocklist|cnBlockList"],
     "desc": "显式的'中国用户标记'变量。实战样本 ddp() 返回 {cnTZ, labKw, known, host}",
     "attack": ["T1612.001"],
     "confidence": "high",
     "recommendation": "高可信标记变量,几乎确证存在区域识别逻辑。建议反编译定位该变量的回传路径,并评估封号影响。"},
    {"id": "CC-REGION-003", "name": "中国/区域判定逻辑", "severity": "critical",
     "patterns": [r"(timeZone|timezone|tz)[^=]{0,20}(Asia/Shanghai|CN|China)",
                  r"(includes|indexOf|startsWith|match)\(['\"]CN['\"]",
                  r"isChinese|isChina|is_cn|isCN"],
     "desc": "显式判断用户是否为中国/中文用户",
     "attack": ["T1612.001"],
     "confidence": "high",
     "recommendation": "显式区域判定,用途可疑。建议代码审查该逻辑分支的下游行为(是否触发回传/限制)。"},
    {"id": "CC-STEGO-001", "name": "系统提示词拼接敏感字段", "severity": "critical",
     "patterns": [r"(systemPrompt|system_prompt|instructions)\s*[:=+][^;]{0,80}(timeZone|HTTP_PROXY|platform|hostname)",
                  r"(timeZone|process\.platform)\s*\+\s*['\"`]"],
     "desc": "把时区/代理等拼进系统提示词,随请求回传",
     "attack": ["T1612.001", "T1027"],
     "confidence": "high",
     "recommendation": "系统提示词是回传服务器的明文通道,拼接敏感字段即隐蔽信道。建议拦截出站请求,过滤系统提示词中的环境信息。"},
    {"id": "CC-STEGO-002", "name": "基于时区编码系统提示词(分隔符变种)", "severity": "critical",
     "patterns": [r"replaceAll\(['\"]-['\"],\s*['\"]/", r"replaceAll\(['\"]/",
                  r"cnTZ\s*\?", r"\?\s*e\.replaceAll"],
     "desc": "中国时区→日期分隔符从 - 改为 /,把国籍编码进提示词日期片段。实战 eca() 函数",
     "attack": ["T1612.001", "T1027.010"],
     "confidence": "high",
     "recommendation": "分隔符编码是事件核心手法,对用户完全不可见。建议在出站代理层正则化日期格式(强制 `-`),或用 mitmproxy 脚本重写系统提示词。"},
    {"id": "CC-ENCODE-001", "name": "可疑编码操作", "severity": "medium",
     "patterns": [r"btoa\(|atob\(", r"Buffer\.from\([^)]{0,60},\s*['\"]base64['\"]\)",
                  r"\.toString\(['\"]base64['\"]\)", r"base64\.b64encode"],
     "desc": "Base64 编码,可能用于规避肉眼检查",
     "attack": ["T1027"],
     "confidence": "low",
     "recommendation": "Base64 有大量合法用途(Basic Auth、二进制传输)。需结合被编码内容判定,仅当被编码的是敏感字段或黑名单时才视为恶意。"},
    {"id": "CC-ENCODE-002", "name": "双重编码隐藏字符串(base64+XOR)", "severity": "high",
     "patterns": [r"\^\s*0x[0-9a-fA-F]{2}", r"String\.fromCharCode\([^)]*\^\s*0x",
                  r"\.map\([^)]*\^\s*0x[0-9a-fA-F]{2}\)"],
     "desc": "base64+XOR 双重编码。实战 idp 变量经 base64+XOR 0x5b 解出 68 个中国企业域名",
     "attack": ["T1027.010", "T1612.001"],
     "confidence": "high",
     "recommendation": "双重编码是规避静态分析的典型手法。若解码出域名/IP 列表,几乎确证为黑名单。建议记录解码明文,作为后续检测的 IOC。"},
    {"id": "CC-ENCODE-003", "name": "零宽字符注入", "severity": "high",
     "patterns": [r"\\u200[0-9a-f]|\\u206[0-4]|\\ufeff|\\u00ad",
                  r"String\.fromCharCode\(0x200[0-9a-f]", r"zero.?width|stego"],
     "desc": "在代码中写入或生成零宽字符,用于把信息隐写进提示词",
     "attack": ["T1027.010", "T1612.001"],
     "confidence": "medium",
     "recommendation": "需甄别:键盘 keycode 表、编译器错误信息可能误报。若出现在提示词模板或字符串拼接中,需做解码验证(零宽字符可编码任意二进制)。"},
    {"id": "CC-NET-001", "name": "向外部服务回传数据", "severity": "high",
     "patterns": [r"fetch\(['\"`]https?://", r"axios\.(post|put)\(",
                  r"http\.request|https\.request", r"requests\.(post|put)\("],
     "desc": "客户端向外部服务器发送数据,需结合上下文判断是否回传敏感字段",
     "attack": ["T1612.001", "T1041"],
     "confidence": "low",
     "recommendation": "HTTP 请求本身是客户端正常行为。需结合请求体内容判定。建议用 mitmproxy/Charles 抓包,审查出站请求的 prompt 字段是否包含编码标记。"},
]

EXT_LANG = {".js": "js", ".jsx": "js", ".mjs": "js", ".cjs": "js", ".ts": "js", ".tsx": "js",
            ".py": "python", ".json": "json", ".md": "md", ".txt": "txt",
            ".yaml": "yaml", ".yml": "yaml", ".prompt": "txt", ".tpl": "txt"}
SCANNABLE_EXT = list(EXT_LANG.keys())
MAX_FILE_BYTES = 2 * 1024 * 1024
EVIDENCE_MAX = 200

# ============ 隐写检测 ============
ZERO_WIDTH = {"\u200b": "ZWSP", "\u200c": "ZWNJ", "\u200d": "ZWJ", "\u200e": "LRM",
              "\u200f": "RTL", "\u2060": "WJ", "\u2061": "FA", "\u2062": "IT",
              "\u2063": "IS", "\u2064": "IP", "\ufeff": "BOM", "\u00ad": "SHY", "\u180e": "MVS"}
TAG_BASE = 0xE0000
_B64_RE = re.compile(r"[A-Za-z0-9+/]{16,}={0,2}")


def _snippet(text: str, idx: int, r: int = 20) -> str:
    s, e = max(0, idx - r), min(len(text), idx + r)
    raw = text[s:e]
    return "..." + "".join(c for c in raw if c not in ZERO_WIDTH and c.isprintable()) + "..."


def extract_zero_width(text: str) -> List[Tuple[int, str]]:
    return [(i, c) for i, c in enumerate(text) if c in ZERO_WIDTH]


def decode_zero_width(text: str) -> Optional[str]:
    zw = [c for _, c in extract_zero_width(text) if c in ("\u200b", "\u200c")]
    if len(zw) < 8:
        return None
    for zero_ch, one_ch in [("\u200b", "\u200c"), ("\u200c", "\u200b")]:
        bits = "".join("0" if c == zero_ch else "1" for c in zw)
        n = len(bits) - (len(bits) % 8)
        if n < 8:
            continue
        buf = bytearray(int(bits[i:i + 8], 2) for i in range(0, n, 8))
        try:
            dec = buf.decode("utf-8", errors="strict")
        except UnicodeDecodeError:
            continue
        if dec and sum(1 for c in dec if c.isprintable() or c in "\n\r\t") / len(dec) > 0.8:
            return dec
    return None


def decode_unicode_tags(text: str) -> Optional[str]:
    out = [chr(ord(c) - TAG_BASE) for c in text if TAG_BASE <= ord(c) <= TAG_BASE + 0x7E]
    return "".join(out) if out else None


def detect_control_chars(text: str) -> List[Tuple[int, str, str]]:
    return [(i, c, f"U+{ord(c):04X}") for i, c in enumerate(text)
            if c not in ("\t", "\n", "\r") and (ord(c) < 0x20 or 0x7F <= ord(c) <= 0x9F)]


def detect_base64_chunks(text: str) -> List[Tuple[int, str, Optional[str]]]:
    res = []
    for m in _B64_RE.finditer(text):
        chunk = m.group(0)
        padded = chunk + "=" * (-len(chunk) % 4)
        try:
            raw = base64.b64decode(padded, validate=True)
        except (binascii.Error, ValueError):
            continue
        try:
            dec = raw.decode("utf-8")
        except UnicodeDecodeError:
            continue
        if dec and sum(1 for c in dec if c.isprintable() or c in "\n\r\t") / len(dec) > 0.8:
            res.append((m.start(), chunk, dec))
    return res


_TLD_RE = re.compile(r"\.(com|cn|net|org|io|ai|co|cc|xyz|top|run|app)(\b|$)")


def try_double_decode(b64_str: str) -> Optional[Tuple[int, str, float]]:
    """对 base64 串暴力尝试 XOR 0x00-0xFF,返回(key, 明文, 域名token比例)或 None。

    用"逗号分隔的 token 中含 TLD 的比例"判定,避免乱码凑出单个 .com 误报。
    正确黑名单(如 cn,sankuai.com,netease.com,...)比例接近 1.0。
    """
    padded = b64_str + "=" * (-len(b64_str) % 4)
    try:
        raw = base64.b64decode(padded, validate=True)
    except (binascii.Error, ValueError):
        return None
    if len(raw) < 8:
        return None
    best: Optional[Tuple[int, str, float]] = None
    for key in range(256):
        dec = bytes(b ^ key for b in raw)
        try:
            s = dec.decode("utf-8", errors="strict")
        except UnicodeDecodeError:
            continue
        tokens = [t.strip() for t in s.split(",") if t.strip()]
        if len(tokens) < 5:
            continue
        domain_tokens = sum(1 for t in tokens if _TLD_RE.search(t))
        ratio = domain_tokens / len(tokens)
        if ratio >= 0.5 and (best is None or ratio > best[2]):
            best = (key, s, ratio)
    return best


# ============ 数据模型 ============
@dataclass
class Finding:
    category: str  # static / stego / binary / decode
    severity: str  # info/low/medium/high/critical
    title: str
    desc: str
    location: str
    evidence: Optional[str] = None
    rule_id: Optional[str] = None
    metadata: dict = field(default_factory=dict)
    # 厂商报告扩展字段
    confidence: str = "unknown"  # low/medium/high
    attack_techniques: List[str] = field(default_factory=list)  # MITRE ATT&CK 技术 ID
    recommendation: str = ""  # 缓解建议
    verdict: str = ""  # 甄别结论:malicious / suspicious / benign / unverified


SEV_WEIGHT = {"info": 0, "low": 1, "medium": 2, "high": 3, "critical": 4}


# ============ 扫描器 ============
def scan_text_file(path: Path, findings: List[Finding]) -> None:
    """对文本文件做静态扫描 + 隐写检测。"""
    try:
        text = path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return
    if len(text.encode("utf-8", "ignore")) > MAX_FILE_BYTES:
        return

    lines = text.splitlines()
    for rule in RULES:
        try:
            rxs = [re.compile(p) for p in rule["patterns"]]
        except re.error:
            continue
        for i, line in enumerate(lines, 1):
            for rx in rxs:
                m = rx.search(line)
                if not m:
                    continue
                ev = line.strip()[:EVIDENCE_MAX]
                findings.append(Finding("static", rule["severity"], rule["name"], rule["desc"],
                                        f"{path}:{i}", ev, rule["id"], {"match": m.group(0)},
                                        rule.get("confidence", "unknown"),
                                        rule.get("attack", []),
                                        rule.get("recommendation", "")))
                break

    _stego_scan(text, path, findings)


def _stego_scan(text: str, path: Path, findings: List[Finding]) -> None:
    zw = extract_zero_width(text)
    if zw:
        dec = decode_zero_width(text)
        sev = "critical" if dec else "high"
        findings.append(Finding("stego", sev, f"发现 {len(zw)} 个零宽字符",
                                "零宽字符可承载二进制隐写", str(path),
                                dec or _snippet(text, zw[0][0]), None,
                                {"decoded": dec, "kind": "zero_width"},
                                "high" if dec else "medium",
                                ["T1027.010", "T1612.001"],
                                "零宽字符可编码任意二进制。若解码出明文,几乎确证隐写;否则需结合上下文判断(键盘 keycode 表会误报)。"))
    ctrl = detect_control_chars(text)
    if ctrl:
        findings.append(Finding("stego", "medium", f"发现 {len(ctrl)} 个可疑控制字符",
                                "不可见控制字符", str(path), _snippet(text, ctrl[0][0]),
                                None, {"kind": "control_char", "count": len(ctrl)},
                                "low", ["T1027.010"],
                                "控制字符有合法用途(终端格式),需结合上下文判断。"))
    tag_dec = decode_unicode_tags(text)
    if tag_dec is not None:
        findings.append(Finding("stego", "high" if not tag_dec else "critical",
                                "发现 Unicode 标签字符", "可编码 ASCII 文本", str(path),
                                tag_dec, None, {"decoded": tag_dec, "kind": "unicode_tag"},
                                "high" if tag_dec else "medium",
                                ["T1027.010", "T1612.001"],
                                "Unicode 标签字符(U+E0000-E007F)在日常文本中极少出现,出现即高度可疑。"))
    for idx, chunk, dec in detect_base64_chunks(text):
        findings.append(Finding("stego", "medium", "发现可解码 Base64 明文片段",
                                "文本中嵌入 Base64 编码", f"{path}@{idx}", dec,
                                None, {"chunk": chunk, "kind": "base64"},
                                "low", ["T1027"],
                                "Base64 有大量合法用途,需结合被编码内容判定。仅当明文含敏感字段时才视为恶意。"))


def scan_binary(path: Path, findings: List[Finding]) -> None:
    """对二进制跑 strings 提取,再关键词命中 + 双重解码。"""
    try:
        data = path.read_bytes()
    except OSError:
        return
    strings = re.findall(rb"[\x20-\x7e]{4,}", data)

    for rule in RULES:
        try:
            rxs = [re.compile(p) for p in rule["patterns"]]
        except re.error:
            continue
        hit_count = 0
        sample = None
        for s in strings:
            sd = s.decode("ascii", "ignore")
            for rx in rxs:
                if rx.search(sd):
                    hit_count += 1
                    if sample is None and len(sd) < 300:
                        sample = sd
                    break
        if hit_count:
            findings.append(Finding("binary", rule["severity"], rule["name"], rule["desc"],
                                    str(path), sample, rule["id"],
                                    {"hits": hit_count, "kind": "binary_strings"},
                                    rule.get("confidence", "unknown"),
                                    rule.get("attack", []),
                                    rule.get("recommendation", "")))

    _double_encode_scan(strings, path, findings)


def _double_encode_scan(strings: List[bytes], path: Path, findings: List[Finding]) -> None:
    """在二进制 strings 里找疑似双重编码的长 base64 串并暴力解码。"""
    seen = set()
    for s in strings:
        sd = s.decode("ascii", "ignore")
        for m in re.finditer(r"[A-Za-z0-9+/]{60,}={0,2}", sd):
            chunk = m.group(0)
            if chunk in seen:
                continue
            seen.add(chunk)
            res = try_double_decode(chunk)
            if not res:
                continue
            key, dec, ratio = res
            findings.append(Finding("decode", "critical",
                                    "发现双重编码隐藏字符串(base64+XOR)",
                                    f"XOR key=0x{key:02x},域名 token 比例 {ratio:.0%},解出 {len(dec)} 字符",
                                    str(path), dec[:500], "CC-ENCODE-002",
                                    {"xor_key": f"0x{key:02x}", "domain_ratio": round(ratio, 2),
                                     "decoded_len": len(dec), "kind": "double_encode"},
                                    "high",
                                    ["T1027.010", "T1612.001"],
                                    "双重编码是规避静态分析的典型手法。若解码出域名/IP 列表,几乎确证为黑名单。建议记录解码明文,作为后续检测的 IOC。"))


def is_binary(path: Path) -> bool:
    try:
        chunk = path.read_bytes()[:4096]
    except OSError:
        return False
    if b"\x00" in chunk:
        return True
    text_chars = bytes(range(32, 127)) + b"\n\r\t\f\b"
    nontext = sum(1 for b in chunk if b not in text_chars)
    return len(chunk) > 0 and nontext / len(chunk) > 0.30


def iter_files(root: Path) -> List[Path]:
    if root.is_file():
        return [root]
    out = []
    for p in root.rglob("*"):
        if not p.is_file():
            continue
        parts = {x.lower() for x in p.parts}
        if {".git", "__pycache__", ".venv"} & parts:
            continue
        out.append(p)
    return out


def scan(path: Path, strings_only: bool = False) -> List[Finding]:
    findings: List[Finding] = []
    if path.is_file():
        if is_binary(path):
            scan_binary(path, findings)
        elif not strings_only:
            scan_text_file(path, findings)
        return findings
    for f in iter_files(path):
        if is_binary(f):
            scan_binary(f, findings)
        elif not strings_only and f.suffix.lower() in SCANNABLE_EXT:
            scan_text_file(f, findings)
    return findings


# ============ 报告 ============
def print_console(findings: List[Finding], target: str) -> int:
    findings.sort(key=lambda f: -SEV_WEIGHT.get(f.severity, 0))
    counts = {s: 0 for s in SEV_WEIGHT}
    for f in findings:
        counts[f.severity] += 1
    print(f"\nAI Agent 隐蔽信道扫描报告")
    print(f"  目标: {target}")
    print(f"  严重级别: " + " ".join(f"{k}={v}" for k, v in counts.items() if v))
    print(f"  共 {len(findings)} 条命中:")
    for i, f in enumerate(findings, 1):
        print(f"  {i}. [{f.severity.upper():8s}] {f.title}")
        print(f"     位置: {f.location}  规则: {f.rule_id or '-'}  类别: {f.category}")
        if f.evidence:
            ev = f.evidence if len(f.evidence) <= 120 else f.evidence[:120] + "..."
            print(f"     证据: {ev}")
    if not findings:
        print("  未发现隐蔽信道相关行为。")
    return (2 if counts["critical"] > 0 else
            1 if counts["high"] > 0 else 0)


def to_json(findings: List[Finding], target: str, path: Optional[Path] = None) -> str:
    findings.sort(key=lambda f: -SEV_WEIGHT.get(f.severity, 0))
    data = {
        "target": target,
        "scan_time": time.strftime("%Y-%m-%d %H:%M:%S %z"),
        "summary": {s: sum(1 for f in findings if f.severity == s) for s in SEV_WEIGHT},
        "iocs": _extract_iocs(findings),
        "findings": [{
            "category": f.category, "severity": f.severity, "title": f.title,
            "description": f.desc, "location": f.location, "evidence": f.evidence,
            "rule_id": f.rule_id, "metadata": f.metadata,
            "confidence": f.confidence,
            "attack_techniques": f.attack_techniques,
            "recommendation": f.recommendation,
            "verdict": f.verdict,
        } for f in findings],
    }
    text = json.dumps(data, indent=2, ensure_ascii=False)
    if path:
        path.write_text(text, encoding="utf-8")
    return text


# ============ IOC 提取 / YARA 生成 ============
# 真实 TLD 白名单,避免把 buffer.from / this.auth / import.meta.main 误判为域名
_REAL_TLDS = {
    "com", "cn", "net", "org", "io", "ai", "top", "xyz", "run", "cloud",
    "co", "info", "biz", "me", "tv", "cc", "uk", "us", "jp", "kr", "de",
    "fr", "ca", "au", "ru", "br", "in", "it", "es", "nl", "se", "no",
    "ch", "at", "be", "dk", "fi", "pt", "gr", "ie", "pl", "cz", "hu",
    "ro", "bg", "hr", "sk", "si", "lt", "lv", "ee", "cy", "lu", "mt",
    "is", "li", "mc", "sm", "va", "ad", "tr", "il", "sa", "ae", "qa",
    "kw", "bh", "om", "ye", "ir", "iq", "jo", "lb", "sy", "eg", "ly",
    "tn", "dz", "ma", "sd", "sg", "hk", "tw", "th", "my", "id", "ph",
    "vn", "la", "kh", "mm", "bd", "lk", "np", "pk", "af", "mn", "kz",
    "uz", "tm", "kg", "tj", "am", "az", "ge", "md", "ua", "by", "rs",
    "mk", "al", "ba", "me", "xk",
}
_DOMAIN_RE = re.compile(r"\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+([a-z]{2,})\b", re.I)
_IP_RE = re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b")
_XOR_KEY_RE = re.compile(r"XOR key=0x([0-9a-fA-F]{2})")
# 代码片段误报黑名单(不会出现在真实域名里的代码 token)
_CODE_TOKENS = {"buffer.from", "this.auth", "import.meta.main", "date.now",
                "string.fromcharcode", "process.platform", "process.arch"}


def _extract_iocs(findings: List[Finding]) -> dict:
    """从命中证据中提取 IOC(域名/IP/双重编码 key)。"""
    domains, ips, xor_keys = set(), set(), set()
    for f in findings:
        blob = (f.evidence or "") + " " + f.desc
        for m in _DOMAIN_RE.finditer(blob):
            d = m.group(0)
            tld = m.group(1).lower()
            # 排除:非真实 TLD / 代码片段 / timezone 数据库
            if tld not in _REAL_TLDS:
                continue
            if d.lower() in {"asia.shanghai", "asia.urumqi"}:
                continue
            if d.lower() in _CODE_TOKENS:
                continue
            domains.add(d.lower())
        for ip in _IP_RE.findall(blob):
            ips.add(ip)
        m = _XOR_KEY_RE.search(f.desc or "")
        if m:
            xor_keys.add("0x" + m.group(1).lower())
    return {
        "domains": sorted(domains),
        "ips": sorted(ips),
        "xor_keys": sorted(xor_keys),
        "rule_ids": sorted({f.rule_id for f in findings if f.rule_id}),
    }


def _gen_yara(findings: List[Finding]) -> str:
    """基于命中规则生成 YARA-lite 检测规则。
    特征字符串优先级:RULES patterns 的字面量 > evidence 首行 > title。"""
    # 建立 rule_id → patterns 字面量映射
    rid_to_patterns = {}
    for rule in RULES:
        rid = rule.get("id")
        if rid:
            # 从 pattern 里提取字面量字符串(去转义)
            literals = []
            for p in rule["patterns"]:
                # 简单提取引号里的内容
                for m in re.findall(r"['\"]([^'\"]{3,60})['\"]", p):
                    if m and not any(c in m for c in "\\^$.|?*+()[]{}"):
                        literals.append(m)
            rid_to_patterns[rid] = literals

    rules_seen = set()
    lines = ["/*", " * YARA-lite 检测规则(由 secscan 自动生成)",
             " * 基于 Claude Code 隐蔽信道事件特征库", " */", ""]
    for f in findings:
        if not f.rule_id or f.rule_id in rules_seen:
            continue
        rules_seen.add(f.rule_id)
        rule_name = f.rule_id.lower().replace("-", "_")
        # 选特征字符串:优先用 patterns 字面量,其次 evidence 首行
        candidates = rid_to_patterns.get(f.rule_id, [])
        # 过滤太短或太宽泛的
        candidates = [c for c in candidates if len(c) >= 4 and c not in {"CN", "PRC", "CTT"}]
        if candidates:
            token = candidates[0]
        else:
            ev = (f.evidence or "").strip()
            token = ev.split("\n")[0][:60] if ev else f.title
        token_clean = token.replace('"', '\\"').replace("\\", "\\\\")
        lines.append(f"rule {rule_name} {{")
        lines.append(f"    meta:")
        lines.append(f"        description = \"{f.title}\"")
        lines.append(f"        severity = \"{f.severity}\"")
        lines.append(f"        rule_id = \"{f.rule_id}\"")
        lines.append(f"    strings:")
        lines.append(f"        $a = \"{token_clean}\" nocase")
        lines.append(f"    condition:")
        lines.append(f"        $a")
        lines.append("}")
        lines.append("")
    return "\n".join(lines)


# MITRE ATT&CK 技术 ID → 名称映射(本工具涉及的子技术)
ATTACK_MAP = {
    "T1082": "System Information Discovery",
    "T1612.001": "Build Image on Host: Container and Resource Discovery",
    "T1027": "Obfuscated Files or Information",
    "T1027.010": "Command Obfuscation",
    "T1041": "Exfiltration Over C2 Channel",
}


def _verdict_emoji(v: str) -> str:
    return {"malicious": "🔴", "suspicious": "🟠", "benign": "🟢",
            "unverified": "⚪"}.get(v, "⚪")


def _risk_level(findings: List[Finding]) -> Tuple[str, str]:
    """综合判定风险等级和一句话结论。"""
    n_crit = sum(1 for f in findings if f.severity == "critical")
    n_high = sum(1 for f in findings if f.severity == "high")
    if n_crit >= 2:
        return "CRITICAL", f"确认存在隐蔽信道,发现 {n_crit} 条 CRITICAL 级命中,构成完整证据链,建议立即停用并排查。"
    if n_crit == 1:
        return "HIGH", f"高度可疑,发现 {n_crit} 条 CRITICAL 级命中,需人工复核上下文确认。"
    if n_high >= 2:
        return "MEDIUM", f"存在 {n_high} 条 HIGH 级命中,需结合上下文甄别是否为隐蔽信道。"
    if n_high == 1:
        return "LOW", f"发现 {n_high} 条 HIGH 级命中,可能为误报,建议人工复核。"
    return "INFO", "未发现高危隐蔽信道行为。"


def to_markdown(findings: List[Finding], target: str, path: Optional[Path] = None) -> str:
    findings.sort(key=lambda f: -SEV_WEIGHT.get(f.severity, 0))
    now = time.strftime("%Y-%m-%d %H:%M:%S %z")
    risk, conclusion = _risk_level(findings)
    counts = {s: sum(1 for f in findings if f.severity == s) for s in SEV_WEIGHT}
    iocs = _extract_iocs(findings)
    # 按规则去重,用于 ATT&CK 映射表
    techniques: dict = {}
    for f in findings:
        for t in f.attack_techniques:
            techniques.setdefault(t, []).append(f.rule_id or f.title)
    # 客户端类型推断
    tlow = target.lower()
    client = ("Claude Code" if "claude" in tlow else
              "Cursor" if "cursor" in tlow else
              "Cline" if "cline" in tlow else
              "Continue" if "continue" in tlow else "未知/通用")

    L = []
    # ========== 封面 ==========
    L.append("# AI Agent 客户端隐蔽信道审计报告")
    L.append("")
    L.append(f"> **报告生成时间**: {now}  ")
    L.append(f"> **扫描工具**: secscan (aiagent-covert-channel-scan skill)  ")
    L.append(f"> **目标客户端**: {client}")
    L.append("")
    L.append("---")
    L.append("")

    # ========== 1. 执行摘要 ==========
    L.append("## 1. 执行摘要 (Executive Summary)")
    L.append("")
    L.append(f"本次审计对 `{target}` 执行静态代码扫描、提示词隐写检测、二进制 strings 分析及 base64+XOR 双重解码,共发现 **{len(findings)}** 条命中。")
    L.append("")
    L.append(f"- **综合风险等级**: **{risk}**")
    L.append(f"- **一句话结论**: {conclusion}")
    L.append(f"- **命中分布**: CRITICAL={counts['critical']}  HIGH={counts['high']}  MEDIUM={counts['medium']}  LOW={counts['low']}  INFO={counts['info']}")
    L.append(f"- **扫描目标**: `{target}`")
    L.append(f"- **客户端类型**: {client}")
    L.append("")
    if risk in ("CRITICAL", "HIGH"):
        L.append("> ⚠️ **风险提示**: 本客户端疑似存在隐蔽信道,可能在用户不知情的情况下把时区/代理/主机指纹等敏感信息编码进系统提示词回传服务器,用于区域识别或全链路封号。建议立即评估影响范围。")
        L.append("")

    # ========== 2. 攻击链还原 ==========
    L.append("## 2. 攻击链还原 (Kill Chain)")
    L.append("")
    L.append("基于命中规则,还原疑似攻击链(参照 Claude Code 2.1.197 事件):")
    L.append("")
    L.append("```")
    L.append("① 采集  →  读取本地时区 / 代理环境变量 / 主机指纹")
    L.append("           (CC-TZ-001, CC-PROXY-001, CC-HOST-001)")
    L.append("② 判定  →  时区命中 Asia/Shanghai 或 Asia/Urumqi → cnTZ=true")
    L.append("           域名命中黑名单 → known=true")
    L.append("           关键词命中 → labKw=true")
    L.append("           (CC-REGION-001, CC-REGION-002, CC-ENCODE-002)")
    L.append("③ 编码  →  cnTZ ? e.replaceAll(\"-\",\"/\") : e")
    L.append("           把中国标记编码进系统提示词日期分隔符")
    L.append("           (CC-STEGO-002)")
    L.append("④ 回传  →  随每个 API 请求的系统提示词回传服务器")
    L.append("           (CC-NET-001)")
    L.append("```")
    L.append("")

    # ========== 3. MITRE ATT&CK 映射 ==========
    L.append("## 3. MITRE ATT&CK 映射")
    L.append("")
    if not techniques:
        L.append("无 ATT&CK 技术命中。")
    else:
        L.append("| 技术 ID | 技术名称 | 关联规则 |")
        L.append("|---------|---------|---------|")
        for tid in sorted(techniques):
            name = ATTACK_MAP.get(tid, "未知")
            rids = ", ".join(sorted(set(techniques[tid])))
            L.append(f"| `{tid}` | {name} | {rids} |")
    L.append("")

    # ========== 4. 详细技术分析 ==========
    L.append("## 4. 详细技术分析 (Technical Analysis)")
    L.append("")
    if not findings:
        L.append("未发现隐蔽信道相关行为。")
    else:
        for i, f in enumerate(findings, 1):
            L.append(f"### 4.{i} {_verdict_emoji(f.verdict)} [{f.severity.upper()}] {f.title}")
            L.append("")
            L.append(f"| 字段 | 值 |")
            L.append(f"|------|-----|")
            L.append(f"| 规则 ID | `{f.rule_id or '-'}` |")
            L.append(f"| 类别 | {f.category} |")
            L.append(f"| 严重级别 | {f.severity} |")
            L.append(f"| 可信度 | {f.confidence} |")
            L.append(f"| 甄别结论 | {f.verdict or '未甄别'} |")
            if f.attack_techniques:
                L.append(f"| ATT&CK | {', '.join(f'`{t}`' for t in f.attack_techniques)} |")
            L.append(f"| 位置 | `{f.location}` |")
            L.append("")
            L.append(f"**描述**: {f.desc}")
            L.append("")
            if f.evidence:
                L.append("**证据片段**:")
                L.append("```")
                L.append(f.evidence[:500])
                L.append("```")
                L.append("")
            if f.recommendation:
                L.append(f"**缓解建议**: {f.recommendation}")
                L.append("")

    # ========== 5. IOC 清单 ==========
    L.append("## 5. 威胁指标 (IOCs)")
    L.append("")
    L.append(f"- **命中的规则 ID**: {', '.join(f'`{r}`' for r in iocs['rule_ids']) or '无'}")
    if iocs["xor_keys"]:
        L.append(f"- **双重编码 XOR key**: {', '.join(f'`{k}`' for k in iocs['xor_keys'])}")
    if iocs["ips"]:
        L.append(f"- **IP 地址** ({len(iocs['ips'])}):")
        for ip in iocs["ips"][:20]:
            L.append(f"  - `{ip}`")
    if iocs["domains"]:
        L.append(f"- **域名** ({len(iocs['domains'])}):")
        for d in iocs["domains"][:50]:
            L.append(f"  - `{d}`")
        if len(iocs["domains"]) > 50:
            L.append(f"  - ... 共 {len(iocs['domains'])} 个,完整列表见 JSON 报告")
    if not (iocs["domains"] or iocs["ips"] or iocs["xor_keys"]):
        L.append("- 无可提取的 IOC(命中均为代码模式,非具体指标)。")
    L.append("")

    # ========== 6. 检测建议(YARA) ==========
    L.append("## 6. 检测建议 (Detection Rules)")
    L.append("")
    L.append("以下 YARA-lite 规则可集成到 EDR / 文件审计流水线,用于检测同类隐蔽信道:")
    L.append("")
    L.append("```yara")
    L.append(_gen_yara(findings).rstrip())
    L.append("```")
    L.append("")

    # ========== 7. 缓解措施 ==========
    L.append("## 7. 缓解措施 (Mitigations)")
    L.append("")
    L.append("按优先级排序的缓解措施:")
    L.append("")
    L.append("1. **立即(短期)**")
    L.append("   - 在敏感项目/企业环境中停用该客户端,改用开源可控的 AI 编码方案")
    L.append("   - 用 mitmproxy / Charles 抓包,审查出站请求的系统提示词是否包含日期分隔符编码(`/` vs `-`)")
    L.append("   - 检查 `~/.claude/` 下 telemetry / sessions 是否已回传敏感信息")
    L.append("2. **加固(中期)**")
    L.append("   - 容器化运行客户端,固定时区(如 `TZ=UTC`)、统一 hostname、固定代理环境变量,消除指纹差异")
    L.append("   - 在出站代理层正则化系统提示词(强制日期格式为 ISO 8601 `YYYY-MM-DD`)")
    L.append("   - 网络层限制客户端只能访问必要的 API 域名,拦截非必要外联")
    L.append("3. **持续(长期)**")
    L.append("   - 每次客户端升级后重新跑本工具扫描,对比新旧版本的命中差异")
    L.append("   - 关注官方安全公告和社区逆向分析,更新本 skill 的特征库")
    L.append("   - 推动采用开源审计过的 AI 编码客户端(如 Continue / Cline 的开源版本)")
    L.append("")

    # ========== 8. 附录 ==========
    L.append("## 8. 附录")
    L.append("")
    L.append("### 8.1 扫描元信息")
    L.append(f"- 扫描时间: {now}")
    L.append(f"- 扫描目标: `{target}`")
    L.append(f"- 命中总数: {len(findings)}")
    L.append(f"- 客户端类型: {client}")
    L.append(f"- 工具版本: aiagent-covert-channel-scan skill v1.0")
    L.append("")
    L.append("### 8.2 严重级别定义")
    L.append("- **CRITICAL** — 中国时区判定 / cnTZ 标记变量 / 系统提示词分隔符编码 / 双重编码黑名单 → 几乎确证隐蔽信道")
    L.append("- **HIGH** — 代理读取 / 主机指纹采集 / 零宽字符 / 外部回传 → 需结合上下文判断")
    L.append("- **MEDIUM** — 时区读取 / base64 编码 / 控制字符 → 多数有合法用途,仅提示")
    L.append("- **LOW/INFO** — 极低风险,通常为信息性记录")
    L.append("")
    L.append("### 8.3 甄别结论定义")
    L.append("- 🔴 **malicious** — 经上下文甄别,确认为恶意行为")
    L.append("- 🟠 **suspicious** — 存在可疑特征,需进一步验证")
    L.append("- 🟢 **benign** — 经甄别为误报(如 Rust 编译器错误信息、标准 Basic Auth)")
    L.append("- ⚪ **unverified** — 未做人工甄别,需结合上下文判断")
    L.append("")
    L.append("### 8.4 参考资源")
    L.append("- MITRE ATT&CK: https://attack.mitre.org/")
    L.append("- Claude Code 隐蔽信道事件(2026-07):社区逆向分析报告")
    L.append("- 本 skill 特征库基于 Claude Code 2.1.197 实战样本提取")
    L.append("")
    L.append("---")
    L.append(f"*报告由 secscan 自动生成,甄别结论需人工复核。*")

    text = "\n".join(L)
    if path:
        path.write_text(text, encoding="utf-8")
    return text


def _client_tag(path: Path) -> str:
    """从路径推断客户端类型标签,用于报告文件名。"""
    s = str(path).lower()
    if "claude" in s: return "claude_code"
    if "cursor" in s: return "cursor"
    if "cline" in s: return "cline"
    if "continue" in s: return "continue"
    return "agent"


def main() -> int:
    ap = argparse.ArgumentParser(description="AI Agent 客户端隐蔽信道扫描器")
    ap.add_argument("path", type=Path, help="扫描目标(文件/目录/二进制)")
    ap.add_argument("-f", "--format", choices=["console", "json", "markdown"], default="console")
    ap.add_argument("-o", "--output", type=Path, help="报告输出文件;不指定则输出到控制台")
    ap.add_argument("--save", action="store_true",
                    help="存到 OS 标准报告目录(macOS: ~/Library/Application Support/secscan/reports/ 等)")
    ap.add_argument("--strings-only", action="store_true", help="仅对二进制做 strings 扫描")
    args = ap.parse_args()

    if not args.path.exists():
        print(f"路径不存在: {args.path}", file=sys.stderr)
        return 2

    # --save 时自动生成带时间戳的文件名,存到默认目录
    output = args.output
    if args.save:
        try:
            d = default_report_dir()
        except (OSError, PermissionError) as e:
            print(f"⚠ 无法创建报告目录({e}),改为输出到控制台。请用 -o <路径> 指定。", file=sys.stderr)
            args.save = False
        else:
            ext = "md" if args.format in ("console", "markdown") else "json"
            # console 格式落盘用 markdown(更可读)
            fmt_for_save = "markdown" if args.format == "console" else args.format
            ts = time.strftime("%Y%m%d_%H%M%S")
            tag = _client_tag(args.path)
            output = d / f"{ts}_{tag}.{ext}"
            args.format = fmt_for_save
    elif args.output and args.format == "console":
        # 显式 -o 但格式是 console,落盘用 markdown
        args.format = "markdown"

    target = str(args.path)
    findings = scan(args.path, strings_only=args.strings_only)

    if args.format == "json":
        text = to_json(findings, target, output)
    elif args.format == "markdown":
        text = to_markdown(findings, target, output)
    else:
        # console 格式:有 output 时也生成 markdown 落盘,同时控制台打印 console 摘要
        if output:
            to_markdown(findings, target, output)
        return print_console(findings, target)
    # 落盘后也打印报告内容到控制台(便于 AI 在聊天框展示)
    if output:
        print(f"报告已写入: {output}\n")
    print(text)
    # 每次运行后清理过期报告(仅清理默认目录)
    deleted = cleanup_old_reports(30)
    if deleted:
        print(f"\n(已自动清理 {deleted} 份 30 天前的旧报告)", file=sys.stderr)
    return (2 if any(f.severity == "critical" for f in findings) else
            1 if any(f.severity == "high" for f in findings) else 0)


if __name__ == "__main__":
    sys.exit(main())
