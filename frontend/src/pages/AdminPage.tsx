import { useState, useEffect } from "react";
import ConfirmDialog from "../components/confirm-dialog";

import PageHeader from "../components/page-header";
import { useIsMobile } from "../responsive";
import { colors, fonts } from "../theme";

interface AdminUser {
  id: number;
  username: string;
  display_name: string | null;
  email: string | null;
  role: string;
}

interface SmtpSettings {
  app_name?: string;
  smtp_host?: string;
  smtp_port?: string;
  smtp_user?: string;
  smtp_pass?: string;
  [key: string]: string | undefined;
}

// ─── Styles ─────────────────────────────────────────
const inputStyle: React.CSSProperties = {
  width: "100%",
  backgroundColor: "rgba(255, 255, 255, 0.06)",
  border: "1px solid rgba(255, 255, 255, 0.08)",
  borderRadius: 6,
  padding: "9px 12px",
  fontSize: 14,
  color: colors.text,
  outline: "none",
  boxSizing: "border-box",
  fontFamily: "inherit",
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  color: colors.textDim,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  marginBottom: 6,
  display: "block",
};

const sectionTitleStyle: React.CSSProperties = {
  fontFamily: fonts.display,
  fontSize: 22,
  fontWeight: 600,
  color: colors.text,
  marginBottom: 20,
  paddingBottom: 8,
  borderBottom: `1px solid ${colors.border}`,
};

const btnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "7px 14px",
  fontSize: 13,
  fontFamily: "inherit",
  borderRadius: 6,
  cursor: "pointer",
  border: `1px solid ${colors.border}`,
  background: "none",
  color: colors.textSecondary,
  transition: "all 0.15s",
};

const btnSmStyle: React.CSSProperties = { ...btnStyle, padding: "5px 10px", fontSize: 12 };
const btnAccentStyle: React.CSSProperties = { ...btnStyle, background: colors.accent, color: colors.sidebar, borderColor: colors.accent, fontWeight: 600 };
const btnSmAccentStyle: React.CSSProperties = { ...btnSmStyle, background: colors.accent, color: colors.sidebar, borderColor: colors.accent, fontWeight: 600 };
const btnDangerStyle: React.CSSProperties = { ...btnSmStyle, borderColor: "rgba(239,68,68,0.3)", color: colors.danger };
const btnOutlineAccentStyle: React.CSSProperties = { ...btnStyle, borderColor: "rgba(249,190,3,0.3)", color: colors.accent };

// ─── Password match indicator ────────────────────────
function PasswordMatch({ pass, confirm }: { pass: string; confirm: string }) {
  if (!pass && !confirm) return <div style={{ height: 14 }} />;
  if (confirm.length === 0) return <div style={{ height: 14 }} />;
  const match = pass === confirm;
  return (
    <div style={{ fontSize: 11, marginTop: 4, height: 14, color: match ? colors.success : colors.danger }}>
      {match ? "Пароли совпадают" : "Пароли не совпадают"}
    </div>
  );
}

