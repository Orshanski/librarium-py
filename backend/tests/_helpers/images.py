"""Тестовые картинки."""
from io import BytesIO

from PIL import Image


def make_jpeg(width: int = 20, height: int = 20, color="red") -> bytes:
    """Одноцветная JPEG-картинка заданного размера, байтами."""
    buf = BytesIO()
    Image.new("RGB", (width, height), color).save(buf, format="JPEG")
    return buf.getvalue()
