import { Button, Card } from "@snapback/ui/components";
import type React from "react";
import { StatusBadge } from "../components/StatusBadge";

interface SettingsPanelProps {
	mcpStatus: { enabled: boolean; serverUrl: string };
	cliStatus?: { installed: boolean; version: string | null };
	onConfigureMCP: () => void;
	onRunDiagnostics: () => void;
	onShowAIStatus: () => void;
	onInstallCli: () => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
	mcpStatus,
	cliStatus,
	onConfigureMCP,
	onRunDiagnostics,
	onShowAIStatus,
	onInstallCli,
}) => {
	return (
		<div className="p-6 bg-zinc-950 text-zinc-100 min-h-screen">
			{/* System Status */}
			<div className="mb-6">
				<h3 className="text-sm font-semibold text-zinc-400 mb-3 uppercase tracking-wide">System Status</h3>
				<Card className="border-zinc-800 bg-zinc-900 p-4 space-y-3">
					<div className="flex items-center justify-between">
						<span className="text-zinc-300">MCP Server</span>
						<StatusBadge
							status={mcpStatus.enabled ? "connected" : "disabled"}
							label={mcpStatus.enabled ? "Connected" : "Disabled"}
						/>
					</div>
					<div className="flex items-center justify-between">
						<span className="text-zinc-300">SnapBack CLI</span>
						<StatusBadge
							status={cliStatus?.installed ? "connected" : "disabled"}
							label={cliStatus?.installed ? `v${cliStatus.version}` : "Not Installed"}
						/>
					</div>
				</Card>
			</div>

			{/* Diagnostics */}
			<div className="mb-6">
				<h3 className="text-sm font-semibold text-zinc-400 mb-3 uppercase tracking-wide">Diagnostics</h3>
				<Card className="border-zinc-800 bg-zinc-900 p-4">
					<div className="flex flex-wrap gap-2">
						<Button size="sm" variant="outline" onClick={onConfigureMCP}>
							🔧 Configure MCP
						</Button>
						<Button size="sm" variant="outline" onClick={onRunDiagnostics}>
							🔍 Run Diagnostics
						</Button>
						<Button size="sm" variant="outline" onClick={onShowAIStatus}>
							🤖 AI Detection Status
						</Button>
					</div>
				</Card>
			</div>

			{/* CLI Setup (conditional) */}
			{(!cliStatus || !cliStatus.installed) && (
				<div className="mb-6">
					<h3 className="text-sm font-semibold text-zinc-400 mb-3 uppercase tracking-wide">Quick Setup</h3>
					<Card className="border-zinc-800 bg-zinc-900 p-4">
						<p className="text-zinc-300 mb-3">Get protected in 2 steps:</p>
						<ol className="list-decimal list-inside text-zinc-400 text-sm space-y-1 mb-4">
							<li>
								Install CLI:{" "}
								<code className="bg-zinc-800 px-1.5 py-0.5 rounded text-emerald-400">
									npm i -g @snapback/cli
								</code>
							</li>
							<li>Start coding — protection is automatic</li>
						</ol>
						<Button
							size="sm"
							onClick={onInstallCli}
							className="w-full bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/50"
						>
							📦 Install CLI Now
						</Button>
					</Card>
				</div>
			)}

			{/* Privacy note */}
			<div className="text-xs text-zinc-500 flex items-center gap-2">
				<span>🔒</span>
				<span>Your code stays on your machine. Only metadata is sent for analytics.</span>
			</div>
		</div>
	);
};
