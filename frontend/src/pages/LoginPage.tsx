import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { colors, fonts } from "../theme";

const inputStyle: React.CSSProperties = {
  width: "100%",
  backgroundColor: "rgba(255, 255, 255, 0.06)",
  border: `1px solid ${colors.border}`,
  borderRadius: 6,
  padding: "10px 14px",
  fontSize: 15,
  color: colors.text,
  outline: "none",
  boxSizing: "border-box",
  fontFamily: "inherit",
};

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const err = await login(username, password);

    setLoading(false);

    if (err) {
      setError("Неверное имя пользователя или пароль");
    } else {
      sessionStorage.clear();
      navigate("/");
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.bg,
      }}
    >
      <div style={{ width: 340 }}>
        <h1
          style={{
            fontFamily: fonts.display,
            fontSize: 36,
            fontWeight: 700,
            color: colors.accent,
            textAlign: "center",
            marginBottom: 32,
          }}
        >
          Librarium
        </h1>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <input
              style={inputStyle}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Имя пользователя"
              autoComplete="username"
              autoFocus
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <input
              style={inputStyle}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Пароль"
              autoComplete="current-password"
            />
          </div>

          {error && (
            <div style={{ fontSize: 13, color: colors.danger, marginBottom: 16 }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "10px 0",
              fontSize: 15,
              fontFamily: "inherit",
              fontWeight: 600,
              borderRadius: 6,
              border: "none",
              backgroundColor: colors.accent,
              color: colors.sidebar,
              cursor: loading ? "wait" : "pointer",
            }}
          >
            {loading ? "..." : "Войти"}
          </button>
        </form>
      </div>
    </div>
  );
}
