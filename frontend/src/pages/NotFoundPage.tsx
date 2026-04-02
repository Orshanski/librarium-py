import { Link } from "react-router-dom";
import { colors, fonts } from "../theme";

export default function NotFoundPage() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1, minHeight: "60vh" }}>
      <div style={{ textAlign: "center", padding: "40px" }}>
        <div style={{ fontFamily: fonts.display, fontSize: 120, fontWeight: 600, color: colors.accent, lineHeight: 1, letterSpacing: -4 }}>
          404
        </div>
        <div style={{ width: 48, height: 2, background: colors.accent, opacity: 0.4, margin: "16px auto 20px" }} />
        <div style={{ fontFamily: fonts.display, fontSize: 26, color: colors.text, marginBottom: 10 }}>
          Страница не найдена
        </div>
        <div style={{ fontSize: 14, color: colors.textDim, lineHeight: 1.6, marginBottom: 36 }}>
          Такой страницы не существует<br />или она была удалена
        </div>
        <Link
          to="/"
          style={{
            display: "inline-block",
            background: colors.accent,
            color: "#16162a",
            fontFamily: fonts.body,
            fontSize: 14,
            fontWeight: 500,
            padding: "10px 28px",
            borderRadius: 6,
            textDecoration: "none",
          }}
        >
          В каталог
        </Link>
      </div>
    </div>
  );
}
