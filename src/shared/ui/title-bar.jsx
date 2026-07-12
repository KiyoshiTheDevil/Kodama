import { useEffect, useState } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

import { Minus, X } from "../../icons.jsx";

const appWindow = getCurrentWebviewWindow();

// Windows-only custom window controls (minimize / maximize-restore / close). macOS uses its
// native titlebar, so App only mounts this on non-mac, non-fullscreen.
export function TitleBar() {
  const [maximized, setMaximized] = useState(false);
  const [hoveredBtn, setHoveredBtn] = useState(null);

  useEffect(() => {
    let cancel = false;
    const check = () =>
      appWindow.isMaximized().then((v) => {
        if (!cancel) setMaximized(v);
      });
    check();
    const unlisten = appWindow.onResized(() => check());
    return () => {
      cancel = true;
      unlisten.then((fn) => fn());
    };
  }, []);

  const btnBase = {
    background: "none",
    border: "none",
    cursor: "default",
    width: 36,
    height: 28,
    borderRadius: 5,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    transition: "background 0.12s",
    color: "rgba(255,255,255,0.75)",
  };

  const buttons = [
    {
      id: "min",
      action: () => appWindow.minimize(),
      hover: "rgba(255,255,255,0.10)",
      icon: <Minus size={10} />,
    },
    {
      id: "max",
      action: () => appWindow.toggleMaximize(),
      hover: "rgba(255,255,255,0.10)",
      icon: maximized ? (
        // Restore icon — two overlapping squares
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
        >
          <rect x="2" y="0" width="8" height="8" rx="0.5" />
          <path d="M0 2v7a1 1 0 0 0 1 1h7" />
        </svg>
      ) : (
        // Maximize icon — single square
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
        >
          <rect x="0.5" y="0.5" width="9" height="9" rx="0.5" />
        </svg>
      ),
    },
    {
      id: "close",
      action: () => appWindow.close(),
      hover: "#c42b1c",
      icon: <X size={10} />,
    },
  ];

  return (
    <div
      style={{
        height: 32,
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        padding: "0 8px",
        position: "fixed",
        top: 4,
        left: 0,
        right: 0,
        zIndex: 9998,
        pointerEvents: "none",
      }}
    >
      <div
        data-tauri-drag-region
        style={{
          position: "absolute",
          top: 0,
          left: 80,
          right: 80,
          bottom: 0,
          pointerEvents: "all",
        }}
      />
      <div style={{ display: "flex", gap: 2, position: "relative", pointerEvents: "all" }}>
        {buttons.map((btn) => (
          <button
            key={btn.id}
            onClick={(e) => {
              e.stopPropagation();
              btn.action();
            }}
            onMouseEnter={() => setHoveredBtn(btn.id)}
            onMouseLeave={() => setHoveredBtn(null)}
            style={{
              ...btnBase,
              background: hoveredBtn === btn.id ? btn.hover : "none",
              color:
                hoveredBtn === btn.id && btn.id === "close" ? "#fff" : "rgba(255,255,255,0.75)",
            }}
          >
            {btn.icon}
          </button>
        ))}
      </div>
    </div>
  );
}
