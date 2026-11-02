import React from "react";
import { t } from "./i18n.js";
import { captureError, formatReport } from "./error_collector.js";
import VooBrandLogo from "../canvas/components/voo_brand_logo.jsx";
import { Button } from "../canvas/components/ui/button.jsx";
import styles from "./app-error-boundary.module.css";

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
      <main className={styles.screen}>
        <section role="alert" aria-labelledby="app-error-title" className={styles.content}>
          <div className={styles.brand} aria-hidden="true">
            <VooBrandLogo className={styles.logo} />
          </div>
          <h1 id="app-error-title" className={styles.title}>
            {t("app.error.title")}
          </h1>
          <p className={styles.description}>{t("app.error.body")}</p>
          <div className={styles.actions}>
            <Button variant="primary" size="lg" className={styles.button}
              onClick={() => window.location.reload()}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M20 7v5h-5M4 17v-5h5M6.1 7a7 7 0 0 1 11.6-1L20 9M4 15l2.3 3A7 7 0 0 0 17.9 17"
                  stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {t("app.error.reload")}
            </Button>
            <Button variant="ghost" size="lg" className={styles.button}
              aria-expanded={this.state.showDetails} aria-controls="app-error-details"
              onClick={() => this.setState((state) => ({ showDetails: !state.showDetails }))}>
              {t("app.error.details")}
              <svg className={styles.chevron} width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="m9 5 7 7-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Button>
          </div>
          <div id="app-error-details" hidden={!this.state.showDetails} className={styles.details}>
            <pre className={styles.message}>{detail}</pre>
            <Button variant="secondary" size="lg" className={styles.button} onClick={this.handleCopy}
              ariaLabel={this.state.copied ? t("app.error.copied") : t("app.error.copyDiagnostics")}>
              <span role="status">
                {this.state.copied ? t("app.error.copied") : t("app.error.copyDiagnostics")}
              </span>
            </Button>
          </div>
        </section>
      </main>
    );
  }
}

export default AppErrorBoundary;
