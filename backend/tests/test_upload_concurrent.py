"""Parallel uploads: unique tempIds, no file collisions."""
import os
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from tests._helpers import login_client

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "books"


def _upload_worker():
    """Each worker: fresh client, upload, release thread-local DB."""
    c = login_client(username="admin", password="admin123")
    try:
        with open(FIXTURES / "minimal.fb2", "rb") as f:
            resp = c.post("/api/upload",
                          files={"file": ("test.fb2", f, "application/octet-stream")})
        return resp.json()
    finally:
        from app.database import reset_db
        reset_db()


class TestConcurrentUploads:
    def test_parallel_uploads_unique_temp_ids(self):
        with ThreadPoolExecutor(max_workers=3) as pool:
            results = list(pool.map(lambda _: _upload_worker(), range(3)))
        temp_ids = [r["tempId"] for r in results]
        assert len(set(temp_ids)) == 3, f"Expected 3 unique, got {temp_ids}"

    def test_parallel_uploads_files_dont_collide(self):
        def worker():
            return _upload_worker()["tempId"]

        with ThreadPoolExecutor(max_workers=3) as pool:
            temp_ids = list(pool.map(lambda _: worker(), range(3)))

        uploads_dir = Path(os.environ["DATA_DIR"]) / "uploads"
        for tid in temp_ids:
            matching = [f for f in uploads_dir.iterdir()
                        if f.name.startswith(tid + ".")]
            assert len(matching) == 1, f"Expected 1 file for {tid}, got {matching}"
