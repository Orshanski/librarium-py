from app.logging_utils import safe


def test_strips_lf_and_cr():
    assert safe("a\nb") == "a\\nb"
    assert safe("a\rb") == "a\\rb"
    assert safe("a\r\nb") == "a\\r\\nb"


def test_truncates_to_maxlen():
    assert safe("x" * 500) == "x" * 200
    assert safe("x" * 500, maxlen=10) == "x" * 10


def test_handles_non_string():
    assert safe(None) == "None"
    assert safe(123) == "123"
    assert safe(ValueError("oops\nfake")) == "oops\\nfake"


def test_preserves_safe_text():
    assert safe("good.epub") == "good.epub"
    assert safe("https://example.com/path") == "https://example.com/path"


def test_truncation_applies_after_escape():
    # Ensure the \\n escape sequence isn't bisected by truncation edge cases
    result = safe("a\n" * 100, maxlen=50)
    assert len(result) <= 50
    assert "\n" not in result  # no raw newline leaked
