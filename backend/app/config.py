import os
from pathlib import Path
from dotenv import load_dotenv

# Project root — two levels up from this file (backend/app/config.py → librarium-py/)
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent

# Load backend/.env if it exists (for local development)
load_dotenv(PROJECT_ROOT / "backend" / ".env")

# Data directory — переопределяется через env DATA_DIR для тестов
DATA_DIR = Path(os.environ.get("DATA_DIR", str(PROJECT_ROOT / "data")))
LIBRARY_DIR = DATA_DIR / "library"
UPLOADS_DIR = DATA_DIR / "uploads"
DB_PATH = DATA_DIR / "db.sqlite"
SCHEMA_PATH = Path(__file__).resolve().parent.parent / "schema.sql"

# Posix-style prefix записываемых в DB путей (см. db_path_for). Single source
# of truth — download_service и прочие потребители должны использовать эту
# константу, чтобы при смене схемы (например, префикса) не было латентного
# расхождения.
DB_PATH_PREFIX = "data/library"


def db_path_for(book_id: int, filename: str) -> str:
    """Relative path stored in DB for a book file or cover.
    Resolved at serve time relative to DATA_DIR's parent (project root)."""
    return f"{DB_PATH_PREFIX}/{book_id}/{filename}"


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
        os.chmod(str(_secret_file), 0o600)
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_HOURS = 168  # 7 days
JWT_REFRESH_AFTER_HOURS = 84  # refresh if token older than half TTL (3.5 days)
COOKIE_NAME = "librarium_token"

# Upload limits
MAX_BOOK_SIZE = 100 * 1024 * 1024   # 100 MB
MAX_COVER_SIZE = 10 * 1024 * 1024   # 10 MB

# LLM API (Anthropic Claude) — optional, empty string disables LLM extraction
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
ANTHROPIC_MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-6")
ANTHROPIC_TIMEOUT_SEC = float(os.environ.get("ANTHROPIC_TIMEOUT_SEC", "60"))

