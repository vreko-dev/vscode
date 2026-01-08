import { WorkspaceVitals } from "@snapback/ui/vitals";
import { useEffect, useState } from "react";
import { DashboardHome } from "./panels/DashboardHome";
import { OnboardingPanel } from "./panels/OnboardingPanel";
import { getVSCodeAPI } from "./vscode-api";

// Route type for dashboard navigation
type RouteType = "home" | "activity" | "onboarding" | "vitals";

type PanelType = RouteType; // Backward compatibility

interface VitalsData {
	pulse: number;
	temperature: number;
	pressure: number;
	oxygen: number;
	score: number;
}

interface Guidance {
	message: string;
}

// Get the shared VS Code API instance
const vscodeAPI = getVSCodeAPI();

// Tab configuration
const TABS: { id: PanelType; label: string; icon: string }[] = [
	{ id: "home", label: "Dashboard", icon: "🏠" },
	{ id: "vitals", label: "Vitals", icon: "💓" },
	{ id: "onboarding", label: "Setup", icon: "🚀" },
];

export function App() {
	// Detect which panel to show based on data-panel attribute
	const rootElement = document.getElementById("root");
	const initialPanel = (rootElement?.getAttribute("data-panel") as PanelType) || "home";
	const [activePanel, setActivePanel] = useState<PanelType>(initialPanel);
	// Dashboard-specific state
	const [dashboardStats, setDashboardStats] = useState({
		snapshotsToday: 0,
		totalSnapshots: 0,
		restoresToday: 0,
		linesProtected: 0,
		tokensSaved: 0,
		restoresThisWeek: 0,
		efficiencyPercentile: 0,
	});
	const [mcpStatus, setMcpStatus] = useState({
		enabled: true,
		serverUrl: "",
		queuedItems: 0,
		pushCount: 0,
	});
	const [vitals, setVitals] = useState<VitalsData>({
		pulse: 0,
		temperature: 0,
		pressure: 0,
		oxygen: 100,
		score: 100,
	});
	const [guidance, setGuidance] = useState<Guidance | undefined>();

	useEffect(() => {
		// Listen for messages from extension
		const messageHandler = (event: MessageEvent) => {
			const message = event.data;
			if (message.type === "update") {
				if (message.vitals) {
					setVitals(message.vitals);
				}
				if (message.guidance) {
					setGuidance(message.guidance);
				}
				if (message.dashboardStats) {
					setDashboardStats(message.dashboardStats);
				}
				if (message.mcpStatus) {
					setMcpStatus(message.mcpStatus);
				}
			}
		};

		window.addEventListener("message", messageHandler);

		// Signal to extension that webview is ready to receive messages
		vscodeAPI?.postMessage({ type: "webviewReady" });

		return () => window.removeEventListener("message", messageHandler);
	}, []);

	return (
		<div className="flex flex-col h-screen bg-zinc-950 text-zinc-100">
			{/* Tab Navigation */}
			<div className="flex border-b border-zinc-800 bg-zinc-900/50">
				{TABS.map((tab) => (
					<button
						key={tab.id}
						type="button"
						onClick={() => setActivePanel(tab.id)}
						className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
							activePanel === tab.id
								? "text-emerald-400 border-b-2 border-emerald-400 bg-zinc-800/50"
								: "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/30"
						}`}
					>
						<span>{tab.icon}</span>
						<span>{tab.label}</span>
					</button>
				))}
			</div>

			{/* Panel Content */}
			<div className="flex-1 overflow-auto">
				{activePanel === "onboarding" && <OnboardingPanel />}
				{activePanel === "home" && (
					<DashboardHome
						stats={dashboardStats}
						mcpStatus={mcpStatus}
						onConfigureMCP={() => vscodeAPI?.postMessage({ type: "configureMCP" })}
						onCreateSnapshot={() => vscodeAPI?.postMessage({ type: "createSnapshot" })}
						onOpenSettings={() => vscodeAPI?.postMessage({ type: "openSettings" })}
					/>
				)}
				{activePanel === "vitals" && (
					<div className="p-6">
						<WorkspaceVitals vitals={vitals} guidance={guidance} showInitPrompt={vitals.score === 0} />
					</div>
				)}
			</div>
		</div>
	);
}
