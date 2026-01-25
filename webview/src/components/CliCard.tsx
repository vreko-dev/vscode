/**
 * @module CliCard
 * @description Enhanced CLI card component with npx-first execution strategy
 *
 * Displays CLI execution status and provides one-click command execution.
 * Automatically probes host environment and selects optimal execution strategy.
 */

import { Alert, Badge, Button, Card } from "@snapback/ui/components";
import type React from "react";
import { useEffect } from "react";
import { useCliEnvironment } from "../hooks/useCliEnvironment";

// =============================================================================
// Types
// =============================================================================

interface CliCardProps {
	/** Callback when CLI command is successfully executed */
	onCommandExecuted?: (command: string) => void;
	/** Automatically probe environment on mount (default: true) */
	autoProbe?: boolean;
	/** Additional Tailwind class names for styling */
	className?: string;
}

// =============================================================================
// Component
// =============================================================================

export const CliCard: React.FC<CliCardProps> = ({ onCommandExecuted, autoProbe = true, className }) => {
	const { environment, status, error, canRunCli, strategy, commandPrefix, getEnvironment, runCommand, clearError } =
		useCliEnvironment();

	// Auto-probe on mount if enabled
	useEffect(() => {
		if (autoProbe) {
			getEnvironment();
		}
	}, [autoProbe, getEnvironment]);

	// ==========================================================================
	// Event Handlers
	// ==========================================================================

	const handleRunInit = () => {
		clearError();
		runCommand("init");
		if (onCommandExecuted) {
			onCommandExecuted("init");
		}
	};

	const handleRetry = () => {
		clearError();
		getEnvironment();
	};

	// ==========================================================================
	// Render Helpers
	// ==========================================================================

	const renderBadge = () => {
		if (status === "probing") {
			return null; // Hide badge while probing
		}

		if (strategy === "global") {
			return <Badge className="bg-[#4ADE80]/15 text-[#4ADE80] text-xs px-2 py-1 rounded">✓ Installed</Badge>;
		}

		if (strategy === "bunx") {
			return <Badge className="bg-[#6EE7A7]/15 text-[#6EE7A7] text-xs px-2 py-1 rounded">via bunx</Badge>;
		}

		if (strategy === "npx") {
			return <Badge className="bg-zinc-700 text-zinc-300 text-xs px-2 py-1 rounded">via npx</Badge>;
		}

		if (status === "unavailable") {
			return <Badge className="bg-red-900/30 text-red-400 text-xs px-2 py-1 rounded">Setup Required</Badge>;
		}

		return <Badge className="bg-zinc-800 text-zinc-400 text-xs px-2 py-1 rounded">Optional</Badge>;
	};

	const renderContent = () => {
		// Probing state
		if (status === "probing") {
			return (
				<div className="text-sm text-zinc-500">
					<div className="flex items-center gap-2">
						<div className="animate-spin h-4 w-4 border-2 border-zinc-600 border-t-zinc-400 rounded-full" />
						Checking environment...
					</div>
				</div>
			);
		}

		// Error state
		if (error) {
			return (
				<>
					<Alert className="mb-3 text-sm text-red-400 bg-red-900/20 border border-red-800 rounded p-2">
						{error}
					</Alert>
					<Button onClick={handleRetry} className="w-full" size="sm">
						Retry
					</Button>
				</>
			);
		}

		// Running state
		if (status === "running") {
			return (
				<>
					<div className="text-sm text-zinc-400 mb-3 flex items-center gap-2">
						<div className="animate-spin h-4 w-4 border-2 border-[#4ADE80] border-t-transparent rounded-full" />
						Running command...
					</div>
					<Button disabled className="w-full bg-zinc-700 text-zinc-400" size="sm">
						Running...
					</Button>
				</>
			);
		}

		// Unavailable state
		if (status === "unavailable") {
			return (
				<>
					<p className="text-sm text-zinc-400 mb-3">
						Node.js or Bun is required to execute CLI commands. Please install one of them to continue.
					</p>
					<a
						href="https://nodejs.org"
						target="_blank"
						rel="noopener noreferrer"
						className="text-sm text-[#4ADE80] hover:text-[#6EE7A7] transition-colors"
					>
						View Setup Guide →
					</a>
				</>
			);
		}

		// Ready state
		if (status === "ready" && canRunCli) {
			return (
				<>
					<p className="text-sm text-zinc-400 mb-3">
						Ready to execute CLI commands {commandPrefix && `using ${commandPrefix}`}. Run snapback init to
						get started.
					</p>
					<Button
						onClick={handleRunInit}
						className="w-full bg-[#4ADE80] hover:bg-[#22C55E] text-zinc-950 font-medium"
						size="sm"
					>
						Run snapback init
					</Button>
				</>
			);
		}

		// Unknown state (fallback)
		return <p className="text-sm text-zinc-500">Loading...</p>;
	};

	// ==========================================================================
	// Render
	// ==========================================================================

	return (
		<Card className={`border border-zinc-800 bg-zinc-900 ${className || ""}`}>
			<div className="p-4">
				<div className="flex items-start justify-between mb-3">
					<div>
						<h3 className="text-sm font-medium text-zinc-100">SnapBack CLI</h3>
						<p className="text-xs text-zinc-500 mt-1">
							Execute CLI commands directly from VS Code without installation
						</p>
					</div>
					{renderBadge()}
				</div>

				{renderContent()}

				{/* Debug info (only in development) */}
				{process.env.NODE_ENV === "development" && environment && (
					<details className="mt-3 text-xs text-zinc-600">
						<summary className="cursor-pointer hover:text-zinc-500">Debug Info</summary>
						<pre className="mt-2 p-2 bg-zinc-950 rounded overflow-x-auto">
							{JSON.stringify(
								{
									status,
									strategy,
									commandPrefix,
									node: environment.node,
									bun: environment.bun,
									globalCli: environment.globalCli,
								},
								null,
								2,
							)}
						</pre>
					</details>
				)}
			</div>
		</Card>
	);
};
