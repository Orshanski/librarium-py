import { client } from "../client";

export interface AdminUser {
  id: number;
  username: string;
  display_name: string;
  email: string | null;
  role: "admin" | "reader";
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

export interface AdminOkResponse {
  ok: true;
}

export interface AdminSettings {
  app_name?: string;
  smtp_host?: string;
  smtp_port?: string;
  smtp_user?: string;
  smtp_pass?: string;
}

export function listUsers(signal?: AbortSignal): Promise<UsersResponse> {
  return client<UsersResponse>("GET", "/api/admin/users", { signal });
}

export function createUser(body: CreateUserBody): Promise<CreateUserResponse> {
  return client<CreateUserResponse>("POST", "/api/admin/users", { body });
}

export function updateUser(id: number, body: UpdateUserBody): Promise<AdminOkResponse> {
  return client<AdminOkResponse>("PUT", `/api/admin/users/${id}`, { body });
}

export function deleteUser(id: number): Promise<AdminOkResponse> {
  return client<AdminOkResponse>("DELETE", `/api/admin/users/${id}`);
}

export function getAdminSettings(signal?: AbortSignal): Promise<AdminSettings> {
  return client<AdminSettings>("GET", "/api/admin/settings", { signal });
}

export function saveAdminSettings(body: AdminSettings): Promise<AdminOkResponse> {
  return client<AdminOkResponse>("PUT", "/api/admin/settings", { body });
}

export function smtpTest(): Promise<AdminOkResponse> {
  return client<AdminOkResponse>("POST", "/api/admin/smtp-test");
}
