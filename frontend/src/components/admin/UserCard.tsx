import { useState } from "react";
import { useIsMobile } from "../../responsive";
import { colors } from "../../theme";
import type { AdminUser } from "@/api/endpoints/admin";
import { inputStyle, labelStyle, btnSmStyle, btnSmAccentStyle, btnDangerStyle, selectStyle, selectOptionStyle } from "./styles";
import PasswordMatch from "./PasswordMatch";

// ─── User Card ──────────────────────────────────────
export default function UserCard({
  user,
  currentUserId,
  onSaveName,
  onSavePassword,
  onSaveRole,
  onDelete,
}: Readonly<{
  user: AdminUser;
  currentUserId: number;
  onSaveName: (id: number, name: string) => Promise<void>;
  onSavePassword: (id: number, pass: string) => Promise<void>;
  onSaveRole: (id: number, role: "admin" | "reader") => Promise<void>;
  onDelete: (id: number) => void;
}>) {
  const [editMode, setEditMode] = useState<"name" | "password" | "role" | null>(null);
  const [nameValue, setNameValue] = useState(user.displayName || user.username);
  const [passValue, setPassValue] = useState("");
  const [passConfirm, setPassConfirm] = useState("");
  const [roleValue, setRoleValue] = useState<"admin" | "reader">(user.role);
  const [saving, setSaving] = useState(false);
  const isMobile = useIsMobile();

  function closeEdit() {
    setEditMode(null);
    setPassValue("");
    setPassConfirm("");
    setRoleValue(user.role);
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
              {user.displayName || user.username}
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
          {user.id !== currentUserId && (
            <button style={btnSmStyle} onClick={() => setEditMode(editMode === "role" ? null : "role")}>Роль</button>
          )}
          {user.id !== currentUserId && (
            <button style={btnDangerStyle} onClick={() => onDelete(user.id)}>Удалить</button>
          )}
        </div>
      </div>

      {/* Inline edit: name */}
      {editMode === "name" && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${colors.border}` }}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block" }}>
              <span style={labelStyle}>Отображаемое имя</span>
              <input
                autoFocus
                style={{ ...inputStyle, maxWidth: 320 }}
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { onSaveName(user.id, nameValue); closeEdit(); } if (e.key === "Escape") closeEdit(); }}
              />
            </label>
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
              <label style={{ display: "block" }}>
                <span style={labelStyle}>Новый пароль</span>
                <input
                  autoFocus
                  type="password"
                  autoComplete="new-password"
                  style={inputStyle}
                  value={passValue}
                  onChange={(e) => setPassValue(e.target.value)}
                />
              </label>
            </div>
            <div style={{ flex: 1, marginBottom: 8 }}>
              <label style={{ display: "block" }}>
                <span style={labelStyle}>Повторите</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  style={inputStyle}
                  value={passConfirm}
                  onChange={(e) => setPassConfirm(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && passValue && passValue === passConfirm) { onSavePassword(user.id, passValue); closeEdit(); } if (e.key === "Escape") closeEdit(); }}
                />
              </label>
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

      {/* Inline edit: role */}
      {editMode === "role" && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${colors.border}` }}>
          <div style={{ marginBottom: 16, maxWidth: 200 }}>
            <label style={{ display: "block" }}>
              <span style={labelStyle}>Роль</span>
              <select
                autoFocus
                style={selectStyle}
                value={roleValue}
                onChange={(e) => setRoleValue(e.target.value as "admin" | "reader")}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { onSaveRole(user.id, roleValue); closeEdit(); }
                  if (e.key === "Escape") closeEdit();
                }}
              >
                <option value="reader" style={selectOptionStyle}>reader</option>
                <option value="admin" style={selectOptionStyle}>admin</option>
              </select>
            </label>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              style={btnSmAccentStyle}
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                await onSaveRole(user.id, roleValue);
                setSaving(false);
                closeEdit();
              }}
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