// ─── User Card ──────────────────────────────────────
function UserCard({
  user,
  onSaveName,
  onSavePassword,
  onDelete,
}: {
  user: AdminUser;
  onSaveName: (id: number, name: string) => Promise<void>;
  onSavePassword: (id: number, pass: string) => Promise<void>;
  onDelete: (id: number) => void;
}) {
  const [editMode, setEditMode] = useState<"name" | "password" | null>(null);
  const [nameValue, setNameValue] = useState(user.display_name || user.username);
  const [passValue, setPassValue] = useState("");
  const [passConfirm, setPassConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const isMobile = useIsMobile();

  function closeEdit() {
    setEditMode(null);
    setPassValue("");
    setPassConfirm("");
  }

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.02)",
        border: `1px solid ${colors.border}`,
        borderRadius: 8,
        padding: "16px 20px",
        marginBottom: 8,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: isMobile ? "stretch" : "center",
          justifyContent: "space-between",
          flexDirection: isMobile ? "column" : "row",
          gap: isMobile ? 12 : 0,
          marginBottom: 4,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: isMobile ? "flex-start" : "baseline",
              flexDirection: isMobile ? "column" : "row",
              gap: isMobile ? 6 : 8,
            }}
          >
            <span style={{ fontSize: 16, fontWeight: 500, color: colors.text }}>
              {user.display_name || user.username}
            </span>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <span style={{ fontSize: 12, color: colors.textDim }}>{user.username}</span>
              <span
                style={{
                  display: "inline-block",
                  padding: "2px 10px",
                  fontSize: 11,
                  borderRadius: 10,
                  fontWeight: 500,
                  background: user.role === "admin" ? "rgba(249,190,3,0.1)" : "rgba(255,255,255,0.06)",
                  color: user.role === "admin" ? colors.accent : colors.textDim,
                }}
              >
                {user.role}
              </span>
            </div>
          </div>
          <div style={{ fontSize: 13, color: colors.textDim, marginTop: 2 }}>{user.email || "—"}</div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button style={btnSmStyle} onClick={() => setEditMode(editMode === "name" ? null : "name")}>Имя</button>
          <button style={btnSmStyle} onClick={() => setEditMode(editMode === "password" ? null : "password")}>Пароль</button>
          {user.role !== "admin" && (
            <button style={btnDangerStyle} onClick={() => onDelete(user.id)}>Удалить</button>
          )}
        </div>
      </div>

      {/* Inline edit: name */}
      {editMode === "name" && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${colors.border}` }}>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Отображаемое имя</label>
            <input
              autoFocus
              style={{ ...inputStyle, maxWidth: 320 }}
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { onSaveName(user.id, nameValue); closeEdit(); } if (e.key === "Escape") closeEdit(); }}
            />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              style={btnSmAccentStyle}
              disabled={saving}
              onClick={async () => { setSaving(true); await onSaveName(user.id, nameValue); setSaving(false); closeEdit(); }}
            >
              Сохранить
            </button>
            <button style={btnSmStyle} onClick={closeEdit}>Отмена</button>
          </div>
        </div>
      )}

      {/* Inline edit: password */}
      {editMode === "password" && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${colors.border}` }}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <div style={{ flex: 1, marginBottom: 8 }}>
              <label style={labelStyle}>Новый пароль</label>
              <input
                autoFocus
                type="password"
                autoComplete="new-password"
                style={inputStyle}
                value={passValue}
                onChange={(e) => setPassValue(e.target.value)}
              />
            </div>
            <div style={{ flex: 1, marginBottom: 8 }}>
              <label style={labelStyle}>Повторите</label>
              <input
                type="password"
                autoComplete="new-password"
                style={inputStyle}
                value={passConfirm}
                onChange={(e) => setPassConfirm(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && passValue && passValue === passConfirm) { onSavePassword(user.id, passValue); closeEdit(); } if (e.key === "Escape") closeEdit(); }}
              />
            </div>
          </div>
          <PasswordMatch pass={passValue} confirm={passConfirm} />
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button
              style={{ ...btnSmAccentStyle, opacity: (!passValue || passValue !== passConfirm) ? 0.4 : 1 }}
              disabled={!passValue || passValue !== passConfirm || saving}
              onClick={async () => { setSaving(true); await onSavePassword(user.id, passValue); setSaving(false); closeEdit(); }}
            >
              Сохранить
            </button>
            <button style={btnSmStyle} onClick={closeEdit}>Отмена</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────
