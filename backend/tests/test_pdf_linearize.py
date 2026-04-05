"""Tests for PDF linearization helper."""
import shutil
from pathlib import Path

import pikepdf
import pytest

from app.pdf_linearize import linearize_pdf_in_place

FIXTURES = Path(__file__).parent / "fixtures"


def _make_unlinearized_pdf(path: Path) -> None:
    """Create a small non-linearized PDF at path."""
    pdf = pikepdf.new()
    pdf.add_blank_page(page_size=(72, 72))
    pdf.add_blank_page(page_size=(72, 72))
    pdf.save(path, linearize=False)


def test_linearize_non_linearized(tmp_path: Path) -> None:
    """Unlinearized PDF becomes linearized in place."""
    pdf_path = tmp_path / "book.pdf"
    _make_unlinearized_pdf(pdf_path)

    assert not pikepdf.open(pdf_path).is_linearized

    result = linearize_pdf_in_place(str(pdf_path))

    assert result is True
    assert pikepdf.open(pdf_path).is_linearized
    # File still valid
    assert len(pikepdf.open(pdf_path).pages) == 2


def test_linearize_already_linearized_noop(tmp_path: Path) -> None:
    """Already-linearized PDF returns False (no change needed)."""
    pdf_path = tmp_path / "book.pdf"
    pdf = pikepdf.new()
    pdf.add_blank_page(page_size=(72, 72))
    pdf.save(pdf_path, linearize=True)

    assert pikepdf.open(pdf_path).is_linearized
    result = linearize_pdf_in_place(str(pdf_path))

    assert result is False
    assert pikepdf.open(pdf_path).is_linearized


def test_linearize_invalid_pdf_graceful(tmp_path: Path) -> None:
    """Corrupted PDF: helper returns False, file untouched."""
    pdf_path = tmp_path / "broken.pdf"
    pdf_path.write_bytes(b"%PDF-1.4\nnot a real pdf\n")
    original = pdf_path.read_bytes()

    result = linearize_pdf_in_place(str(pdf_path))

    assert result is False
    assert pdf_path.read_bytes() == original


def test_linearize_nonexistent_file_graceful(tmp_path: Path) -> None:
    """Missing file: helper returns False, no exception."""
    result = linearize_pdf_in_place(str(tmp_path / "missing.pdf"))
    assert result is False


def test_linearize_preserves_content(tmp_path: Path) -> None:
    """Linearization preserves page count and basic metadata."""
    src = tmp_path / "book.pdf"
    pdf = pikepdf.new()
    pdf.add_blank_page(page_size=(72, 72))
    pdf.add_blank_page(page_size=(144, 144))
    pdf.add_blank_page(page_size=(216, 216))
    with pdf.open_metadata() as meta:
        meta["dc:title"] = "Test Book"
    pdf.save(src, linearize=False)

    linearize_pdf_in_place(str(src))

    out = pikepdf.open(src)
    assert len(out.pages) == 3
    with out.open_metadata() as meta:
        assert meta.get("dc:title") == "Test Book"


def test_linearize_idempotent(tmp_path: Path) -> None:
    """Running linearize twice is safe."""
    pdf_path = tmp_path / "book.pdf"
    _make_unlinearized_pdf(pdf_path)

    result1 = linearize_pdf_in_place(str(pdf_path))
    result2 = linearize_pdf_in_place(str(pdf_path))

    assert result1 is True
    assert result2 is False
    assert pikepdf.open(pdf_path).is_linearized
