"""Приём структуры рекапа: запись к книге, замена, отказы."""
import json
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.config import LIBRARY_DIR
from app.main import app
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

    def test_missing_retell_field_returns_422(self, reader_client):
        """Поле retell обязательно в теле запроса — без него FastAPI отказывает
        разбором тела (422), до того как код сервиса вообще увидит документ."""
        doc = {k: v for k, v in DOC.items() if k != "retell"}
        resp = reader_client.put("/api/books/2/recap", json=doc)
        assert_error(resp, 422)

    def test_requires_login(self, anon_client):
        assert_error(anon_client.put("/api/books/2/recap", json=DOC), 401)

    def test_rejects_oversized_document(self, reader_client):
        with patch("app.services.recap_service.MAX_RECAP_SIZE", 100):
            resp = reader_client.put("/api/books/2/recap", json=DOC)
        assert_error(resp, 400)

    def test_write_failure_leaves_no_temp_file(self, reader_client):
        """Сбой на os.replace (запись прошла, переименование — нет): временный
        файл убирается в except-ветке recap_service.save_recap, ответ — 500."""
        no_raise = TestClient(app, raise_server_exceptions=False, cookies=reader_client.cookies)
        no_raise.headers.update({"X-Requested-With": "XMLHttpRequest"})

        with patch("app.services.recap_service.os.replace", side_effect=OSError("disk full")):
            resp = no_raise.put("/api/books/2/recap", json=DOC)

        assert_error(resp, 500)
        book_dir = Path(LIBRARY_DIR) / "2"
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
