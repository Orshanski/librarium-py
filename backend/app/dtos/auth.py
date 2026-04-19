"""Auth request DTOs."""
from pydantic import BaseModel


class LoginRequest(BaseModel):
    username: str
    password: str
