import signal

import uvicorn

import run


def test_librarium_server_closes_event_streams_before_uvicorn_exit(monkeypatch):
    calls: list[str] = []

    def fake_close_all():
        calls.append("close_all")

    def fake_handle_exit(self, sig, frame):
        calls.append("uvicorn_handle_exit")

    monkeypatch.setattr("app.events.broker.close_all", fake_close_all)
    monkeypatch.setattr(uvicorn.Server, "handle_exit", fake_handle_exit)

    server = object.__new__(run.LibrariumServer)
    server.handle_exit(signal.SIGINT, None)

    assert calls == ["close_all", "uvicorn_handle_exit"]
