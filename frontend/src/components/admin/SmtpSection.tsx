import { colors } from "../../theme";
import type { UseAdminSmtpResult } from "../../hooks/useAdminSmtp";
import { inputStyle, labelStyle, sectionTitleStyle, btnSmStyle } from "./styles";

// ─── SMTP ────────────────────────────────────────────
export default function SmtpSection({ smtp }: Readonly<{ smtp: UseAdminSmtpResult }>) {
  const { settings, setField, smtpStatus, smtpError, testConnection } = smtp;

  return (
    <div style={{ marginBottom: 48 }}>
      <h2 style={sectionTitleStyle}>
        Почта
        {" "}
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
          <label style={{ display: "block" }}>
            <span style={labelStyle}>SMTP хост</span>
            <input style={inputStyle} placeholder="smtp.gmail.com" value={settings.smtpHost || ""} onChange={(e) => setField("smtpHost", e.target.value)} />
          </label>
        </div>
        <div style={{ flex: "1 1 100px", minWidth: 100 }}>
          <label style={{ display: "block" }}>
            <span style={labelStyle}>Порт</span>
            <input style={inputStyle} value={settings.smtpPort || "587"} onChange={(e) => setField("smtpPort", e.target.value)} />
          </label>
        </div>
      </div>
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ flex: 1 }}>
          <label style={{ display: "block" }}>
            <span style={labelStyle}>Пользователь</span>
            <input style={inputStyle} placeholder="user@gmail.com" value={settings.smtpUser || ""} onChange={(e) => setField("smtpUser", e.target.value)} />
          </label>
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ display: "block" }}>
            <span style={labelStyle}>Пароль</span>
            <input style={inputStyle} type="password" autoComplete="off" value={settings.smtpPass || ""} onChange={(e) => setField("smtpPass", e.target.value)} />
          </label>
        </div>
      </div>
      <button
        style={btnSmStyle}
        disabled={smtpStatus === "checking"}
        onClick={testConnection}
      >
        {smtpStatus === "checking" ? "Проверяю..." : "Проверить подключение"}
      </button>
      {smtpError && <span style={{ fontSize: 12, color: colors.danger, marginLeft: 8 }}>{smtpError}</span>}
    </div>
  );
}
