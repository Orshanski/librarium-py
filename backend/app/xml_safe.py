"""Safe XML parsing helpers — отключают XXE и сетевые ресурсы.

lxml по умолчанию разрешает entity expansion, загрузку внешних DTD и сетевые
запросы из XML. Для user-uploaded файлов (FB2, EPUB OPF, EPUB container.xml)
это даёт XXE-атаку: чтение /etc/passwd через file:// entity, billion laughs
DoS, сетевые запросы во внутренние ресурсы через external DTD.

Используем эти хелперы вместо прямых etree.parse / etree.fromstring везде,
где парсим bytes/файл от пользователя.
"""
from pathlib import Path
from typing import Union

from lxml import etree


def _make_parser() -> etree.XMLParser:
    return etree.XMLParser(
        resolve_entities=False,
        no_network=True,
        load_dtd=False,
        dtd_validation=False,
    )


def parse(source: Union[str, Path]) -> etree._ElementTree:
    return etree.parse(str(source), parser=_make_parser())


def fromstring(text: Union[bytes, str]) -> etree._Element:
    return etree.fromstring(text, parser=_make_parser())
