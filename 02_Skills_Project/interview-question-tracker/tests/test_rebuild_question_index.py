from __future__ import annotations

import importlib.util
from pathlib import Path


SCRIPT = Path(__file__).parents[1] / "scripts" / "rebuild_question_index.py"
SPEC = importlib.util.spec_from_file_location("rebuild_question_index", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def test_extract_questions_preserves_numbers_and_ignores_comments() -> None:
    text = """# 面试问题集

## 一、Python
**Q1: 第一个问题？** `2026-08-05`
<!-- **Q2: 示例问题？** -->
**Q3: 第三个问题** `2026-08-05`

## 二、操作系统
### Q2. 进程和线程有什么区别？
"""

    assert MODULE.extract_questions(text) == [
        ("一、Python", [(1, "第一个问题？"), (3, "第三个问题？")]),
        ("二、操作系统", [(2, "进程和线程有什么区别？")]),
    ]


def test_replace_index_is_idempotent() -> None:
    text = """# 面试问题集

## 一、Python
**Q1: 什么是生成器？** `2026-08-05`
"""
    categories = MODULE.extract_questions(text)
    block = MODULE.render_index(categories, "2026-08-05")

    updated = MODULE.replace_index(text, block)

    assert updated.count(MODULE.START) == 1
    assert updated.count(MODULE.END) == 1
    assert "| Python | 1 |" in updated
    assert MODULE.replace_index(updated, block) == updated
