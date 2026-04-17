import { client } from "../client";
import type { User } from "../types";

export interface LoginBody {
  username: string;
  password: string;
}

export interface LoginResponse {
  ok: true;
  user: User;
}

export function getMe(): Promise<User> {
  return client<User>("GET", "/api/auth/me");
}

export function login(body: LoginBody): Promise<LoginResponse> {
  return client<LoginResponse>("POST", "/api/auth/login", { body });
}

export function logout(): Promise<{ ok: true }> {
  return client<{ ok: true }>("POST", "/api/auth/logout");
}
