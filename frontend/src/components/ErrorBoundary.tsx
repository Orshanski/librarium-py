import { Component, ReactNode } from "react";
import { colors } from "../theme";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          gap: 16,
          padding: 32,
          color: colors.text,
          textAlign: "center",
        }}>
          <div style={{ fontSize: 18 }}>Не удалось открыть книгу</div>
          <div style={{ fontSize: 13, color: colors.textDim, maxWidth: 400 }}>
            {this.state.error?.message}
          </div>
          <button
            onClick={() => window.history.back()}
            style={{
              background: "none",
              border: `1px solid ${colors.border}`,
              borderRadius: 6,
              padding: "8px 20px",
              fontSize: 14,
              fontFamily: "inherit",
              color: colors.text,
              cursor: "pointer",
            }}
          >
            Назад
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
