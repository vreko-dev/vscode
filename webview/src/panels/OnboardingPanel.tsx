import { Alert, Button, Card } from "@snapback/ui";
import type React from "react";
import { useEffect, useState } from "react";
import { CliInstallCard } from "../components/CliInstallCard";
import { getVSCodeAPI } from "../vscode-api";

// Brand constants
const ICONS = {
	logo: "🧢",
	checkmark: "✓",
	rocket: "🚀",
} as const;

interface OnboardingState {
	cliInstalled: boolean;
	cliVersion: string | null;
}

export const OnboardingPanel: React.FC = () => {
	const [state, setState] = useState<OnboardingState>({
		cliInstalled: false,
		cliVersion: null,
	});

	const vscode = getVSCodeAPI();

	useEffect(() => {
		const handleMessage = (event: MessageEvent) => {
			const msg = event.data;
			if (msg.type === "cliStatus" || msg.type === "cli:status") {
				setState({
					cliInstalled: msg.installed || msg.payload?.installed,
					cliVersion: msg.version || msg.payload?.version || null,
				});
			}
			if (msg.type === "cli:installComplete") {
				setState({
					cliInstalled: true,
					cliVersion: msg.payload?.version || null,
				});
			}
		};

		window.addEventListener("message", handleMessage);
		vscode?.postMessage({ type: "webviewReady" });
		return () => window.removeEventListener("message", handleMessage);
	}, [vscode]);

	const handleClose = () => {
		vscode?.postMessage({ type: "close" });
	};

	// If CLI is installed, show success
	if (state.cliInstalled) {
		return (
			<div className="flex flex-col h-screen bg-zinc-950 text-zinc-100">
				<div className="flex-1 flex items-center justify-center p-6">
					<div className="text-center max-w-md">
						<div className="text-6xl mb-4">{ICONS.checkmark}</div>
						<h1 className="text-2xl font-bold text-emerald-400 mb-2">You're Protected!</h1>
						<p className="text-zinc-400 mb-6">
							SnapBack CLI {state.cliVersion && `v${state.cliVersion}`} is installed. Your AI sessions are
							now automatically protected.
						</p>
						<Card className="bg-zinc-900 border-zinc-800 p-4 text-left mb-6">
							<p className="text-sm text-zinc-400">What happens now:</p>
							<ul className="text-sm text-zinc-300 mt-2 space-y-1">
								<li>• Snapshots auto-created during AI edits</li>
								<li>• Instant rollback if AI breaks something</li>
								<li>• All data stays on your machine</li>
							</ul>
						</Card>
						<Button onClick={handleClose} className="w-full">
							{ICONS.rocket} Start Coding
						</Button>
					</div>
				</div>
			</div>
		);
	}

	// Main setup view - just install CLI
	return (
		<div className="flex flex-col h-screen bg-zinc-950 text-zinc-100">
			<div className="flex-1 flex items-center justify-center p-6">
				<div className="max-w-md w-full">
					{/* Header */}
					<div className="text-center mb-8">
						<div className="text-5xl mb-3">{ICONS.logo}</div>
						<h1 className="text-2xl font-bold text-zinc-100 mb-2">Welcome to SnapBack</h1>
						<p className="text-zinc-400">One step to protect your AI coding sessions</p>
					</div>

					{/* Install CLI Card */}
					<CliInstallCard
						autoCheck={true}
						onInstalled={(version) => {
							setState({ cliInstalled: true, cliVersion: version });
						}}
					/>

					{/* Privacy note */}
					<Alert className="mt-4 bg-blue-900/20 border-blue-800 text-sm">
						<div>
							🔒 <strong>Your code stays local.</strong> Snapshots are stored on your machine. Only
							anonymous usage metrics are sent.
						</div>
					</Alert>
				</div>
			</div>

			{/* Skip option */}
			<div className="border-t border-zinc-800 p-4 text-center">
				<button
					type="button"
					onClick={handleClose}
					className="text-sm text-zinc-500 hover:text-zinc-400 transition-colors"
				>
					Skip for now →
				</button>
			</div>
		</div>
	);
};
