import { Badge, Button, Card } from "@snapback/ui";
import type React from "react";

interface CliCardProps {
	installed: boolean;
	onInstall?: () => void;
}

export const CliCard: React.FC<CliCardProps> = ({ installed, onInstall }) => {
	return (
		<Card className="border border-zinc-800 bg-zinc-900">
			<div className="p-4">
				<div className="flex items-start justify-between mb-3">
					<div>
						<h3 className="text-sm font-medium text-zinc-100">SnapBack CLI</h3>
						<p className="text-xs text-zinc-500 mt-1">
							Enable local file system access without sending code to servers
						</p>
					</div>
					<Badge className={installed ? "bg-emerald-900/30 text-emerald-300" : "bg-zinc-800 text-zinc-400"}>
						{installed ? "✓ Installed" : "Optional"}
					</Badge>
				</div>

				{!installed && onInstall && (
					<Button onClick={onInstall} className="w-full" size="sm">
						Install CLI
					</Button>
				)}

				{installed && (
					<p className="text-xs text-emerald-300">
						CLI is active and monitoring. Your code stays on your machine.
					</p>
				)}
			</div>
		</Card>
	);
};
