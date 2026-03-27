import smtplib
from email.mime.text import MIMEText

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from ..auth import require_admin
from ..dal import users as users_dal
from ..dal import settings as settings_dal

router = APIRouter(prefix="/api/admin", tags=["admin"])


# --- Users ---

class CreateUserBody(BaseModel):
    username: str
    password: str
    role: str = "reader"
    displayName: str | None = None
    email: str | None = None


class UpdateUserBody(BaseModel):
    displayName: str | None = None
    email: str | None = None
    password: str | None = None
    role: str | None = None


@router.get("/users")
def list_users(request: Request):
    require_admin(request)
    return {"users": users_dal.get_all_users()}


@router.post("/users")
def create_user(body: CreateUserBody, request: Request):
    require_admin(request)
    uid = users_dal.create_user(body.username, body.password, body.role, body.displayName, body.email)
    return {"id": uid}


@router.put("/users/{user_id}")
def update_user(user_id: int, body: UpdateUserBody, request: Request):
    require_admin(request)
    data = body.model_dump(exclude_none=True)
    users_dal.update_user(user_id, data)
    return {"ok": True}


@router.delete("/users/{user_id}")
def delete_user(user_id: int, request: Request):
    require_admin(request)
    users_dal.delete_user(user_id)
    return {"ok": True}


# --- Settings ---

@router.get("/settings")
def get_settings(request: Request):
    require_admin(request)
    return settings_dal.get_all_settings()


@router.put("/settings")
async def update_settings(request: Request):
    require_admin(request)
    data = await request.json()
    for key, value in data.items():
        settings_dal.set_setting(key, value)
    return {"ok": True}


# --- SMTP Test ---

@router.post("/smtp-test")
def smtp_test(request: Request):
    user = require_admin(request)
    host = settings_dal.get_setting("smtp_host")
    port = int(settings_dal.get_setting("smtp_port") or "587")
    smtp_user = settings_dal.get_setting("smtp_user")
    smtp_pass = settings_dal.get_setting("smtp_pass")

    if not host or not smtp_user:
        return JSONResponse({"error": "SMTP не настроен"}, status_code=400)

    db_user = users_dal.get_user_by_id(user["userId"])
    if not db_user or not db_user.get("email"):
        return JSONResponse({"error": "У вас не указан email"}, status_code=400)

    try:
        msg = MIMEText("<h2>Librarium</h2><p>SMTP работает!</p>", "html", "utf-8")
        msg["Subject"] = "Librarium — тест SMTP"
        msg["From"] = smtp_user
        msg["To"] = db_user["email"]

        if port == 465:
            server = smtplib.SMTP_SSL(host, port, timeout=15)
        else:
            server = smtplib.SMTP(host, port, timeout=15)
            server.starttls()

        server.login(smtp_user, smtp_pass)
        server.send_message(msg)
        server.quit()
        return {"ok": True}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)
