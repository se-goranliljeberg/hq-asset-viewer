import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { getRouter } from "./router";
import "./styles.css";

const showFileProtocolError = (details: string) => {
  if (window.location.protocol !== "file:") {
    return;
  }

  const root = document.getElementById("root");
  if (!root) {
    return;
  }

  root.innerHTML = `
    <div style="font-family:system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;padding:24px;max-width:900px;margin:0 auto;white-space:pre-wrap;">
      <h1 style="font-size:20px;margin:0 0 12px;">HQ Asset Viewer failed to load</h1>
      <p style="margin:0 0 8px;">An error occurred while opening this file directly from disk.</p>
      <pre style="margin:0;padding:12px;background:#f6f6f6;border:1px solid #ddd;border-radius:6px;overflow:auto;">${details}</pre>
    </div>
  `;
};

if (window.location.protocol === "file:") {
  window.addEventListener("error", (event) => {
    const message =
      event.error instanceof Error
        ? event.error.stack || event.error.message
        : event.message || "Unknown error";
    showFileProtocolError(message);
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const message =
      reason instanceof Error
        ? reason.stack || reason.message
        : typeof reason === "string"
          ? reason
          : JSON.stringify(reason);
    showFileProtocolError(`Unhandled promise rejection:\n${message}`);
  });
}

const router = getRouter();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
