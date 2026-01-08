import { Alert, Button } from "@snapback/ui";
import type React from "react";
import { useEffect, useState } from "react";
import { CliCard } from "../components/CliCard";
import { ProviderCard } from "../components/ProviderCard";
import { StepIndicator } from "../components/StepIndicator";
import { getVSCodeAPI } from "../vscode-api";

// Brand constants (aligned with extension BRANDING)
const _BRAND_ICONS = {
	logo: "🧢",
	snapshot: "📸",
	protected: "🛡️",
	checkmark: "✓",
	rocket: "🚀",
} as const;

type Step = "welcome" | "detect" | "configure" | "test" | "cli" | "complete";

type MCPStatus = "untested" | "configured" | "connected" | "failed";

interface DetectedProvider {
	id: string;
	displayName: string;
	source: string;
	mcpStatus: MCPStatus;
	lastChecked?: string;
}

interface OnboardingState {
	currentStep: Step;
	providers: DetectedProvider[];
	providerStatuses: Record<string, "idle" | "configuring" | "testing" | "success" | "failed">;
	cliInstalled: boolean;
	error?: string;
}

export const OnboardingPanel: React.FC = () => {
	const [state, setState] = useState<OnboardingState>({
		currentStep: "welcome",
		providers: [],
		providerStatuses: {},
		cliInstalled: false,
	});

	// Use shared VS Code API instance
	const vscode = getVSCodeAPI();

	// Listen for messages from extension
	useEffect(() => {
		console.log("[OnboardingPanel] Setting up message handler");

		const handleMessage = (event: MessageEvent) => {
			const msg = event.data;
			console.log("[OnboardingPanel] Message received:", msg);

			switch (msg.type) {
				case "providersDetected":
					console.log("[OnboardingPanel] providersDetected:", msg.providers);
					setState((s) => ({
						...s,
						providers: msg.providers,
						providerStatuses: msg.providers.reduce((acc: Record<string, string>, p: DetectedProvider) => {
							acc[p.id] = "idle";
							return acc;
						}, {}),
					}));
					break;

				case "providerConfigured":
					setState((s) => ({
						...s,
						providerStatuses: {
							...s.providerStatuses,
							[msg.providerId]: "success",
						},
					}));
					break;

				case "providerConfigFailed":
					setState((s) => ({
						...s,
						providerStatuses: {
							...s.providerStatuses,
							[msg.providerId]: "failed",
						},
						error: msg.error,
					}));
					break;

				case "providerTested":
					setState((s) => ({
						...s,
						providers: s.providers.map((p) =>
							p.id === msg.providerId
								? {
										...p,
										mcpStatus: msg.success ? "connected" : "failed",
										lastChecked: new Date().toISOString(),
									}
								: p,
						),
						providerStatuses: {
							...s.providerStatuses,
							[msg.providerId]: msg.success ? "success" : "failed",
						},
					}));
					break;

				case "cliStatus":
					setState((s) => ({
						...s,
						cliInstalled: msg.installed,
					}));
					break;
			}
		};

		window.addEventListener("message", handleMessage);

		// Signal to extension that webview is ready
		vscode?.postMessage({ type: "webviewReady" });

		return () => window.removeEventListener("message", handleMessage);
	}, [vscode]);

	// Handlers
	const handleNext = () => {
		const steps: Step[] = ["welcome", "detect", "configure", "test", "cli", "complete"];
		const currentIdx = steps.indexOf(state.currentStep);
		console.log("[OnboardingPanel] handleNext called", { currentStep: state.currentStep, currentIdx });
		if (currentIdx < steps.length - 1) {
			const nextStep = steps[currentIdx + 1];
			console.log("[OnboardingPanel] Sending next message", { nextStep });
			setState((s) => ({ ...s, currentStep: nextStep }));
			vscode?.postMessage({ type: "next", step: nextStep });
		}
	};

	const handleInstallCli = () => {
		vscode?.postMessage({ type: "install-cli" });
	};

	const handleClose = () => {
		vscode?.postMessage({ type: "close" });
	};

	// Render steps
	const renderStep = () => {
		switch (state.currentStep) {
			case "welcome":
				return (
					<div className="text-center max-w-xl mx-auto">
						<div className="text-6xl mb-4">🧢</div>
						<h1 className="text-2xl font-bold text-zinc-100 mb-2">Welcome to SnapBack</h1>
						<p className="text-zinc-400 mb-6">AI-assisted development with built-in protection</p>
						<Alert className="mb-6 text-left bg-blue-900/20 border-blue-800">
							<div className="text-sm">
								🔒 <strong>Your code stays on your machine.</strong> SnapBack protects your AI sessions
								by monitoring changes and enabling instant rollback.
							</div>
						</Alert>
						<p className="text-sm text-zinc-500">
							We'll set up SnapBack with your AI tools in a few quick steps.
						</p>
					</div>
				);

			case "detect":
				console.log("[OnboardingPanel] Rendering detect step", {
					providersCount: state.providers.length,
					providers: state.providers,
				});
				return (
					<div>
						<h2 className="text-lg font-bold text-zinc-100 mb-4">🔍 Detecting AI Clients</h2>
						<p className="text-sm text-zinc-400 mb-4">
							Scanning your system for configured language models...
						</p>
						{state.providers.length > 0 ? (
							<div>
								{state.providers.map((p) => (
									<ProviderCard
										key={p.id}
										provider={p}
										status={state.providerStatuses[p.id] || "idle"}
									/>
								))}
								<p className="text-xs text-zinc-500 mt-4">Found {state.providers.length} provider(s)</p>
							</div>
						) : (
							<Alert className="bg-yellow-900/20 border-yellow-800">
								<div className="text-sm">
									⚠️ No AI clients detected. Install Cursor, Claude Desktop, or Windsurf to continue.
								</div>
							</Alert>
						)}
					</div>
				);

			case "configure":
				return (
					<div>
						<h2 className="text-lg font-bold text-zinc-100 mb-4">⚙️ Configuring MCP</h2>
						<p className="text-sm text-zinc-400 mb-4">
							Setting up SnapBack protection for your AI tools...
						</p>
						{state.providers.map((p) => (
							<ProviderCard key={p.id} provider={p} status={state.providerStatuses[p.id] || "idle"} />
						))}
					</div>
				);

			case "test":
				return (
					<div>
						<h2 className="text-lg font-bold text-zinc-100 mb-4">🧪 Testing Connectivity</h2>
						<p className="text-sm text-zinc-400 mb-4">Verifying each AI tool can reach SnapBack...</p>
						{state.error && (
							<Alert className="mb-4 bg-red-900/20 border-red-800">
								<div className="text-sm">❌ {state.error}</div>
							</Alert>
						)}
						{state.providers.map((p) => (
							<ProviderCard key={p.id} provider={p} status={state.providerStatuses[p.id] || "idle"} />
						))}
					</div>
				);

			case "cli":
				return (
					<div>
						<h2 className="text-lg font-bold text-zinc-100 mb-4">📦 (Optional) Install CLI</h2>
						<p className="text-sm text-zinc-400 mb-4">
							The SnapBack CLI enables local file system access while keeping your code on your machine.
						</p>
						<CliCard installed={state.cliInstalled} onInstall={handleInstallCli} />
					</div>
				);

			case "complete":
				return (
					<div className="text-center max-w-xl mx-auto">
						<div className="text-6xl mb-4">✓</div>
						<h1 className="text-2xl font-bold text-zinc-100 mb-2">Setup Complete!</h1>
						<p className="text-zinc-400 mb-6">All AI tools are now protected by SnapBack. Happy coding!</p>
						<div className="grid grid-cols-3 gap-4 mb-6">
							<div className="bg-zinc-800/50 rounded-lg p-4">
								<div className="text-2xl mb-1">🤖</div>
								<div className="text-xs text-zinc-400">Clients Protected</div>
								<div className="text-xl font-bold text-zinc-100">{state.providers.length}</div>
							</div>
							<div className="bg-zinc-800/50 rounded-lg p-4">
								<div className="text-2xl mb-1">🧢</div>
								<div className="text-xs text-zinc-400">Snapshots Ready</div>
								<div className="text-xl font-bold text-zinc-100">Unlimited</div>
							</div>
							<div className="bg-zinc-800/50 rounded-lg p-4">
								<div className="text-2xl mb-1">🌱</div>
								<div className="text-xs text-zinc-400">Pioneer Points</div>
								<div className="text-xl font-bold text-emerald-400">+100</div>
							</div>
						</div>
					</div>
				);

			default:
				return null;
		}
	};

	const steps: Step[] = ["welcome", "detect", "configure", "test", "cli", "complete"];
	const currentStepIdx = steps.indexOf(state.currentStep);

	return (
		<div className="flex flex-col h-screen bg-zinc-950 text-zinc-100">
			{/* Header */}
			<div className="border-b border-zinc-800 p-6">
				<StepIndicator steps={steps} currentStep={currentStepIdx} />
			</div>

			{/* Content */}
			<div className="flex-1 overflow-auto p-6">
				<div className="max-w-2xl mx-auto">{renderStep()}</div>
			</div>

			{/* Footer */}
			<div className="border-t border-zinc-800 p-6 flex gap-3 justify-end bg-zinc-950">
				{state.currentStep !== "welcome" && state.currentStep !== "complete" && (
					<Button variant="secondary" onClick={handleClose}>
						Skip for Now
					</Button>
				)}

				<Button
					onClick={state.currentStep === "complete" ? handleClose : handleNext}
					disabled={state.providers.length === 0 && state.currentStep === "detect"}
				>
					{state.currentStep === "complete" ? "Get Started" : "Next"}
				</Button>
			</div>
		</div>
	);
};
