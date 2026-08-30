"""Ссылка на рекап в подробном ответе о книге."""
from tests.test_recap_upload import DOC


class TestRecapLink:
    def test_absent_without_recap(self, reader_client):
        resp = reader_client.get("/api/books/1")
        assert resp.status_code == 200
        assert resp.json()["book"]["recapPath"] is None

    def test_present_after_upload(self, reader_client):
        reader_client.put("/api/books/2/recap", json=DOC)
        resp = reader_client.get("/api/books/2")
        link = resp.json()["book"]["recapPath"]
        assert link is not None
        assert link.startswith("/api/books/2/recap?t=")

    def test_link_survives_book_update(self, reader_client):
        # Отдельный клиент для админа: обе фикстуры клиентов делят один TestClient.
        from tests._helpers.builders import login_client

        reader_client.put("/api/books/2/recap", json=DOC)
        admin = login_client(username="admin", password="admin123")
        resp = admin.put("/api/books/2", json={"title": "Новое название"})
        assert resp.status_code == 200
        assert admin.get("/api/books/2").json()["book"]["recapPath"] is not None

    def test_absent_in_list_response(self, reader_client):
        # Красный на неполной правке: поле повесили на карточный DTO вместо
        # подробного, и ссылка потекла в списки. На старом коде тест зелёный —
        # это осознанно, режим падения именно такой.
        resp = reader_client.get("/api/books")
        assert resp.status_code == 200
        assert "recapPath" not in resp.json()["books"][0]
