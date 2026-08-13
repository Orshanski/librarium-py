"""Приём структуры рекапа: запись к книге, замена, отказы."""
import json
from pathlib import Path

from app.config import LIBRARY_DIR
from tests._helpers import assert_error

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

    def test_requires_login(self, anon_client):
        assert_error(anon_client.put("/api/books/2/recap", json=DOC), 401)

    def test_rejects_oversized_document(self, reader_client):
        huge = {**DOC, "recap": {"sections": [
            {"title": "Кто есть кто", "kind": "prose", "paragraphs": ["а" * 11_000_000]},
        ]}}
        assert_error(reader_client.put("/api/books/2/recap", json=huge), 400)

    def test_book_delete_removes_recap(self, reader_client):
        # admin_client и reader_client построены на одном TestClient (conftest.py:101-131),
        # второй вход перетирает cookie первого — поэтому админа берём отдельным клиентом.
        from tests._helpers.builders import login_client

        reader_client.put("/api/books/2/recap", json=DOC)
        assert (Path(LIBRARY_DIR) / "2" / "recap.json").exists()
        admin = login_client(username="admin", password="admin123")
        assert admin.delete("/api/books/2").status_code == 200
        assert not (Path(LIBRARY_DIR) / "2").exists()
