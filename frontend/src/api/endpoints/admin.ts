import { client } from "../client";
import type { OkResponse } from "../types";

export interface AdminUser {
  id: number;
  username: string;
  displayName: string | null;
  email: string | null;
  role: "admin" | "reader";
  createdAt?: string;
}

export interface UsersResponse {
  users: AdminUser[];
}

export interface CreateUserBody {
  username: string;
  password: string;
  role: "admin" | "reader";
  displayName?: string;
  email?: string;
}

export interface UpdateUserBody {
  displayName?: string;
  email?: string;
  password?: string;
  role?: "admin" | "reader";
}

export interface CreateUserResponse {
  id: number;
}

export interface AdminSettings {
  smtpHost?: string;
  smtpPort?: string;
  smtpUser?: string;
  smtpPass?: string;
}

export function listUsers(signal?: AbortSignal): Promise<UsersResponse> {
  return client<UsersResponse>("GET", "/api/admin/users", { signal });
}

export function createUser(body: CreateUserBody): Promise<CreateUserResponse> {
  return client<CreateUserResponse>("POST", "/api/admin/users", { body });
}

export function updateUser(id: number, body: UpdateUserBody): Promise<OkResponse> {
  return client<OkResponse>("PUT", `/api/admin/users/${id}`, { body });
}

export function deleteUser(id: number): Promise<OkResponse> {
  return client<OkResponse>("DELETE", `/api/admin/users/${id}`);
}

export function getAdminSettings(signal?: AbortSignal): Promise<AdminSettings> {
  return client<AdminSettings>("GET", "/api/admin/settings", { signal });
}

export function saveAdminSettings(body: AdminSettings): Promise<OkResponse> {
  return client<OkResponse>("PUT", "/api/admin/settings", { body });
}

export function smtpTest(): Promise<OkResponse> {
  return client<OkResponse>("POST", "/api/admin/smtp-test");
}
