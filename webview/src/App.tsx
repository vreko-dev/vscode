import { WorkspaceVitals } from "@snapback/ui/vitals";
import { useEffect, useState } from "react";
import { ActivityPanel } from "./panels/ActivityPanel";
import { DashboardHome } from "./panels/DashboardHome";
import { OnboardingPanel } from "./panels/OnboardingPanel";
import { transformGuidanceToUI, transformVitalsToUI } from "./transforms";
import type {
	ActivityData,
	AgentGuidance,
	BackendVitalsData,
	DashboardStats,
	DashboardTab,
	ExtensionMessage,
	SessionHealth,
	TabConfig,
	UIGuidance,
	UIVitalsData,
} from "./types";
import { getVSCodeAPI } from "./vscode-api";

// Get the shared VS Code API instance
const vscodeAPI = getVSCodeAPI();

// Tab configuration - matches DashboardTab type
const TABS: TabConfig[] = [
	{ id: "home", label: "Dashboard", icon: "🏠" },
	{ id: "vitals", label: "Vitals", icon: "💓" },
	{ id: "activity", label: "Activity", icon: "📊" },
	{ id: "setup", label: "Setup", icon: "🚀" },
];

// Default stats for initial state
const DEFAULT_STATS: DashboardStats = {
	snapshotsToday: 0,
	totalSnapshots: 0,
	restoresToday: 0,
	linesProtected: 0,
	tokensSaved: 0,
	restoresThisWeek: 0,
	efficiencyPercentile: 0,
};

// Default activity data for initial state
const DEFAULT_ACTIVITY: ActivityData = {
	timeline: [],
	aiDetectionLog: [],
	todayEvents: 0,
	yesterdayEvents: 0,
	weekEvents: 0,
};

// MCP status - derived from settings/activity (not in WorkspaceDataSnapshot)
interface MCPStatus {
	enabled: boolean;
	serverUrl: string;
	queuedItems: number;
	pushCount: number;
}

const DEFAULT_MCP_STATUS: MCPStatus = {
	enabled: true,
	serverUrl: "",
	queuedItems: 0,
	pushCount: 0,
};

export function App() {
	// Detect which panel to show based on data-panel attribute
	const rootElement = document.getElementById("root");
	const initialPanel = (rootElement?.getAttribute("data-panel") as DashboardTab) || "home";
	const [activePanel, setActivePanel] = useState<DashboardTab>(initialPanel);

	// Unified state from WorkspaceDataService
	const [stats, setStats] = useState<DashboardStats>(DEFAULT_STATS);
	const [activity, setActivity] = useState<ActivityData>(DEFAULT_ACTIVITY);
	const [backendVitals, setBackendVitals] = useState<BackendVitalsData | null>(null);
	const [sessionHealth, setSessionHealth] = useState<SessionHealth | null>(null);
	const [backendGuidance, setBackendGuidance] = useState<AgentGuidance | null>(null);

	// Legacy MCP status (maintained for DashboardHome compatibility)
	// Note: mcpStatus is currently static - future: derive from settings/activity
	const [mcpStatus] = useState<MCPStatus>(DEFAULT_MCP_STATUS);

	// Derived UI values (transformed for components)
	const uiVitals: UIVitalsData = transformVitalsToUI(backendVitals, sessionHealth ?? undefined);
	const uiGuidance: UIGuidance | undefined = transformGuidanceToUI(backendGuidance);

	useEffect(() => {
		// Listen for messages from extension
		const messageHandler = (event: MessageEvent) => {
			const message = event.data as ExtensionMessage;

			if (message.type === "update") {
				// Handle unified update message from WorkspaceDataService
				if (message.stats) {
					setStats(message.stats);
				}
				if (message.activity) {
					setActivity(message.activity);
				}
				if (message.vitals !== undefined) {
					setBackendVitals(message.vitals);
				}
				if (message.sessionHealth) {
					setSessionHealth(message.sessionHealth);
				}
				if (message.guidance) {
					setBackendGuidance(message.guidance);
				}
			} else if (message.type === "navigate") {
				// Handle navigation requests from extension
				if (message.tab) {
					setActivePanel(message.tab);
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
				{activePanel === "setup" && <OnboardingPanel />}
				{activePanel === "home" && (
					<DashboardHome
						stats={stats}
						mcpStatus={mcpStatus}
						onConfigureMCP={() => vscodeAPI?.postMessage({ type: "configureMCP" })}
						onCreateSnapshot={() => vscodeAPI?.postMessage({ type: "createSnapshot" })}
						onOpenSettings={() => vscodeAPI?.postMessage({ type: "openSettings" })}
					/>
				)}
				{activePanel === "vitals" && (
					<div className="p-6">
						<WorkspaceVitals
							vitals={uiVitals}
							guidance={uiGuidance}
							showInitPrompt={uiVitals.score === 0}
						/>
					</div>
				)}
				{activePanel === "activity" && (
					<ActivityPanel
						activity={activity}
						onRestoreSnapshot={(snapshotId: string) =>
							vscodeAPI?.postMessage({ type: "restoreSnapshot", payload: { snapshotId } })
						}
					/>
				)}
			</div>
		</div>
	);
}
