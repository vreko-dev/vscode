import { Badge, Card, Spinner } from "@snapback/ui";
import type React from "react";

type MCPStatus = "untested" | "configured" | "connected" | "failed";

interface DetectedProvider {
	id: string;
	displayName: string;
	source: string;
	mcpStatus: MCPStatus;
	lastChecked?: string;
}

interface ProviderCardProps {
	provider: DetectedProvider;
	status?: "idle" | "configuring" | "testing" | "success" | "failed";
	onRetest?: () => void;
}

const STATUS_ICON: Record<MCPStatus, string> = {
	untested: "◯",
	configured: "⚙️",
	connected: "✓",
	failed: "✕",
};

const STATUS_COLOR: Record<MCPStatus, string> = {
	untested: "bg-zinc-800 text-zinc-300",
	configured: "bg-yellow-900/30 text-yellow-300",
	connected: "bg-emerald-900/30 text-emerald-300",
	failed: "bg-red-900/30 text-red-300",
};

export const ProviderCard: React.FC<ProviderCardProps> = ({ provider, status = "idle", onRetest }) => {
	const isLoading = status === "configuring" || status === "testing";

	return (
		<Card className="mb-3 border border-zinc-800 bg-zinc-900">
			<div className="flex items-center justify-between p-4">
				<div className="flex items-center gap-3 flex-1">
					{isLoading ? <Spinner /> : <span className="text-lg">{STATUS_ICON[provider.mcpStatus]}</span>}

					<div className="flex-1 min-w-0">
						<p className="text-sm font-medium text-zinc-100 truncate">{provider.displayName}</p>
						<p className="text-xs text-zinc-500">
							{provider.source === "vscode-lm"
								? "VS Code Language Model"
								: provider.source === "local-service"
									? "Local Service"
									: provider.source === "user-mcp"
										? "User Config"
										: "Workspace Config"}
						</p>
					</div>
				</div>

				<div className="flex items-center gap-2 ml-2">
					<Badge className={STATUS_COLOR[provider.mcpStatus]}>
						{provider.mcpStatus === "connected"
							? "Connected"
							: provider.mcpStatus === "failed"
								? "Failed"
								: provider.mcpStatus === "configured"
									? "Ready"
									: "New"}
					</Badge>

					{provider.lastChecked && !isLoading && onRetest && (
						<button
							type="button"
							onClick={onRetest}
							className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
						>
							Re-test
						</button>
					)}
				</div>
			</div>

			{provider.lastChecked && (
				<div className="px-4 pb-2 text-xs text-zinc-500 border-t border-zinc-800 pt-2">
					Last checked: {new Date(provider.lastChecked).toLocaleTimeString()}
				</div>
			)}
		</Card>
	);
};