export default function AdminPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [settings, setSettings] = useState<SmtpSettings>({});
  const [loading, setLoading] = useState(true);
  const [showNewUser, setShowNewUser] = useState(false);
  const [newUser, setNewUser] = useState({ username: "", displayName: "", email: "", password: "", passwordConfirm: "", role: "reader" });
  const [saving, setSaving] = useState(false);
  const [savedToast, setSavedToast] = useState(false);
  const [smtpStatus, setSmtpStatus] = useState<"none" | "checking" | "ok">("none");
  const [smtpError, setSmtpError] = useState("");
  const [deleteUserId, setDeleteUserId] = useState<number | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/users").then((r) => r.json()),
      fetch("/api/admin/settings").then((r) => r.json()),
    ]).then(([userData, settingsData]) => {
      setUsers(userData.users || []);
      setSettings(settingsData || {});
      setSmtpStatus(settingsData?.smtp_host ? "ok" : "none");
      setLoading(false);
    }).catch((e) => { console.error("Admin load error:", e); setLoading(false); });
  }, []);

  async function saveName(id: number, name: string) {
    await fetch(`/api/admin/users/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: name }),
    });
    setUsers(users.map((u) => u.id === id ? { ...u, display_name: name } : u));
  }

  async function savePassword(id: number, pass: string) {
    await fetch(`/api/admin/users/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pass }),
    });
  }

  async function deleteUser(id: number) {
    setDeleteUserId(id);
  }

  async function confirmDeleteUser() {
    if (!deleteUserId) return;
    const res = await fetch(`/api/admin/users/${deleteUserId}`, { method: "DELETE" });
    if (res.ok) {
      setUsers(users.filter((u) => u.id !== deleteUserId));
    } else {
      const err = await res.json();
      console.error(err.error);
    }
    setDeleteUserId(null);
  }

  async function createUser() {
    if (!newUser.username.trim() || !newUser.password || newUser.password !== newUser.passwordConfirm) return;
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newUser),
    });
    if (res.ok) {
      const data = await res.json();
      setUsers([...users, {
        id: data.id,
        username: newUser.username,
        display_name: newUser.displayName || newUser.username,
        email: newUser.email,
        role: newUser.role,
      }]);
      setNewUser({ username: "", displayName: "", email: "", password: "", passwordConfirm: "", role: "reader" });
      setShowNewUser(false);
    } else {
      const err = await res.json();
      alert(err.error);
    }
  }

  async function saveSettings() {
    setSaving(true);
    setSavedToast(false);
    await fetch("/api/admin/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    setSaving(false);
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 3000);
  }

  if (loading) {
    return (
      <><PageHeader title="Настройки" />
        <div style={{ textAlign: "center", padding: 48, color: colors.textDim }}>Загрузка...</div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Настройки" />

      <div style={{ maxWidth: 640 }}>

        {/* ═══ USERS ═══ */}
        <div style={{ marginBottom: 48 }}>
          <h2 style={sectionTitleStyle}>Пользователи</h2>

          {users.map((u) => (
            <UserCard key={u.id} user={u} onSaveName={saveName} onSavePassword={savePassword} onDelete={deleteUser} />
          ))}

          {showNewUser ? (
            <div
              style={{
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(249,190,3,0.15)",
                borderRadius: 8,
                padding: 20,
                marginTop: 12,
              }}
            >
              <h3 style={{ ...sectionTitleStyle, fontSize: 16, marginBottom: 16, borderBottom: "none", paddingBottom: 0 }}>
                Новый пользователь
              </h3>
              <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Логин</label>
                  <input style={inputStyle} placeholder="username" value={newUser.username} onChange={(e) => setNewUser({ ...newUser, username: e.target.value })} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Отображаемое имя</label>
                  <input style={inputStyle} placeholder="Как показывать" value={newUser.displayName} onChange={(e) => setNewUser({ ...newUser, displayName: e.target.value })} />
                </div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Email</label>
                <input style={inputStyle} type="email" placeholder="user@example.com" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} />
              </div>
              <div style={{ display: "flex", gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Пароль</label>
                  <input style={inputStyle} type="password" autoComplete="new-password" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Повторите</label>
                  <input style={inputStyle} type="password" autoComplete="new-password" value={newUser.passwordConfirm} onChange={(e) => setNewUser({ ...newUser, passwordConfirm: e.target.value })} />
                </div>
                <div style={{ flex: "1 1 100px", minWidth: 100 }}>
                  <label style={labelStyle}>Роль</label>
                  <select
                    style={{ ...inputStyle, appearance: "none", WebkitAppearance: "none", paddingRight: 32, cursor: "pointer", backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23888'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center" }}
                    value={newUser.role}
                    onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                  >
                    <option value="reader" style={{ background: "#16162a", color: "#ccc" }}>reader</option>
                    <option value="admin" style={{ background: "#16162a", color: "#ccc" }}>admin</option>
                  </select>
                </div>
              </div>
              <PasswordMatch pass={newUser.password} confirm={newUser.passwordConfirm} />
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button
                  style={{ ...btnAccentStyle, opacity: (!newUser.username.trim() || !newUser.password || newUser.password !== newUser.passwordConfirm) ? 0.4 : 1 }}
                  disabled={!newUser.username.trim() || !newUser.password || newUser.password !== newUser.passwordConfirm}
                  onClick={createUser}
                >
                  Создать
                </button>
                <button style={btnStyle} onClick={() => setShowNewUser(false)}>Отмена</button>
              </div>
            </div>
          ) : (
            <button style={{ ...btnOutlineAccentStyle, marginTop: 12 }} onClick={() => setShowNewUser(true)}>
              + Добавить пользователя
            </button>
          )}
        </div>

        {/* ═══ APP SETTINGS ═══ */}
        <div style={{ marginBottom: 48 }}>
          <h2 style={sectionTitleStyle}>Приложение</h2>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Название библиотеки</label>
            <input
              style={{ ...inputStyle, maxWidth: 320 }}
              value={settings.app_name || ""}
              onChange={(e) => setSettings({ ...settings, app_name: e.target.value })}
            />
          </div>
        </div>

        {/* ═══ SMTP ═══ */}
        <div style={{ marginBottom: 48 }}>
          <h2 style={sectionTitleStyle}>
            Почта
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                padding: "4px 10px",
                borderRadius: 12,
                marginLeft: 12,
                verticalAlign: "middle",
                background: smtpStatus === "ok" ? "rgba(74,222,128,0.1)" : "rgba(255,255,255,0.04)",
                color: smtpStatus === "ok" ? colors.success : colors.textDim,
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: smtpStatus === "ok" ? colors.success : colors.textDim }} />
              {smtpStatus === "ok" ? "Подключено" : "Не настроено"}
            </span>
          </h2>
          <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>SMTP хост</label>
              <input style={inputStyle} placeholder="smtp.gmail.com" value={settings.smtp_host || ""} onChange={(e) => setSettings({ ...settings, smtp_host: e.target.value })} />
            </div>
            <div style={{ flex: "1 1 100px", minWidth: 100 }}>
              <label style={labelStyle}>Порт</label>
              <input style={inputStyle} value={settings.smtp_port || "587"} onChange={(e) => setSettings({ ...settings, smtp_port: e.target.value })} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Пользователь</label>
              <input style={inputStyle} placeholder="user@gmail.com" value={settings.smtp_user || ""} onChange={(e) => setSettings({ ...settings, smtp_user: e.target.value })} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Пароль</label>
              <input style={inputStyle} type="password" autoComplete="off" value={settings.smtp_pass || ""} onChange={(e) => setSettings({ ...settings, smtp_pass: e.target.value })} />
            </div>
          </div>
          <button
            style={btnSmStyle}
            disabled={smtpStatus === "checking"}
            onClick={async () => {
              setSmtpStatus("checking");
              setSmtpError("");
              // Save settings first
              await fetch("/api/admin/settings", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(settings),
              });
              const res = await fetch("/api/admin/smtp-test", { method: "POST" });
              if (res.ok) {
                setSmtpStatus("ok");
              } else {
                const data = await res.json();
                setSmtpStatus("none");
                setSmtpError(data.error || "Ошибка подключения");
              }
            }}
          >
            {smtpStatus === "checking" ? "Проверяю..." : "Проверить подключение"}
          </button>
          {smtpError && <span style={{ fontSize: 12, color: colors.danger, marginLeft: 8 }}>{smtpError}</span>}
        </div>

        {/* ═══ BACKUP ═══ */}
        <div style={{ marginBottom: 48 }}>
          <h2 style={sectionTitleStyle}>Бэкап</h2>
          <p style={{ fontSize: 13, color: colors.textDim }}>
            Автоматический бэкап в OneDrive ежедневно в 4:00. Настраивается на сервере через rclone + cron.
          </p>
        </div>

        {/* ═══ SAVE ═══ */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, paddingTop: 8 }}>
          <button
            style={{ ...btnAccentStyle, opacity: saving ? 0.5 : 1 }}
            disabled={saving}
            onClick={saveSettings}
          >
            {saving ? "Сохранение..." : "Сохранить настройки"}
          </button>
          {savedToast && (
            <span style={{ fontSize: 13, color: colors.success }}>
              Настройки сохранены
            </span>
          )}
        </div>

      </div>
      {deleteUserId && (
        <ConfirmDialog
          message="Удалить пользователя?"
          onCancel={() => setDeleteUserId(null)}
          onConfirm={confirmDeleteUser}
        />
      )}
    </>
  );
}
