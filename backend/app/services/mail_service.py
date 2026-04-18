"""Mail service — compose + send via configured SMTP.

Currently used only by admin smtp_test endpoint. Future callers:
reset-password, invites. Wide try/except around send_test_email preserves the
pre-refactor behaviour where template I/O and SMTP errors map to the same
user-visible failure.
"""
import logging
import smtplib
import sqlite3
from email.mime.image import MIMEImage
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

from ..dal import settings as settings_dal
from ..dal import users as users_dal
from ..exceptions import BadInputError, UpstreamError

log = logging.getLogger("librarium.mail")

# services/ → app/ → backend/ → librarium-py/ → frontend/public/logo.png
_TEMPLATES_DIR = Path(__file__).resolve().parent.parent / "templates"
_LOGO_PATH = Path(__file__).resolve().parent.parent.parent.parent / "frontend" / "public" / "logo.png"

_DEFAULT_SMTP_PORT = 587
_SMTP_SSL_PORT = 465
_SMTP_TIMEOUT = 15


def build_email(template_name: str, subject: str, from_addr: str, to_addr: str) -> MIMEMultipart:
    html = (_TEMPLATES_DIR / template_name).read_text(encoding="utf-8")
    msg = MIMEMultipart("related")
    msg["Subject"] = subject
    msg["From"] = from_addr
    msg["To"] = to_addr
    msg.attach(MIMEText(html, "html", "utf-8"))
    if _LOGO_PATH.exists():
        img = MIMEImage(_LOGO_PATH.read_bytes(), _subtype="png")
        img.add_header("Content-ID", "<logo>")
        img.add_header("Content-Disposition", "inline")
        msg.attach(img)
    return msg


def send_test_email(db: sqlite3.Connection, user_id: int) -> None:
    """Send a test email to the acting admin.

    Raises:
      BadInputError: SMTP not configured or user has no email
      UpstreamError: send flow failed (template I/O, MIME assembly, SMTP) —
        maps to HTTP 502 via existing middleware
    """
    host = settings_dal.get_setting(db, "smtp_host")
    port = int(settings_dal.get_setting(db, "smtp_port") or str(_DEFAULT_SMTP_PORT))
    smtp_user = settings_dal.get_setting(db, "smtp_user")
    smtp_pass = settings_dal.get_setting(db, "smtp_pass")

    if not host or not smtp_user:
        raise BadInputError("SMTP не настроен")

    db_user = users_dal.get_user_by_id(db, user_id)
    if not db_user or not db_user.get("email"):
        raise BadInputError("У вас не указан email")

    server = None
    try:
        msg = build_email("smtp_test.html", "Librarium — тест SMTP", smtp_user, db_user["email"])
        if port == _SMTP_SSL_PORT:
            server = smtplib.SMTP_SSL(host, port, timeout=_SMTP_TIMEOUT)
        else:
            server = smtplib.SMTP(host, port, timeout=_SMTP_TIMEOUT)
            server.starttls()
        server.login(smtp_user, smtp_pass)
        server.send_message(msg)
    except Exception as e:
        log.warning("SMTP test failed: %s", e)
        raise UpstreamError("Не удалось отправить тестовое письмо") from e
    finally:
        if server:
            try:
                server.quit()
            except Exception as e:
                log.debug("SMTP quit failed: %s", e)
