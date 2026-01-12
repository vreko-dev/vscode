import { Button, Card } from "@snapback/ui";
import type React from "react";
import { CliInstallCard } from "../components/CliInstallCard";

// Brand constants will be passed as props from extension
interface DashboardHomeProps {
	stats: {
		snapshotsToday: number;
		totalSnapshots: number;
		restoresToday: number;
		linesProtected: number;
		tokensSaved: number;
		restoresThisWeek: number;
		efficiencyPercentile: number;
	};
	mcpStatus: {
		enabled: boolean;
		serverUrl: string;
		queuedItems: number;
		pushCount: number;
	};
	onConfigureMCP: () => void;
	onCreateSnapshot: () => void;
	onOpenSettings: () => void;
	/** CLI installation status (optional - shows card if not installed) */
	cliStatus?: {
		installed: boolean;
		version: string | null;
	};
}

// Brand constants (from extension BRANDING export)
const ICONS = {
	snapshot: "📸",
	restore: "⏪",
	protected: "🛡️",
	money: "💰",
	growth: "📈",
	inject: "💉",
	settings: "⚙️",
	logo: "🧢",
} as const;

export const DashboardHome: React.FC<DashboardHomeProps> = ({
	stats,
	mcpStatus,
	onConfigureMCP,
	onCreateSnapshot,
	onOpenSettings,
	cliStatus,
}) => {
	const {
		snapshotsToday,
		totalSnapshots,
		restoresToday,
		linesProtected,
		tokensSaved,
		restoresThisWeek,
		efficiencyPercentile,
	} = stats;

	// Calculate token cost estimates
	const gpt4Cost = ((tokensSaved / 1000) * 0.03).toFixed(2);
	const gpt35Cost = ((tokensSaved / 1000) * 0.002).toFixed(2);

	return (
		<div className="p-6 bg-zinc-950 text-zinc-100 min-h-screen">
			{/* Status Card */}
			<Card className="mb-6 border-emerald-900/30 bg-emerald-950/20">
				<div className="flex items-center gap-4 p-6">
					<div className="text-5xl">{ICONS.logo}</div>
					<div>
						<h2 className="text-2xl font-bold text-emerald-400">Protected</h2>
						<p className="text-zinc-400">
							{totalSnapshots} snapshot{totalSnapshots !== 1 ? "s" : ""} stored
						</p>
					</div>
				</div>
			</Card>

			{/* Today's Stats */}
			<div className="mb-6">
				<h3 className="text-sm font-semibold text-zinc-400 mb-3 uppercase tracking-wide">Today</h3>
				<div className="grid grid-cols-3 gap-4">
					<Card className="border-zinc-800 bg-zinc-900 p-4">
						<div className="text-2xl mb-1">{ICONS.snapshot}</div>
						<div className="text-2xl font-bold text-zinc-100">{snapshotsToday}</div>
						<div className="text-xs text-zinc-500">Snapshots</div>
					</Card>
					<Card className="border-zinc-800 bg-zinc-900 p-4">
						<div className="text-2xl mb-1">{ICONS.restore}</div>
						<div className="text-2xl font-bold text-zinc-100">{restoresToday}</div>
						<div className="text-xs text-zinc-500">Restores</div>
					</Card>
					<Card className="border-zinc-800 bg-zinc-900 p-4">
						<div className="text-2xl mb-1">{ICONS.protected}</div>
						<div className="text-2xl font-bold text-zinc-100">{linesProtected}</div>
						<div className="text-xs text-zinc-500">Lines Protected</div>
					</Card>
				</div>
			</div>

			{/* CLI Installation Card - Show if CLI not installed */}
			{(!cliStatus || !cliStatus.installed) && (
				<div className="mb-6">
					<h3 className="text-sm font-semibold text-zinc-400 mb-3 uppercase tracking-wide">Setup</h3>
					<CliInstallCard />
				</div>
			)}

			{/* MCP Status */}
			<div className="mb-6">
				<h3 className="text-sm font-semibold text-zinc-400 mb-3 uppercase tracking-wide">MCP Connection</h3>
				<Card className="border-zinc-800 bg-zinc-900 p-4">
					<div className="flex items-center justify-between mb-3">
						<div className="flex items-center gap-2">
							<span className="text-lg">🔌</span>
							<span className={`font-medium ${mcpStatus.enabled ? "text-emerald-400" : "text-zinc-500"}`}>
								{mcpStatus.enabled ? "MCP Enabled" : "MCP Disabled"}
							</span>
						</div>
						{mcpStatus.queuedItems > 0 && (
							<div className="flex items-center gap-2 text-yellow-400">
								<span>🔄</span>
								<span className="text-sm">{mcpStatus.queuedItems} queued</span>
							</div>
						)}
						{mcpStatus.pushCount > 0 && mcpStatus.queuedItems === 0 && (
							<div className="flex items-center gap-2 text-emerald-400">
								<span>✅</span>
								<span className="text-sm">Synced</span>
							</div>
						)}
					</div>
					{mcpStatus.serverUrl && <p className="text-xs text-zinc-500 mb-3">{mcpStatus.serverUrl}</p>}
					<div className="flex gap-2">
						<Button size="sm" variant="outline" onClick={onConfigureMCP}>
							Diagnose
						</Button>
						<Button size="sm" variant="outline">
							AI Status
						</Button>
					</div>
				</Card>
			</div>

			{/* Token Savings */}
			{restoresThisWeek > 0 && (
				<div className="mb-6">
					<h3 className="text-sm font-semibold text-zinc-400 mb-3 uppercase tracking-wide">
						Token Savings This Week
					</h3>
					<Card className="border-zinc-800 bg-zinc-900 p-4">
						<div className="flex items-start gap-3 mb-2">
							<span className="text-2xl">{ICONS.restore}</span>
							<div>
								<p className="text-zinc-300">
									{restoresThisWeek} restores - ~{tokensSaved.toLocaleString()} tokens saved
								</p>
								<p className="text-sm text-zinc-500 mt-1">
									{ICONS.money} Estimated: ${gpt4Cost} (GPT-4) / ${gpt35Cost} (3.5)
								</p>
								<p className="text-sm text-emerald-400 mt-1">
									{ICONS.growth} You're in top {efficiencyPercentile}% efficiency
								</p>
							</div>
						</div>
					</Card>
				</div>
			)}

			{/* Quick Actions */}
			<div>
				<h3 className="text-sm font-semibold text-zinc-400 mb-3 uppercase tracking-wide">Quick Actions</h3>
				<div className="grid grid-cols-3 gap-3">
					<Button onClick={onConfigureMCP} className="w-full" variant="default">
						<span className="mr-2">{ICONS.inject}</span>
						Configure MCP
					</Button>
					<Button onClick={onCreateSnapshot} className="w-full" variant="outline">
						<span className="mr-2">{ICONS.snapshot}</span>
						Create Snapshot
					</Button>
					<Button onClick={onOpenSettings} className="w-full" variant="outline">
						<span className="mr-2">{ICONS.settings}</span>
						Settings
					</Button>
				</div>
			</div>
		</div>
	);
};
