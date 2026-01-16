import { Button, Card } from "@snapback/ui";
import type React from "react";
import snapbackIcon from "../assets/snapback-icon.png";
import { CliInstallCard } from "../components/CliInstallCard";
import { StatusBadge } from "../components/StatusBadge";
import { formatNumber } from "../utils/format";

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
	onOpenSettings: () => void;
	onNavigateToActivity: () => void;
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
	onOpenSettings,
	onNavigateToActivity,
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
			{/* Status Card with MCP/CLI badges */}
			<Card className="mb-6 border-emerald-900/30 bg-emerald-950/20">
				<div className="flex items-center gap-4 p-6">
					<img src={snapbackIcon} alt="SnapBack" className="w-12 h-12" />
					<div className="flex-1">
						<h2 className="text-2xl font-bold text-emerald-400">Protected</h2>
						<p className="text-zinc-400">
							{totalSnapshots} snapshot{totalSnapshots !== 1 ? "s" : ""} stored
						</p>
					</div>
					<div className="flex gap-2">
						<StatusBadge
							status={mcpStatus.enabled ? "connected" : "disabled"}
							label={mcpStatus.enabled ? "MCP" : "MCP Off"}
						/>
						{cliStatus?.installed && (
							<StatusBadge status="connected" label={`CLI ${cliStatus.version || ""}`} />
						)}
					</div>
				</div>
			</Card>

			{/* Today's Stats */}
			<div className="mb-6">
				<h3 className="text-sm font-semibold text-zinc-400 mb-3 uppercase tracking-wide">Today</h3>
				<div className="grid grid-cols-3 gap-4">
					<Card className="border-zinc-800 bg-zinc-900 p-4">
						<div className="text-2xl mb-1">{ICONS.snapshot}</div>
						<div className="text-2xl font-bold text-zinc-100">{formatNumber(snapshotsToday)}</div>
						<div className="text-xs text-zinc-500">Snapshots</div>
					</Card>
					<Card className="border-zinc-800 bg-zinc-900 p-4">
						<div className="text-2xl mb-1">{ICONS.restore}</div>
						<div className="text-2xl font-bold text-zinc-100">{formatNumber(restoresToday)}</div>
						<div className="text-xs text-zinc-500">Restores</div>
					</Card>
					<Card className="border-zinc-800 bg-zinc-900 p-4">
						<div className="text-2xl mb-1">{ICONS.protected}</div>
						<div className="text-2xl font-bold text-zinc-100">{formatNumber(linesProtected)}</div>
						<div className="text-xs text-zinc-500">Lines Protected</div>
					</Card>
				</div>
			</div>

			{/* CLI Installation Card - Show if CLI not installed */}
			{(!cliStatus || !cliStatus.installed) && (
				<div className="mb-6">
					<h3 className="text-sm font-semibold text-zinc-400 mb-3 uppercase tracking-wide">Setup</h3>
					<CliInstallCard initialStatus={cliStatus} />
				</div>
			)}

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
									{restoresThisWeek} restores - ~{formatNumber(tokensSaved)} tokens saved
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
				<div className="flex gap-2">
					<Button size="sm" variant="outline" onClick={onNavigateToActivity}>
						<span className="mr-2">📋</span>
						View Activity
					</Button>
					<Button size="sm" variant="outline" onClick={onOpenSettings}>
						<span className="mr-2">{ICONS.settings}</span>
						Settings
					</Button>
				</div>
			</div>
		</div>
	);
};
