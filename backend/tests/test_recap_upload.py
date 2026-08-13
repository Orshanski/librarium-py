"""Приём структуры рекапа: запись к книге, замена, отказы."""
import json
from pathlib import Path

from app.config import LIBRARY_DIR, MAX_RECAP_SIZE
from tests._helpers import assert_error, login_client

DOC = {
    "version": 1,
    "bookId": 2,
    "book": {"title": "Тест", "authors": ["Автор"], "series": None, "seriesNumber": None},
    "recap": {"sections": [
        {"title": "Кто есть кто", "kind": "people",
         "people": [{"name": "Кип", "about": "подросток"}]},
        {"title": "Что произошло", "kind": "episodes",
         "episodes": [{"title": "Начало", "paragraphs": ["Первый абзац"]}]},
        {"title": "Чем всё закончилось", "kind": "prose", "paragraphs": ["Финал"]},
        {"title": "Что осталось открытым", "kind": "list", "items": ["Вопрос"]},
    ]},
    "retell": {"parts": [{"number": 1, "paragraphs": ["Часть первая"]}]},
}


class TestRecapUpload:
    def test_saves_document_to_book_folder(self, reader_client):
        resp = reader_client.put("/api/books/2/recap", json=DOC)
        assert resp.status_code == 200
        assert resp.json() == {"ok": True}
        saved = json.loads((Path(LIBRARY_DIR) / "2" / "recap.json").read_text(encoding="utf-8"))
        assert saved["recap"]["sections"][0]["people"][0]["name"] == "Кип"
        assert "bookId" in saved
        assert "book_id" not in saved

    def test_creates_book_folder_when_missing(self, reader_client):
        """Книга 3 в фикстуре без файла на диске — папки library/3 не существует."""
        doc = {**DOC, "bookId": 3}
        resp = reader_client.put("/api/books/3/recap", json=doc)
        assert resp.status_code == 200
        assert (Path(LIBRARY_DIR) / "3" / "recap.json").exists()

    def test_replaces_previous_document(self, reader_client):
        reader_client.put("/api/books/2/recap", json=DOC)
        second = {**DOC, "recap": {"sections": [
            {"title": "Кто есть кто", "kind": "people",
             "people": [{"name": "Гэвин", "about": "Призма"}]},
        ]}}
        resp = reader_client.put("/api/books/2/recap", json=second)
        assert resp.status_code == 200
        saved = json.loads((Path(LIBRARY_DIR) / "2" / "recap.json").read_text(encoding="utf-8"))
        assert len(saved["recap"]["sections"]) == 1
        assert saved["recap"]["sections"][0]["people"][0]["name"] == "Гэвин"

    def test_unknown_book(self, reader_client):
        assert_error(reader_client.put("/api/books/999/recap", json={**DOC, "bookId": 999}), 404)

    def test_book_id_mismatch(self, reader_client):
        assert_error(reader_client.put("/api/books/2/recap", json={**DOC, "bookId": 3}), 400)

    def test_unknown_version(self, reader_client):
        assert_error(reader_client.put("/api/books/2/recap", json={**DOC, "version": 99}), 400)

    def test_empty_recap_sections(self, reader_client):
        empty = {**DOC, "recap": {"sections": []}}
        assert_error(reader_client.put("/api/books/2/recap", json=empty), 400)

    def test_empty_retell_parts(self, reader_client):
        empty = {**DOC, "retell": {"parts": []}}
        assert_error(reader_client.put("/api/books/2/recap", json=empty), 400)

    def test_requires_login(self, anon_client):
        assert_error(anon_client.put("/api/books/2/recap", json=DOC), 401)

    def test_rejects_oversized_document(self, reader_client):
        # "а" — кириллица, 2 байта в UTF-8: длина строки от предела вдвое дешевле,
        # чем считать в байтах напрямую.
        huge = {**DOC, "recap": {"sections": [
            {"title": "Кто есть кто", "kind": "prose",
             "paragraphs": ["а" * (MAX_RECAP_SIZE // 2 + 1)]},
        ]}}
        resp = reader_client.put("/api/books/2/recap", json=huge)
        assert_error(resp, 400)
        book_dir = Path(LIBRARY_DIR) / "2"
        assert not (book_dir / "recap.json").exists()
        assert list(book_dir.glob("recap.tmp.*")) == []

    def test_touches_book_updated_at(self, reader_client, db_test):
        db_test.execute("UPDATE books SET updated_at = '2020-01-01 00:00:00' WHERE id = 2")
        db_test.commit()

        resp = reader_client.put("/api/books/2/recap", json=DOC)
        assert resp.status_code == 200

        row = db_test.execute("SELECT updated_at FROM books WHERE id = 2").fetchone()
        assert row["updated_at"] != "2020-01-01 00:00:00"

    def test_book_delete_removes_recap(self, reader_client):
        # admin_client и reader_client построены на одном TestClient (conftest.py:101-131),
        # второй вход перетирает cookie первого — поэтому админа берём отдельным клиентом.
        reader_client.put("/api/books/2/recap", json=DOC)
        assert (Path(LIBRARY_DIR) / "2" / "recap.json").exists()
        admin = login_client(username="admin", password="admin123")
        assert admin.delete("/api/books/2").status_code == 200
        assert not (Path(LIBRARY_DIR) / "2").exists()
