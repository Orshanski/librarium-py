import os
import sys
from types import FrameType

import uvicorn


class LibrariumServer(uvicorn.Server):
    def handle_exit(self, sig: int, frame: FrameType | None) -> None:
        from app.events import broker

        broker.close_all()
        super().handle_exit(sig, frame)


def run_server(argv: list[str] | None = None) -> None:
    args = sys.argv[1:] if argv is None else argv
    dev = "--dev" in args
    ssl = "--ssl" in args

    kwargs = dict(host="0.0.0.0", port=8000, reload=dev, reload_dirs=["app"] if dev else None)

    if ssl:
        cert_dir = os.path.expanduser("~/dev-ca")
        kwargs["ssl_keyfile"] = os.path.join(cert_dir, "tailscale.key")
        kwargs["ssl_certfile"] = os.path.join(cert_dir, "tailscale.crt")

    original_server = uvicorn.run.__globals__["Server"]
    uvicorn.run.__globals__["Server"] = LibrariumServer
    try:
        uvicorn.run("app.main:app", **kwargs)
    finally:
        uvicorn.run.__globals__["Server"] = original_server


if __name__ == "__main__":
    run_server()
