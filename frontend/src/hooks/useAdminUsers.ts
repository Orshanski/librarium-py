import { useState, useEffect, useCallback } from "react";
import {
  listUsers, createUser as apiCreateUser, updateUser,
  deleteUser as apiDeleteUser, type AdminUser,
} from "@/api/endpoints/admin";

export interface NewUserData {  // экспортируется — потребляется NewUserForm (Task 8)
  username: string; password: string; role: "admin" | "reader";
  displayName?: string; email?: string;
}

export interface UseAdminUsersResult {
  users: AdminUser[];
  loading: boolean;
  createUser: (data: NewUserData) => Promise<void>;
  saveName: (id: number, name: string) => Promise<void>;
  saveRole: (id: number, role: "admin" | "reader") => Promise<void>;
  savePassword: (id: number, pass: string) => Promise<void>;
  deleteUserId: number | null;
  requestDelete: (id: number) => void;
  cancelDelete: () => void;
  confirmDelete: () => Promise<void>;
}

export function useAdminUsers(): UseAdminUsersResult {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteUserId, setDeleteUserId] = useState<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    listUsers(controller.signal)
      .then((data) => { setUsers(data.users || []); setLoading(false); })
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return;
        console.error("Admin users load error:", e);
        setLoading(false);
      });
    return () => controller.abort();
  }, []);

  const saveName = useCallback(async (id: number, name: string) => {
    try {
      await updateUser(id, { displayName: name });
      setUsers((prev) => prev.map((u) => u.id === id ? { ...u, displayName: name } : u));
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Ошибка сохранения имени");
    }
  }, []);

  const saveRole = useCallback(async (id: number, role: "admin" | "reader") => {
    try {
      await updateUser(id, { role });
      setUsers((prev) => prev.map((u) => u.id === id ? { ...u, role } : u));
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Ошибка смены роли");
    }
  }, []);

  const savePassword = useCallback(async (id: number, pass: string) => {
    try {
      await updateUser(id, { password: pass });
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Ошибка смены пароля");
    }
  }, []);

  const createUser = useCallback(async (data: NewUserData) => {
    try {
      const created = await apiCreateUser({
        username: data.username, password: data.password, role: data.role,
        displayName: data.displayName || undefined, email: data.email || undefined,
      });
      setUsers((prev) => [...prev, {
        id: created.id, username: data.username,
        displayName: data.displayName || data.username,
        email: data.email || null, role: data.role,
      }]);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Ошибка создания пользователя");
      throw e;  // форма не закрывается при ошибке
    }
  }, []);

  const requestDelete = useCallback((id: number) => setDeleteUserId(id), []);
  const cancelDelete = useCallback(() => setDeleteUserId(null), []);
  const confirmDelete = useCallback(async () => {
    if (deleteUserId == null) return;
    try {
      await apiDeleteUser(deleteUserId);
      setUsers((prev) => prev.filter((u) => u.id !== deleteUserId));
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Ошибка удаления пользователя");
    }
    setDeleteUserId(null);
  }, [deleteUserId]);

  return { users, loading, createUser, saveName, saveRole, savePassword,
           deleteUserId, requestDelete, cancelDelete, confirmDelete };
}
