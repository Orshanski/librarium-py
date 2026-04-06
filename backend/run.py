import uvicorn
import os

if __name__ == "__main__":
    import sys
    dev = "--dev" in sys.argv
    ssl = "--ssl" in sys.argv

    kwargs = dict(host="0.0.0.0", port=8000, reload=dev, reload_dirs=["app"] if dev else None)

    if ssl:
        cert_dir = os.path.expanduser("~/dev-ca")
        kwargs["ssl_keyfile"] = os.path.join(cert_dir, "librarium.key")
        kwargs["ssl_certfile"] = os.path.join(cert_dir, "librarium.crt")

    uvicorn.run("app.main:app", **kwargs)
