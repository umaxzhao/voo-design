import React from "react";
import { t } from "./i18n.js";
import { captureError, formatReport } from "./error_collector.js";

/**
 * Top-level React error boundary with zh/en copy and sanitized diagnostics.
 */
export class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, showDetails: false, copied: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    captureError({
      error,
      message: error?.message || "react-boundary",
      source: "react-boundary",
    });
    console.error("[VOO] Uncaught rendering exception:", error, errorInfo);
  }

  handleCopy = async () => {
    const report = formatReport({
      app: { name: "VOO Design" },
      error: this.state.error,
      message: this.state.error?.message || "",
      source: "react-boundary",
    });
    try {
      await navigator.clipboard.writeText(report);
      this.setState({ copied: true });
    } catch {
      this.setState({ copied: false });
    }
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    const detail = this.state.error?.message || t("app.error.unknown");
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100%",
          width: "100%",
          boxSizing: "border-box",
          padding: "24px",
          color: "#f4f4f5",
          fontFamily: "var(--font-ui)",
          background: "radial-gradient(ellipse at 50% 42%, #1d2028 0%, #111214 62%)",
        }}
      >
        <section
          role="alert"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            width: "min(100%, 520px)",
            boxSizing: "border-box",
            padding: "36px 32px 28px",
            textAlign: "center",
            background: "rgba(29, 30, 34, 0.82)",
            border: "1px solid rgba(255, 255, 255, 0.09)",
            borderRadius: "16px",
            boxShadow: "0 24px 80px rgba(0, 0, 0, 0.32)",
          }}
        >
          <div
            style={{
              display: "grid",
              placeItems: "center",
              width: "48px",
              height: "48px",
              marginBottom: "20px",
              color: "#ff8585",
              background: "rgba(255, 107, 107, 0.11)",
              border: "1px solid rgba(255, 107, 107, 0.2)",
              borderRadius: "14px",
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 8v5m0 3h.01M10.3 3.9 2.8 17a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3l-7.5-13.1a2 2 0 0 0-3.4 0Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h2 style={{ margin: "0 0 10px", fontSize: "20px", lineHeight: 1.4, fontWeight: 600, letterSpacing: "-0.02em" }}>
            {t("app.error.title")}
          </h2>
          <p style={{ margin: "0 0 24px", maxWidth: "400px", color: "#a1a1aa", fontSize: "14px", lineHeight: 1.7 }}>
            {t("app.error.body")}
          </p>
          <div style={{ display: "flex", justifyContent: "center", gap: "10px", width: "100%", flexWrap: "wrap" }}>
            <button type="button" onClick={() => window.location.reload()} style={btnPrimary}>
              {t("app.error.reload")}
            </button>
            <button
              type="button"
              aria-expanded={this.state.showDetails}
              onClick={() => this.setState((s) => ({ showDetails: !s.showDetails }))}
              style={btnSecondary}
            >
              {t("app.error.details")}
            </button>
            <button type="button" onClick={this.handleCopy} style={btnSecondary}>
              {this.state.copied ? t("app.error.copied") : t("app.error.copyDiagnostics")}
            </button>
          </div>
          {this.state.showDetails ? (
            <pre
              style={{
                width: "100%",
                maxHeight: "160px",
                boxSizing: "border-box",
                overflow: "auto",
                textAlign: "left",
                whiteSpace: "pre-wrap",
                overflowWrap: "anywhere",
                fontSize: "12px",
                lineHeight: 1.6,
                color: "#d4d4d8",
                background: "#151619",
                border: "1px solid #303136",
                padding: "12px 14px",
                borderRadius: "10px",
                margin: "18px 0 0",
              }}
            >
              {detail}
            </pre>
          ) : null}
        </section>
      </div>
    );
  }
}

const btnPrimary = {
  minHeight: "40px",
  padding: "0 18px",
  borderRadius: "9px",
  background: "#3478f6",
  color: "#fff",
  border: "none",
  cursor: "pointer",
  fontSize: "14px",
  fontWeight: 500,
};

const btnSecondary = {
  ...btnPrimary,
  background: "#292a2e",
  border: "1px solid #414247",
  color: "#e4e4e7",
};

export default AppErrorBoundary;
