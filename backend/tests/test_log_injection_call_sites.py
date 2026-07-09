import asyncio
import logging
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from app import main
from app.enrichers import cover_fetcher, pdf_llm


def _assert_single_physical_line(message: str) -> None:
    assert "\n" not in message
    assert "\r" not in message
    assert len(message.splitlines()) == 1


def test_entity_rename_escapes_crlf_in_name(admin_client, caplog):
    malicious_name = "Renamed Author\nFORGED warning\rFORGED error"

    with caplog.at_level(logging.INFO, logger="librarium.authors"):
        response = admin_client.put("/api/authors/1", json={"name": malicious_name})

    assert response.status_code == 200
    message = next(record.getMessage() for record in caplog.records if record.name == "librarium.authors")
    assert "Renamed Author\\nFORGED warning\\rFORGED error" in message
    _assert_single_physical_line(message)


def test_unhandled_exception_log_escapes_request_error_and_traceback(caplog):
    request = SimpleNamespace(
        method="GET\rFORGED method",
        url=SimpleNamespace(path="/books\nFORGED path"),
    )

    with caplog.at_level(logging.ERROR, logger="librarium"):
        try:
            raise ValueError("bad upstream\nFORGED error\rbad tail")
        except ValueError as exc:
            response = asyncio.run(main.unhandled_exception_handler(request, exc))

    assert response.status_code == 500
    message = next(record.getMessage() for record in caplog.records if record.name == "librarium")
    assert "GET\\rFORGED method" in message
    assert "/books\\nFORGED path" in message
    assert "bad upstream\\nFORGED error\\rbad tail" in message
    assert "Traceback (most recent call last)" in message
    assert "test_unhandled_exception_log_escapes_request_error_and_traceback" in message
    _assert_single_physical_line(message)


def test_cover_url_log_escapes_upstream_crlf(caplog):
    response = MagicMock()
    response.headers = {"content-type": "application/x-malicious"}
    malicious_url = "https://example.test/cover.jpg\nFORGED warning\rbad tail"

    with caplog.at_level(logging.WARNING, logger="app.enrichers.cover_fetcher"):
        result = cover_fetcher._resolve_ext(response, malicious_url)

    assert result is None
    message = next(
        record.getMessage()
        for record in caplog.records
        if record.name == "app.enrichers.cover_fetcher"
    )
    assert "cover.jpg\\nFORGED warning\\rbad tail" in message
    _assert_single_physical_line(message)


def test_invalid_multiline_llm_output_log_is_escaped(caplog):
    malicious_output = "not json\nFORGED warning\rbad tail"

    with (
        caplog.at_level(logging.WARNING, logger="app.enrichers.pdf_llm"),
        patch.object(pdf_llm, "ANTHROPIC_API_KEY", "test-key"),
        patch.object(pdf_llm, "_call_llm", return_value=malicious_output),
    ):
        metadata = pdf_llm.extract_metadata_from_filename("book.pdf")

    assert metadata == pdf_llm.LlmMetadata()
    message = next(
        record.getMessage()
        for record in caplog.records
        if record.name == "app.enrichers.pdf_llm"
    )
    assert "not json\\nFORGED warning\\rbad tail" in message
    _assert_single_physical_line(message)
