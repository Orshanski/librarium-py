"""Loader для shared sort-конфига (config/sort.json в репо root)."""
import json
from pathlib import Path

_CONFIG_PATH = Path(__file__).parent.parent.parent.parent / "config" / "sort.json"

with _CONFIG_PATH.open("r", encoding="utf-8") as _f:
    SORT_CONFIG: dict = json.load(_f)
