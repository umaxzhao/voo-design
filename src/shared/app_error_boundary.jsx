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
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          width: "100%",
          backgroundColor: "#121212",
          color: "#f0f0f0",
          fontFamily: "sans-serif",
          padding: "24px",
          textAlign: "center",
        }}
      >
        <h2
          style={{
            fontSize: "20px",
            marginBottom: "12px",
            color: "#ff6b6b",
          }}
        >
          {t("app.error.title")}
        </h2>
        <p
          style={{
            fontSize: "14px",
            color: "#aaa",
            maxWidth: "480px",
            marginBottom: "20px",
          }}
        >
          {t("app.error.body")}
        </p>
        {this.state.showDetails ? (
          <pre
            style={{
              maxWidth: "560px",
              maxHeight: "160px",
              overflow: "auto",
              textAlign: "left",
              fontSize: "12px",
              color: "#ccc",
              background: "#1c1c1c",
              padding: "12px",
              borderRadius: "8px",
              marginBottom: "16px",
            }}
          >
            {detail}
          </pre>
        ) : null}
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "center" }}>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={btnPrimary}
          >
            {t("app.error.reload")}
          </button>
          <button
            type="button"
            onClick={() =>
              this.setState((s) => ({ showDetails: !s.showDetails }))
            }
            style={btnSecondary}
          >
            {t("app.error.details")}
          </button>
          <button type="button" onClick={this.handleCopy} style={btnSecondary}>
            {this.state.copied
              ? t("app.error.copied")
              : t("app.error.copyDiagnostics")}
          </button>
        </div>
      </div>
    );
  }
}

const btnPrimary = {
  padding: "8px 16px",
  borderRadius: "8px",
  backgroundColor: "#2563eb",
  color: "#fff",
  border: "none",
  cursor: "pointer",
  fontSize: "14px",
};

const btnSecondary = {
  ...btnPrimary,
  backgroundColor: "#2a2a2a",
  border: "1px solid #444",
};

export default AppErrorBoundary;
