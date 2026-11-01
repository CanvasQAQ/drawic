import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "../App";
import { applyThemeToDocument, resolveInitialTheme } from "../theme";
import { createPreviewBridge } from "./bridge";
import "../styles.css";
import "./styles.css";

applyThemeToDocument(resolveInitialTheme());
const root = document.getElementById("root")!;
const notice = document.createElement("div");
notice.setAttribute("role", "status");
notice.className = "preview-mode-notice";
notice.textContent = "预览模式 · 示例数据仅在此页面内使用；文件与窗口操作不会触及真实数据。";
document.body.appendChild(notice);
window.drawic = createPreviewBridge((message) => { notice.textContent = message; });
createRoot(root).render(<StrictMode><App /></StrictMode>);
