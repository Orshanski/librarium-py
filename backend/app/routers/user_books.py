from fastapi import APIRouter, Request
from pydantic import BaseModel
from ..auth import get_current_user
from ..dal import user_books as dal

router = APIRouter(tags=["user-books"])


class RatingBody(BaseModel):
    rating: int | None


class ReadBody(BaseModel):
    isRead: bool


class HiddenBody(BaseModel):
    isHidden: bool


@router.get("/api/books/{book_id}/status")
def get_status(book_id: int, request: Request):
    user = get_current_user(request)
    ub = dal.get_user_book(user["userId"], book_id)
    return ub or {"is_read": 0, "is_hidden": 0, "rating": None}


@router.put("/api/books/{book_id}/rating")
def set_rating(book_id: int, body: RatingBody, request: Request):
    if body.rating is not None and not (1 <= body.rating <= 5):
        from fastapi.responses import JSONResponse
        return JSONResponse({"error": "Rating must be 1-5"}, status_code=400)
    user = get_current_user(request)
    dal.set_rating(user["userId"], book_id, body.rating)
    return {"ok": True}


@router.put("/api/books/{book_id}/read")
def set_read(book_id: int, body: ReadBody, request: Request):
    user = get_current_user(request)
    dal.set_read(user["userId"], book_id, body.isRead)
    return {"ok": True}


@router.put("/api/books/{book_id}/hidden")
def set_hidden(book_id: int, body: HiddenBody, request: Request):
    user = get_current_user(request)
    dal.set_hidden(user["userId"], book_id, body.isHidden)
    return {"ok": True}
