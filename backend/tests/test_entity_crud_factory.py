"""Architecture-level тесты для _entity_crud factory migration (T8).

Проверяют что после миграции:
- authors.py / series.py не импортируют E3 helpers (require_exists, guard_self_merge, raise_delete_error).
- Factory register_entity_crud принимает kwarg `service`, не `dal`.
- Factory не принимает detail-kwargs (они теперь в service-функциях).
"""
import inspect
from pathlib import Path

from app.routers import _entity_crud
from app.routers._entity_crud import register_entity_crud


BACKEND_ROOT = Path(__file__).resolve().parent.parent
ROUTERS_DIR = BACKEND_ROOT / "app" / "routers"


class TestAuthorsRouterIsClean:
    def test_no_helpers_import(self):
        source = (ROUTERS_DIR / "authors.py").read_text(encoding="utf-8")
        assert "from ._helpers" not in source
        assert "require_exists" not in source
        assert "guard_self_merge" not in source
        assert "raise_delete_error" not in source

    def test_no_http_exception(self):
        source = (ROUTERS_DIR / "authors.py").read_text(encoding="utf-8")
        assert "HTTPException" not in source


class TestSeriesRouterIsClean:
    def test_no_helpers_import(self):
        source = (ROUTERS_DIR / "series.py").read_text(encoding="utf-8")
        assert "from ._helpers" not in source
        assert "require_exists" not in source
        assert "guard_self_merge" not in source
        assert "raise_delete_error" not in source

    def test_no_http_exception(self):
        source = (ROUTERS_DIR / "series.py").read_text(encoding="utf-8")
        assert "HTTPException" not in source


class TestFactorySignature:
    def test_factory_accepts_service_kwarg(self):
        sig = inspect.signature(register_entity_crud)
        assert "service" in sig.parameters

    def test_factory_does_not_accept_dal_kwarg(self):
        sig = inspect.signature(register_entity_crud)
        assert "dal" not in sig.parameters

    def test_factory_does_not_accept_detail_kwargs(self):
        """Detail-строки теперь живут в service functions, не factory."""
        sig = inspect.signature(register_entity_crud)
        assert "detail_not_found" not in sig.parameters
        assert "detail_has_books" not in sig.parameters
        assert "detail_self_merge" not in sig.parameters

    def test_factory_does_not_import_helpers(self):
        source = inspect.getsource(_entity_crud)
        assert "from ._helpers" not in source
        assert "require_exists" not in source
        assert "guard_self_merge" not in source
        assert "raise_delete_error" not in source
