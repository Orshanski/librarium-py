from unittest.mock import MagicMock, patch
from app.parsers.pdf_llm import extract_metadata_from_filename, LlmMetadata


def test_empty_api_key_returns_empty():
    with patch("app.parsers.pdf_llm.ANTHROPIC_API_KEY", ""):
        result = extract_metadata_from_filename("Book.pdf")
    assert result == LlmMetadata()


def test_extraction_parses_json_response():
    mock_response = MagicMock()
    mock_response.content = [
        MagicMock(type="text", text='{"title": "Test Book", "author": "John Doe", "publisher": "", "year": "", "isbn": "", "annotation": "", "genres": [], "cover_url": ""}')
    ]
    with patch("app.parsers.pdf_llm.ANTHROPIC_API_KEY", "test-key"), \
         patch("app.parsers.pdf_llm.anthropic.Anthropic") as mock_client:
        mock_client.return_value.messages.create.return_value = mock_response
        result = extract_metadata_from_filename("book.pdf")
    assert result.title == "Test Book"
    assert result.author == "John Doe"


def test_extraction_strips_markdown_fences():
    mock_response = MagicMock()
    mock_response.content = [
        MagicMock(type="text", text='```json\n{"title": "X", "author": "Y", "publisher": "", "year": "", "isbn": "", "annotation": "", "genres": [], "cover_url": ""}\n```')
    ]
    with patch("app.parsers.pdf_llm.ANTHROPIC_API_KEY", "test-key"), \
         patch("app.parsers.pdf_llm.anthropic.Anthropic") as mock_client:
        mock_client.return_value.messages.create.return_value = mock_response
        result = extract_metadata_from_filename("book.pdf")
    assert result.title == "X"


def test_api_error_returns_empty():
    with patch("app.parsers.pdf_llm.ANTHROPIC_API_KEY", "test-key"), \
         patch("app.parsers.pdf_llm.anthropic.Anthropic") as mock_client:
        mock_client.return_value.messages.create.side_effect = Exception("API down")
        result = extract_metadata_from_filename("book.pdf")
    assert result == LlmMetadata()


def test_extraction_parses_genres_array():
    mock_response = MagicMock()
    mock_response.content = [
        MagicMock(type="text", text='{"title": "X", "author": "", "publisher": "", "year": "", "isbn": "", "annotation": "", "genres": ["Детектив", "Триллер"], "cover_url": ""}')
    ]
    with patch("app.parsers.pdf_llm.ANTHROPIC_API_KEY", "test-key"), \
         patch("app.parsers.pdf_llm.anthropic.Anthropic") as mock_client:
        mock_client.return_value.messages.create.return_value = mock_response
        result = extract_metadata_from_filename("book.pdf")
    assert result.genres == ["Детектив", "Триллер"]


def test_extraction_fallback_genre_string():
    # Backwards compat: if LLM returns "genre" as string, split by comma
    mock_response = MagicMock()
    mock_response.content = [
        MagicMock(type="text", text='{"title": "X", "author": "", "publisher": "", "year": "", "isbn": "", "annotation": "", "genre": "Фантастика, Боевик", "cover_url": ""}')
    ]
    with patch("app.parsers.pdf_llm.ANTHROPIC_API_KEY", "test-key"), \
         patch("app.parsers.pdf_llm.anthropic.Anthropic") as mock_client:
        mock_client.return_value.messages.create.return_value = mock_response
        result = extract_metadata_from_filename("book.pdf")
    assert result.genres == ["Фантастика", "Боевик"]


def test_invalid_json_returns_empty():
    mock_response = MagicMock()
    mock_response.content = [MagicMock(type="text", text="not json")]
    with patch("app.parsers.pdf_llm.ANTHROPIC_API_KEY", "test-key"), \
         patch("app.parsers.pdf_llm.anthropic.Anthropic") as mock_client:
        mock_client.return_value.messages.create.return_value = mock_response
        result = extract_metadata_from_filename("book.pdf")
    assert result == LlmMetadata()
