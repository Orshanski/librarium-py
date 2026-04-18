"""Architecture tests — migrated роутеры не содержат inline HTTPException
(кроме metadata.py:101 dynamic forward и admin.py:169 SMTP broad, которые
documented inline per Non-goals спеки).

После каждой T6-T15 таски проверяется что конкретный router — clean.
Это регрессионная защита: случайное возвращение `raise HTTPException` в
любой из этих файлов сразу провалит architecture test.
"""
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent
ROUTERS_DIR = BACKEND_ROOT / "app" / "routers"
APP_DIR = BACKEND_ROOT / "app"


def _has_no_http_exception(path: Path) -> bool:
    """Проверяет что файл не содержит `raise HTTPException` — именно raise-site,
    а не импорт или строковое упоминание в docstring/comment.

    `raise HTTPException(...)` — inline mapping паттерн, который мы мигрируем.
    Файл может импортировать HTTPException (например, admin.py всё ещё имеет
    его для SMTP handler'а), но не должен raise-ить из migrated endpoint'ов.
    """
    source = path.read_text(encoding="utf-8")
    return "raise HTTPException" not in source


def _has_no_direct_dal_import(path: Path) -> bool:
    """Проверяет что router не импортирует DAL напрямую — весь доступ к данным
    должен идти через service-слой."""
    source = path.read_text(encoding="utf-8")
    return "from ..dal" not in source


class TestCleanRouters:
    """Migrated routers (ноль HTTPException import или raise)."""

    def test_shelves_py_clean(self):
        assert _has_no_http_exception(ROUTERS_DIR / "shelves.py")

    def test_tags_py_clean(self):
        assert _has_no_http_exception(ROUTERS_DIR / "tags.py")

    def test_authors_py_clean(self):
        assert _has_no_http_exception(ROUTERS_DIR / "authors.py")

    def test_series_py_clean(self):
        assert _has_no_http_exception(ROUTERS_DIR / "series.py")

    def test_entity_crud_py_clean(self):
        assert _has_no_http_exception(ROUTERS_DIR / "_entity_crud.py")

    def test_books_py_clean(self):
        assert _has_no_http_exception(ROUTERS_DIR / "books.py")

    def test_upload_py_clean(self):
        assert _has_no_http_exception(ROUTERS_DIR / "upload.py")

    def test_covers_py_clean(self):
        assert _has_no_http_exception(ROUTERS_DIR / "covers.py")

    def test_download_py_clean(self):
        assert _has_no_http_exception(ROUTERS_DIR / "download.py")

    def test_similar_py_clean(self):
        assert _has_no_http_exception(ROUTERS_DIR / "similar.py")

    def test_auth_router_clean(self):
        assert _has_no_http_exception(ROUTERS_DIR / "auth.py")

    def test_auth_dependency_module_clean(self):
        """backend/app/auth.py (dependency для get_current_user/require_admin).
        Не router, но часть request-handling chain — должен быть clean."""
        assert _has_no_http_exception(APP_DIR / "auth.py")


class TestServiceLayerDiscipline:
    """Router → service → DAL: router не импортирует DAL напрямую."""

    def test_authors_router_uses_only_service(self):
        assert _has_no_direct_dal_import(ROUTERS_DIR / "authors.py")

    def test_series_router_uses_only_service(self):
        assert _has_no_direct_dal_import(ROUTERS_DIR / "series.py")

    def test_filter_options_router_uses_only_service(self):
        assert _has_no_direct_dal_import(ROUTERS_DIR / "filter_options.py")


class TestValidatorsCentralized:
    """Reusable Pydantic validators вынесены в _validators.py — роутеры
    используют именованные aliases, не определяют constraints inline."""

    def test_upload_uses_tempid_alias(self):
        source = (ROUTERS_DIR / "upload.py").read_text(encoding="utf-8")
        assert "from ._validators import" in source and "TempIdStr" in source
        assert "StringConstraints" not in source, (
            "upload.py использует StringConstraints напрямую — должно быть через _validators.py"
        )

    def test_covers_uses_tempid_alias(self):
        source = (ROUTERS_DIR / "covers.py").read_text(encoding="utf-8")
        assert "from ._validators import" in source and "TempIdStr" in source
        assert "StringConstraints" not in source

    def test_books_uses_nonblank_alias(self):
        source = (ROUTERS_DIR / "books.py").read_text(encoding="utf-8")
        assert "from ._validators import" in source and "NonBlankStr" in source
        assert "StringConstraints" not in source


class TestPartiallyCleanRouters:
    """Routers с одним documented inline HTTPException (остальные — middleware).

    Per Non-goals спеки:
      - admin.py:169 SMTP broad exception — остаётся inline.
      - metadata.py:101 dynamic forward — остаётся inline.
    """

    def test_admin_has_only_smtp_exception(self):
        """admin.py содержит ровно 1 'raise HTTPException' (SMTP test endpoint)."""
        source = (ROUTERS_DIR / "admin.py").read_text(encoding="utf-8")
        count = source.count("raise HTTPException")
        assert count == 1, f"Expected 1 HTTPException (SMTP), got {count}"

    def test_metadata_has_only_dynamic_forward(self):
        """metadata.py содержит ровно 1 'raise HTTPException' — line 67
        dynamic upstream status forward. Остальные 9 → custom exceptions."""
        source = (ROUTERS_DIR / "metadata.py").read_text(encoding="utf-8")
        count = source.count("raise HTTPException")
        assert count == 1, f"Expected 1 HTTPException (dynamic forward), got {count}"
