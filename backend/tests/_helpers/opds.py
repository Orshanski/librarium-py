"""Проверка ответов OPDS официальными JSON-схемами и получение токена каталога.

Схемы лежат в tests/fixtures/opds_schemas по адресам своих `$id` — тесты
работают без сети. Форматы (`uri`, `date-time`) строго не проверяются.
Именованные группы в шаблонах схем записаны по правилам JavaScript (`(?<имя>`),
при загрузке они переводятся в запись Python (`(?P<имя>`).
"""
import json
import re
from pathlib import Path

from jsonschema import Draft7Validator
from referencing import Registry, Resource
from referencing.jsonschema import DRAFT7

FEED_TYPE = "application/opds+json"
AUTH_TYPE = "application/opds-authentication+json"

_SCHEMAS_DIR = Path(__file__).resolve().parent.parent / "fixtures" / "opds_schemas"


def _build_registry() -> Registry:
    resources = []
    for path in _SCHEMAS_DIR.rglob("*.json"):
        text = re.sub(r"\(\?<(?![=!])", "(?P<", path.read_text(encoding="utf-8"))
        contents = json.loads(text)
        resources.append((contents["$id"], Resource.from_contents(contents, default_specification=DRAFT7)))
    return Registry().with_resources(resources)


_REGISTRY = _build_registry()


def _validator(schema_id: str) -> Draft7Validator:
    schema = _REGISTRY.contents(schema_id)
    return Draft7Validator(schema, registry=_REGISTRY)


_FEED = _validator("https://specs.opds.io/schema/feed.schema.json")
_AUTH = _validator("https://drafts.opds.io/schema/authentication.schema.json")


def _assert_valid(validator: Draft7Validator, data: dict) -> None:
    errors = sorted(validator.iter_errors(data), key=lambda e: list(e.absolute_path))
    assert not errors, "\n".join(
        f"{list(e.absolute_path)}: {e.message}" for e in errors
    )


def assert_valid_feed(data: dict) -> None:
    _assert_valid(_FEED, data)


def assert_valid_auth_document(data: dict) -> None:
    _assert_valid(_AUTH, data)


def opds_token(client, username: str = "reader", password: str = "reader123") -> str:
    resp = client.post(
        "/opds/token",
        data={"grant_type": "password", "username": username, "password": password},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}
