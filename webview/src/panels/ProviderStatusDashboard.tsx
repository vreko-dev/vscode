/**
 * Provider Status Dashboard - Real-time MCP provider health monitoring
 *
 * Surfaces HealthStateManager metrics in a user-friendly dashboard:
 * - Connection status (healthy/degraded/unhealthy)
 * - Latency metrics (p50/p95/p99)
 * - Quick actions (Reconnect, Diagnose, Configure)
 *
 * Addresses UX feedback: "No provider status visualization"
 */

import { Badge, Button, Card } from "@snapback/ui";
import type React from "react";
import { useEffect, useState } from "react";

// Brand constants (aligned with extension BRANDING)
const BRAND_ICONS = {
	logo: "🧢",
	connected: "🟢",
	degraded: "🟡",
	unhealthy: "🔴",
	disconnected: "⚫",
	refresh: "🔄",
	diagnose: "🔍",
	configure: "⚙️",
} as const;

type HealthState = "healthy" | "degraded" | "unhealthy" | "disconnected";

interface ProviderStatus {
	id: string;
	name: string;
	healthState: HealthState;
	latency: {
		p50: number;
		p95: number;
		p99: number;
	};
	consecutiveFailures: number;
	consecutiveSuccesses: number;
	lastCheckTime: number;
}

interface DashboardState {
	providers: ProviderStatus[];
	loading: boolean;
}

export const ProviderStatusDashboard: React.FC = () => {
	const [state, setState] = useState<DashboardState>({
		providers: [],
		loading: true,
	});

	const vscode = (
		window as { acquireVsCodeApi?: () => { postMessage: (msg: unknown) => void } }
	).acquireVsCodeApi?.();

	// Load provider status on mount
	useEffect(() => {
		const handleMessage = (event: MessageEvent) => {
			const msg = event.data;

			if (msg.type === "providerStatus") {
				setState({
					providers: msg.providers,
					loading: false,
				});
			}
		};

		window.addEventListener("message", handleMessage);

		// Request initial status
		vscode?.postMessage({ type: "getProviderStatus" });

		return () => window.removeEventListener("message", handleMessage);
	}, [vscode]);

	const getHealthIcon = (health: HealthState): string => {
		switch (health) {
			case "healthy":
				return BRAND_ICONS.connected;
			case "degraded":
				return BRAND_ICONS.degraded;
			case "unhealthy":
				return BRAND_ICONS.unhealthy;
			case "disconnected":
				return BRAND_ICONS.disconnected;
		}
	};

	const getHealthColor = (health: HealthState): string => {
		switch (health) {
			case "healthy":
				return "text-emerald-500";
			case "degraded":
				return "text-yellow-500";
			case "unhealthy":
				return "text-red-500";
			case "disconnected":
				return "text-zinc-500";
		}
	};

	const handleReconnect = (providerId: string) => {
		vscode?.postMessage({ type: "reconnectProvider", providerId });
	};

	const handleDiagnose = (providerId: string) => {
		vscode?.postMessage({ type: "diagnoseProvider", providerId });
	};

	const handleConfigure = () => {
		vscode?.postMessage({ type: "configureMCP" });
	};

	if (state.loading) {
		return (
			<div className="flex items-center justify-center min-h-screen bg-zinc-950 text-zinc-100">
				<div className="text-center">
					<div className="text-4xl mb-4">{BRAND_ICONS.logo}</div>
					<div className="text-zinc-400">Loading provider status...</div>
				</div>
			</div>
		);
	}

	return (
		<div className="p-6 bg-zinc-950 text-zinc-100 min-h-screen">
			{/* Header */}
			<div className="mb-6">
				<div className="flex items-center justify-between mb-2">
					<h1 className="text-2xl font-bold flex items-center gap-2">
						<span>{BRAND_ICONS.logo}</span>
						Provider Status Dashboard
					</h1>
					<Button onClick={handleConfigure} variant="outline" size="sm">
						{BRAND_ICONS.configure} Configure MCP
					</Button>
				</div>
				<p className="text-zinc-400 text-sm">Real-time health monitoring for all MCP providers</p>
			</div>

			{/* Provider Grid */}
			<div className="grid gap-4">
				{state.providers.length === 0 ? (
					<Card className="p-8 text-center border border-zinc-800 bg-zinc-900">
						<div className="text-4xl mb-3">{BRAND_ICONS.configure}</div>
						<h2 className="text-lg font-semibold mb-2 text-zinc-100">No Providers Configured</h2>
						<p className="text-zinc-400 mb-4">Configure MCP providers to start monitoring their health.</p>
						<Button onClick={handleConfigure} variant="default">
							Configure Providers
						</Button>
					</Card>
				) : (
					state.providers.map((provider) => (
						<Card
							key={provider.id}
							className="p-4 border border-zinc-800 bg-zinc-900 hover:border-zinc-700 transition-colors"
						>
							<div className="flex items-start justify-between mb-3">
								<div className="flex items-center gap-3">
									<div className={`text-2xl ${getHealthColor(provider.healthState)}`}>
										{getHealthIcon(provider.healthState)}
									</div>
									<div>
										<h3 className="font-semibold text-zinc-100">{provider.name}</h3>
										<Badge
											variant={
												provider.healthState === "healthy"
													? "success"
													: provider.healthState === "degraded"
														? "warning"
														: provider.healthState === "unhealthy"
															? "danger"
															: "default"
											}
											className="mt-1"
										>
											{provider.healthState.toUpperCase()}
										</Badge>
									</div>
								</div>

								<div className="flex gap-2">
									{provider.healthState !== "healthy" && (
										<Button
											onClick={() => handleReconnect(provider.id)}
											variant="outline"
											size="sm"
										>
											{BRAND_ICONS.refresh} Reconnect
										</Button>
									)}
									<Button onClick={() => handleDiagnose(provider.id)} variant="ghost" size="sm">
										{BRAND_ICONS.diagnose} Diagnose
									</Button>
								</div>
							</div>

							{/* Latency Metrics */}
							<div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-zinc-800">
								<div className="text-center">
									<div className="text-xs text-zinc-400 mb-1">p50 Latency</div>
									<div className="text-lg font-mono font-semibold text-zinc-100">
										{provider.latency.p50}ms
									</div>
								</div>
								<div className="text-center">
									<div className="text-xs text-zinc-400 mb-1">p95 Latency</div>
									<div className="text-lg font-mono font-semibold text-zinc-100">
										{provider.latency.p95}ms
									</div>
								</div>
								<div className="text-center">
									<div className="text-xs text-zinc-400 mb-1">p99 Latency</div>
									<div className="text-lg font-mono font-semibold text-zinc-100">
										{provider.latency.p99}ms
									</div>
								</div>
							</div>

							{/* Health Stats */}
							<div className="grid grid-cols-2 gap-4 mt-3 pt-3 border-t border-zinc-800">
								<div>
									<div className="text-xs text-zinc-400">Consecutive Failures</div>
									<div className="text-sm font-semibold text-zinc-100">
										{provider.consecutiveFailures}
									</div>
								</div>
								<div>
									<div className="text-xs text-zinc-400">Consecutive Successes</div>
									<div className="text-sm font-semibold text-zinc-100">
										{provider.consecutiveSuccesses}
									</div>
								</div>
							</div>

							{/* Last Check */}
							<div className="mt-3 pt-3 border-t border-zinc-800 text-xs text-zinc-400">
								Last checked: {new Date(provider.lastCheckTime).toLocaleTimeString()}
							</div>
						</Card>
					))
				)}
			</div>
		</div>
	);
};
