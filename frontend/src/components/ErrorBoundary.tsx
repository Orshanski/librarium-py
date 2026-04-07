import { Component, ReactNode } from "react";
import { colors } from "../theme";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  title?: string;
  backLabel?: string;
}

interface State {
  hasError: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
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
          <div style={{ fontSize: 18 }}>{this.props.title || "Something went wrong"}</div>
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
            {this.props.backLabel || "Back"}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
