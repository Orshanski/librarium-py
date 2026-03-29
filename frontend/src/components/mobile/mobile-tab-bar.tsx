import { Link, useLocation } from "react-router-dom";
import { colors, layout } from "../../theme";
import { navItems } from "../sidebar";

export default function MobileTabBar() {
  const pathname = useLocation().pathname;

  return (
    <nav
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        height: layout.mobileBottomBarHeight,
        backgroundColor: colors.sidebar,
        borderTop: `1px solid ${colors.border}`,
        display: "grid",
        gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
        zIndex: 35,
      }}
    >
      {navItems.map((item) => {
        const path = item.href.split("?")[0];
        const active = path === "/" ? pathname === "/" : pathname.startsWith(path);
        return (
          <Link
            key={item.href}
            to={item.href}
            style={{
              textDecoration: "none",
              color: active ? colors.accent : colors.textDim,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 12,
              fontWeight: 500,
              padding: "8px 6px",
            }}
          >
            {item.shortLabel || item.label}
          </Link>
        );
      })}
    </nav>
  );
}
