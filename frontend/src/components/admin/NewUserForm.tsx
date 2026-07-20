import { useState } from "react";
import type { NewUserData } from "../../hooks/useAdminUsers";
import {
  inputStyle, labelStyle, sectionTitleStyle,
  btnStyle, btnAccentStyle, btnOutlineAccentStyle,
  selectStyle, selectOptionStyle,
} from "./styles";
import PasswordMatch from "./PasswordMatch";

// ─── Types ──────────────────────────────────────────
interface NewUserState {
  username: string;
  displayName: string;
  email: string;
  password: string;
  passwordConfirm: string;
  role: "admin" | "reader";
}

const EMPTY_NEW_USER: NewUserState = { username: "", displayName: "", email: "", password: "", passwordConfirm: "", role: "reader" };

// ─── New user form ──────────────────────────────────
export default function NewUserForm({ onCreate }: Readonly<{ onCreate: (data: NewUserData) => Promise<void> }>) {
  const [showNewUser, setShowNewUser] = useState(false);
  const [newUser, setNewUser] = useState<NewUserState>(EMPTY_NEW_USER);

  const canCreate = !!newUser.username.trim() && !!newUser.password && newUser.password === newUser.passwordConfirm;

  async function handleCreateUser() {
    if (!canCreate) return;
    try {
      await onCreate({
        username: newUser.username,
        password: newUser.password,
        role: newUser.role,
        displayName: newUser.displayName || undefined,
        email: newUser.email || undefined,
      });
      setNewUser(EMPTY_NEW_USER);
      setShowNewUser(false);
    } catch {
      // ошибка уже обработана в onCreate (alert); форма остаётся открытой
    }
  }

  if (!showNewUser) {
    return (
      <button style={{ ...btnOutlineAccentStyle, marginTop: 12 }} onClick={() => setShowNewUser(true)}>
        + Добавить пользователя
      </button>
    );
  }

  return (
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
          <label style={{ display: "block" }}>
            <span style={labelStyle}>Логин</span>
            <input style={inputStyle} placeholder="username" value={newUser.username} onChange={(e) => setNewUser({ ...newUser, username: e.target.value })} />
          </label>
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ display: "block" }}>
            <span style={labelStyle}>Отображаемое имя</span>
            <input style={inputStyle} placeholder="Как показывать" value={newUser.displayName} onChange={(e) => setNewUser({ ...newUser, displayName: e.target.value })} />
          </label>
        </div>
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: "block" }}>
          <span style={labelStyle}>Email</span>
          <input style={inputStyle} type="email" placeholder="user@example.com" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} />
        </label>
      </div>
      <div style={{ display: "flex", gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
        <div style={{ flex: 1 }}>
          <label style={{ display: "block" }}>
            <span style={labelStyle}>Пароль</span>
            <input style={inputStyle} type="password" autoComplete="new-password" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} />
          </label>
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ display: "block" }}>
            <span style={labelStyle}>Повторите</span>
            <input style={inputStyle} type="password" autoComplete="new-password" value={newUser.passwordConfirm} onChange={(e) => setNewUser({ ...newUser, passwordConfirm: e.target.value })} />
          </label>
        </div>
        <div style={{ flex: "1 1 100px", minWidth: 100 }}>
          <label style={{ display: "block" }}>
            <span style={labelStyle}>Роль</span>
            <select
              style={selectStyle}
              value={newUser.role}
              onChange={(e) => setNewUser({ ...newUser, role: e.target.value as "admin" | "reader" })}
            >
              <option value="reader" style={selectOptionStyle}>reader</option>
              <option value="admin" style={selectOptionStyle}>admin</option>
            </select>
          </label>
        </div>
      </div>
      <PasswordMatch pass={newUser.password} confirm={newUser.passwordConfirm} />
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button
          style={{ ...btnAccentStyle, opacity: canCreate ? 1 : 0.4 }}
          disabled={!canCreate}
          onClick={handleCreateUser}
        >
          Создать
        </button>
        <button style={btnStyle} onClick={() => setShowNewUser(false)}>Отмена</button>
      </div>
    </div>
  );
}
