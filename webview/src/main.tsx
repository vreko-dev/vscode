import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./index.css";
import { getVSCodeAPI } from "./vscode-api";

// Get VS Code API for sending debug messages
const vscodeAPI = getVSCodeAPI();

// Helper to send debug info to extension
function sendDebug(phase: string, message: string, data?: unknown) {
	console.log(`[WEBVIEW] ${phase}: ${message}`, data);
	vscodeAPI?.postMessage({
		type: "debug",
		phase,
		message,
		elapsed: Math.round(performance.now()),
		data: data ? JSON.stringify(data) : undefined,
	});
}

// Global error handlers to catch crashes
window.onerror = (message, source, lineno, colno, error) => {
	sendDebug("ERROR", `Uncaught: ${message}`, { source, lineno, colno, stack: error?.stack });
	return false; // Don't prevent default handling
};

window.addEventListener("unhandledrejection", (event) => {
	sendDebug("PROMISE_ERROR", `Unhandled rejection: ${event.reason}`, {
		reason: String(event.reason),
		stack: event.reason?.stack,
	});
});

sendDebug("INIT", "main.tsx executing");

const root = document.getElementById("root");
if (!root) {
	sendDebug("ERROR", "Root element not found");
	throw new Error("Root element not found");
}

sendDebug("INIT", "Creating React root");

try {
	createRoot(root).render(
		<React.StrictMode>
			<ErrorBoundary>
				<App />
			</ErrorBoundary>
		</React.StrictMode>,
	);
	sendDebug("INIT", "React render called");
} catch (err) {
	sendDebug("ERROR", "React render failed", { error: String(err), stack: (err as Error)?.stack });
	throw err;
}
