"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global-error]", error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, padding: 0 }}>
        <div
          style={{
            display: "flex",
            minHeight: "100vh",
            alignItems: "center",
            justifyContent: "center",
            padding: "2rem",
          }}
        >
          <div style={{ maxWidth: "480px", textAlign: "center" }}>
            <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem" }}>
              Application Error
            </h1>
            <p style={{ color: "#666", marginBottom: "1.5rem" }}>
              A critical error occurred. Please try refreshing the page.
            </p>
            <p
              style={{
                fontFamily: "monospace",
                fontSize: "0.875rem",
                color: "#999",
                background: "#f5f5f5",
                padding: "0.75rem",
                borderRadius: "6px",
                marginBottom: "1.5rem",
              }}
            >
              {error.message || "Unknown error"}
              {error.digest && (
                <span style={{ display: "block", marginTop: "0.25rem", fontSize: "0.75rem" }}>
                  Error ID: {error.digest}
                </span>
              )}
            </p>
            <button
              onClick={() => reset()}
              style={{
                padding: "0.625rem 1.5rem",
                fontSize: "0.875rem",
                fontWeight: 500,
                background: "#1b3a4b",
                color: "white",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
              }}
            >
              Try Again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
