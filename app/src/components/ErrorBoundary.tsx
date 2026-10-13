import { Component, type ReactNode } from "react";

export default class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) { console.error("UI crash", error); }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="crash">
        <h1>Something snagged.</h1>
        <p>We hit an unexpected problem. Your data is safe.</p>
        <button className="btn primary" onClick={() => window.location.reload()}>Reload Tailor IT</button>
      </div>
    );
  }
}
