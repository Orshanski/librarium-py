"""nyq9: удаление пользователя немедленно отзывает его сессию."""
import pytest

from tests._helpers import assert_ok, assert_error, login_client, connect_test_db


def test_deleted_user_token_rejected(admin_client):
    # reader (id=2 в seed) логинится и имеет рабочую сессию
    c = login_client(username="reader", password="reader123")
    assert_ok(c.get("/api/auth/me"))

    # admin удаляет reader
    assert_ok(admin_client.delete("/api/admin/users/2"))

    # прежняя кука reader больше не принимается (немедленно, без ожидания exp)
    assert_error(c.get("/api/auth/me"), 401)


def test_active_user_not_affected(admin_client):
    # удаление одного пользователя не отзывает сессию другого
    c = login_client(username="reader", password="reader123")
    # создаём и удаляем постороннего
    uid = assert_ok(admin_client.post("/api/admin/users", json={
        "username": "temp", "password": "pass1234", "role": "reader",
    }))["id"]
    assert_ok(admin_client.delete(f"/api/admin/users/{uid}"))
    # reader по-прежнему работает
    assert_ok(c.get("/api/auth/me"))


def test_deleted_user_rejected_on_endpoint_without_own_existence_check(admin_client):
    """Дополнительный тест сверх брифа (не verbatim из task-5-brief.md).

    /api/auth/me отклоняет удалённого пользователя даже без epoch-фикса:
    get_me() сам делает users_dal.get_user_by_id() и кидает AuthError, если
    строки нет — 401 приходит из бизнес-логики эндпоинта, а не из
    _validate_token_epoch. Из-за этого тест из брифа (test_deleted_user_token_rejected)
    зелёный ДО фикса и НЕ доказывает, что заработал именно механизм
    token-epoch revocation.

    /api/shelves так не делает — он просто фильтрует по user_id и вернул бы
    200 с пустым списком для уже удалённого пользователя, если бы токен
    по-прежнему проходил проверку эпохи. Этот тест ловит именно тот путь,
    который реально чинит nyq9 (dirty-эпоха / отсутствие строки в БД →
    reject в _validate_token_epoch / _reject_dirty_epoch_mismatch).
    """
    c = login_client(username="reader", password="reader123")
    assert_ok(c.get("/api/shelves"))

    assert_ok(admin_client.delete("/api/admin/users/2"))

    assert_error(c.get("/api/shelves"), 401)


def test_dirty_marker_with_absent_user_rejects():
    """White-box: Constraint 3 — окно commit→hook.

    Пользователь помечен «идёт отзыв» (dirty) и его строки в БД уже нет.
    Через HTTP это окно не воспроизвести: синхронный delete-запрос успевает
    выполнить after-commit-хук (снимает dirty + чистит кэш) до следующего
    запроса, поэтому integration-тесты бьют только cache-miss путь (Constraint 1).
    Здесь ветку `dirty + строки нет → reject` в `_reject_dirty_epoch_mismatch`
    проверяем напрямую, по образцу white-box-хелпера reset_token_epoch_cache_for_tests.
    """
    from app.auth import _validate_token_epoch, _token_epoch_dirty_users, _token_epoch_cache_lock
    from app.exceptions import AuthError

    db = connect_test_db()
    db.execute("DELETE FROM users WHERE id = 2")
    db.commit()
    db.close()

    with _token_epoch_cache_lock:
        _token_epoch_dirty_users.add(2)
    try:
        with pytest.raises(AuthError):
            _validate_token_epoch(2, 0)
    finally:
        with _token_epoch_cache_lock:
            _token_epoch_dirty_users.discard(2)
