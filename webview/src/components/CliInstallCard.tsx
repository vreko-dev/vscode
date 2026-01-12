/**
 * @module CliInstallCard
 * @description CLI installation card for the dashboard
 *
 * Shows CLI installation status and provides one-click installation.
 * Communicates with extension host via postMessage to trigger terminal installation.
 */

import { Alert, Badge, Button, Card } from "@snapback/ui";
import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { getVSCodeAPI } from "../vscode-api";

// =============================================================================
// Types
// =============================================================================

interface CliInstallStatus {
	status: "unknown" | "checking" | "not-installed" | "installing" | "installed";
	version: string | null;
	packageManager: "npm" | "pnpm" | "yarn" | "bun" | null;
	error: string | null;
}

interface CliInstallCardProps {
	/** Called when CLI is successfully installed */
	onInstalled?: (version: string) => void;
	/** Additional Tailwind class names */
	className?: string;
	/** Whether to auto-check status on mount (default: true) */
	autoCheck?: boolean;
}

// =============================================================================
// Component
// =============================================================================

export const CliInstallCard: React.FC<CliInstallCardProps> = ({
	onInstalled,
	className,
	autoCheck = true,
}) => {
	const [state, setState] = useState<CliInstallStatus>({
		status: "unknown",
		version: null,
		packageManager: null,
		error: null,
	});

	const vscode = getVSCodeAPI();

	// ==========================================================================
	// Message Listener
	// ==========================================================================

	useEffect(() => {
		const handler = (event: MessageEvent) => {
			const message = event.data;

			switch (message.type) {
				case "cli:status":
					setState((s) => ({
						...s,
						status: message.payload.installed ? "installed" : "not-installed",
						version: message.payload.version,
						packageManager: message.payload.packageManager,
						error: null,
					}));
					if (message.payload.installed && message.payload.version && onInstalled) {
						onInstalled(message.payload.version);
					}
					break;

				case "cli:installStarted":
					setState((s) => ({ ...s, status: "installing", error: null }));
					break;

				case "cli:installComplete":
					setState((s) => ({
						...s,
						status: "installed",
						version: message.payload.version,
						error: null,
					}));
					if (message.payload.version && onInstalled) {
						onInstalled(message.payload.version);
					}
					break;

				case "cli:error":
					setState((s) => ({
						...s,
						status: "not-installed",
						error: message.payload.message,
					}));
					break;
			}
		};

		window.addEventListener("message", handler);
		return () => window.removeEventListener("message", handler);
	}, [onInstalled]);

	// ==========================================================================
	// Actions
	// ==========================================================================

	const checkStatus = useCallback(() => {
		setState((s) => ({ ...s, status: "checking", error: null }));
		vscode.postMessage({ type: "cli:checkStatus" });
	}, [vscode]);

	const install = useCallback(() => {
		vscode.postMessage({ type: "cli:install" });
	}, [vscode]);

	const openDocs = useCallback(() => {
		vscode.postMessage({ type: "cli:openDocs" });
	}, [vscode]);

	const clearError = useCallback(() => {
		setState((s) => ({ ...s, error: null }));
	}, []);

	// ==========================================================================
	// Auto-check on mount
	// ==========================================================================

	useEffect(() => {
		if (autoCheck) {
			checkStatus();
		}
	}, [autoCheck, checkStatus]);

	// ==========================================================================
	// Render Helpers
	// ==========================================================================

	const renderBadge = () => {
		if (state.status === "checking") {
			return null;
		}

		if (state.status === "installed") {
			return (
				<Badge className="bg-[#4ADE80]/15 text-[#4ADE80] text-xs px-2 py-1 rounded">
					✓ v{state.version}
				</Badge>
			);
		}

		if (state.status === "installing") {
			return (
				<Badge className="bg-yellow-900/30 text-yellow-400 text-xs px-2 py-1 rounded">
					Installing...
				</Badge>
			);
		}

		return (
			<Badge className="bg-zinc-800 text-zinc-400 text-xs px-2 py-1 rounded">
				Not Installed
			</Badge>
		);
	};

	const renderContent = () => {
		// Checking state
		if (state.status === "checking" || state.status === "unknown") {
			return (
				<div className="text-sm text-zinc-500">
					<div className="flex items-center gap-2">
						<div className="animate-spin h-4 w-4 border-2 border-zinc-600 border-t-zinc-400 rounded-full" />
						Checking CLI status...
					</div>
				</div>
			);
		}

		// Error state
		if (state.error) {
			return (
				<>
					<Alert className="mb-3 text-sm text-red-400 bg-red-900/20 border border-red-800 rounded p-2">
						{state.error}
					</Alert>
					<div className="flex gap-2">
						<Button onClick={() => { clearError(); install(); }} size="sm" className="flex-1">
							Retry Install
						</Button>
						<Button onClick={checkStatus} variant="outline" size="sm">
							Check Again
						</Button>
					</div>
				</>
			);
		}

		// Installed state
		if (state.status === "installed") {
			return (
				<>
					<p className="text-sm text-zinc-400 mb-3">
						SnapBack CLI is installed and ready. Run commands from the terminal.
					</p>
					<Button onClick={openDocs} variant="outline" size="sm" className="w-full">
						View CLI Documentation →
					</Button>
				</>
			);
		}

		// Installing state
		if (state.status === "installing") {
			return (
				<>
					<div className="text-sm text-zinc-400 mb-3 flex items-center gap-2">
						<div className="animate-spin h-4 w-4 border-2 border-[#4ADE80] border-t-transparent rounded-full" />
						Installing... Check the terminal for progress.
					</div>
					<Button onClick={checkStatus} variant="outline" size="sm" className="w-full">
						Check if Complete
					</Button>
				</>
			);
		}

		// Not installed state
		return (
			<>
				<p className="text-sm text-zinc-400 mb-3">
					Install the CLI for advanced features like workspace configuration and CI/CD integration.
				</p>
				<Button
					onClick={install}
					className="w-full bg-[#4ADE80] hover:bg-[#22C55E] text-zinc-950 font-medium"
					size="sm"
				>
					Install with {state.packageManager || "npm"}
				</Button>
			</>
		);
	};

	// ==========================================================================
	// Render
	// ==========================================================================

	// Don't render if installed (optional - remove this to always show card)
	// if (state.status === 'installed') {
	//   return null;
	// }

	return (
		<Card className={`border border-zinc-800 bg-zinc-900 ${className || ""}`}>
			<div className="p-4">
				<div className="flex items-start justify-between mb-3">
					<div>
						<h3 className="text-sm font-medium text-zinc-100">📦 SnapBack CLI</h3>
						<p className="text-xs text-zinc-500 mt-1">
							Global CLI tool for advanced operations
						</p>
					</div>
					{renderBadge()}
				</div>

				{renderContent()}
			</div>
		</Card>
	);
};

export default CliInstallCard;
