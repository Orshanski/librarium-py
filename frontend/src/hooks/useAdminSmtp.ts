import { useState, useEffect, useCallback } from "react";
import {
  getAdminSettings, saveAdminSettings, smtpTest as apiSmtpTest,
  type AdminSettings,
} from "@/api/endpoints/admin";

export interface UseAdminSmtpResult {
  settings: AdminSettings;
  loading: boolean;
  setField: (key: keyof AdminSettings, value: string) => void;
  saving: boolean;
  savedToast: boolean;
  save: () => Promise<void>;
  smtpStatus: "none" | "checking" | "ok";
  smtpError: string;
  testConnection: () => Promise<void>;
}

export function useAdminSmtp(): UseAdminSmtpResult {
  const [settings, setSettings] = useState<AdminSettings>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedToast, setSavedToast] = useState(false);
  const [smtpStatus, setSmtpStatus] = useState<"none" | "checking" | "ok">("none");
  const [smtpError, setSmtpError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    getAdminSettings(controller.signal)
      .then((data) => {
        setSettings(data || {});
        setSmtpStatus(data?.smtpHost ? "ok" : "none");
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return;
        console.error("Admin settings load error:", e);
        setLoading(false);
      });
    return () => controller.abort();
  }, []);

  const setField = useCallback((key: keyof AdminSettings, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    setSavedToast(false);
    try {
      await saveAdminSettings(settings);
      setSavedToast(true);
      setTimeout(() => setSavedToast(false), 3000);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Ошибка сохранения настроек");
    } finally {
      setSaving(false);
    }
  }, [settings]);

  const testConnection = useCallback(async () => {
    setSmtpStatus("checking");
    setSmtpError("");
    try {
      await saveAdminSettings(settings);
      await apiSmtpTest();
      setSmtpStatus("ok");
    } catch (e: unknown) {
      setSmtpStatus("none");
      setSmtpError(e instanceof Error ? e.message : "Ошибка подключения");
    }
  }, [settings]);

  return { settings, loading, setField, saving, savedToast, save,
           smtpStatus, smtpError, testConnection };
}
