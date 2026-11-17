import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";

class AuroraStartupBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error("[AURORA startup] React render failed", error, info);
    window.__AURORA_STARTUP_ERROR__ = String(error?.stack || error?.message || error);
  }
  render() {
    if (this.state.error) {
      const detail = String(this.state.error?.message || this.state.error || "Unknown rendering error");
      return React.createElement("main", {
        style: { minHeight: "100vh", boxSizing: "border-box", padding: "28px 22px", background: "#080a12", color: "#f4f5ff", fontFamily: "system-ui, sans-serif" }
      },
        React.createElement("div", { style: { maxWidth: "520px", margin: "12vh auto 0" } },
          React.createElement("div", { style: { color: "#a99aff", fontSize: "13px", letterSpacing: "3px", fontWeight: 700 } }, "AURORA"),
          React.createElement("h1", { style: { fontSize: "25px", margin: "18px 0 8px" } }, "AURORA could not finish starting"),
          React.createElement("p", { style: { color: "#b8bfd0", lineHeight: 1.6 } }, "A startup error was caught instead of leaving the screen blank. Please share this message with support."),
          React.createElement("pre", { style: { whiteSpace: "pre-wrap", overflowWrap: "anywhere", padding: "14px", borderRadius: "12px", background: "#151a29", color: "#ffd7a3", fontSize: "12px" } }, detail),
          React.createElement("button", { onClick: () => window.location.reload(), style: { marginTop: "12px", padding: "12px 18px", border: 0, borderRadius: "10px", background: "#8b7cff", color: "#080a12", fontWeight: 700 } }, "Restart AURORA")
        )
      );
    }
    return this.props.children;
  }
}

const root = createRoot(document.getElementById("root"));
root.render(
  React.createElement(AuroraStartupBoundary, null,
    React.createElement(React.StrictMode, null, React.createElement(App))
  )
);
