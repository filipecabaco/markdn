import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

// The Mac shell hides the native title bar, so the header stands in for it and
// insets past the traffic lights (.is-desktop in styles.css). The shell exposes
// its API to this page, which is how it is told apart from a browser; the same
// shell on iPhone and iPad reports a touch screen, and has no traffic lights.
if ("__TAURI__" in window && navigator.maxTouchPoints === 0) {
  document.documentElement.classList.add("is-desktop");
}

const container = document.getElementById("root");
if (!container) throw new Error("#root is missing from index.html");

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
