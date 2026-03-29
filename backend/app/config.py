import os
from pathlib import Path

# Project root — two levels up from this file (backend/app/config.py → librarium-py/)
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent

# Data directory — переопределяется через env DATA_DIR для тестов
DATA_DIR = Path(os.environ.get("DATA_DIR", str(PROJECT_ROOT / "data")))
LIBRARY_DIR = DATA_DIR / "library"
UPLOADS_DIR = DATA_DIR / "uploads"
DB_PATH = DATA_DIR / "db.sqlite"
SCHEMA_PATH = Path(__file__).resolve().parent.parent / "schema.sql"

# Ensure directories exist
DATA_DIR.mkdir(parents=True, exist_ok=True)
UPLOADS_DIR.mkdir(exist_ok=True)

# JWT
SECRET_KEY = os.environ.get("SECRET_KEY")
if not SECRET_KEY:
    _secret_file = DATA_DIR / ".secret_key"
    if _secret_file.exists():
        SECRET_KEY = _secret_file.read_text().strip()
    else:
        import secrets
        SECRET_KEY = secrets.token_hex(32)
        _secret_file.write_text(SECRET_KEY)
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_HOURS = 72
COOKIE_NAME = "librarium_token"

# Upload limits
MAX_BOOK_SIZE = 100 * 1024 * 1024   # 100 MB
MAX_COVER_SIZE = 10 * 1024 * 1024   # 10 MB

