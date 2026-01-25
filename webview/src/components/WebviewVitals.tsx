/**
 * Webview-safe vitals components
 *
 * These are local copies of the @snapback/ui vitals components
 * WITHOUT the motion/react dependency that causes webview crashes.
 *
 * The VS Code webview sandbox has issues with framer-motion's
 * animation loop, causing the webview to crash every ~11 seconds.
 */

// =============================================================================
// DESIGN TOKENS (copied from @snapback/ui/tokens/vitals)
// =============================================================================

const vitalsTokens = {
	health: {
		healthy: {
			bg: "bg-emerald-500/10",
			text: "text-emerald-400",
			glow: "shadow-[0_0_15px_rgba(52,211,153,0.3)]",
			label: "stable",
		},
		elevated: {
			bg: "bg-amber-500/10",
			text: "text-amber-400",
			glow: "shadow-[0_0_15px_rgba(251,191,36,0.3)]",
			label: "elevated",
		},
		critical: {
			bg: "bg-red-500/10",
			text: "text-red-400",
			glow: "shadow-[0_0_15px_rgba(239,68,68,0.4)]",
			label: "critical",
		},
	},
	neutral: {
		dim: { text: "text-zinc-600" },
		muted: { text: "text-zinc-500" },
		border: { default: "border-zinc-800" },
		background: { surface: "bg-zinc-900/50" },
	},
	terminal: {
		good: "text-emerald-400",
		warn: "text-amber-400",
		dim: "text-zinc-600",
		active: "text-zinc-300",
		prompt: "text-zinc-500",
	},
} as const;

type HealthStatus = "healthy" | "elevated" | "critical";

// =============================================================================
// UTILITY
// =============================================================================

function cn(...classes: (string | undefined | false)[]): string {
	return classes.filter(Boolean).join(" ");
}

// =============================================================================
// STATIC SCORE (replaces AnimatedScore)
// =============================================================================

interface StaticScoreProps {
	value: number;
	className?: string;
}

function StaticScore({ value, className }: StaticScoreProps) {
	return <span className={className}>{Math.round(value)}</span>;
}

// =============================================================================
// HEALTH BADGE
// =============================================================================

interface HealthBadgeProps {
	score: number;
	status?: HealthStatus;
}

function HealthBadge({ score, status = "healthy" }: HealthBadgeProps) {
	const config = vitalsTokens.health[status];

	return (
		<div
			data-testid="health-badge"
			role="status"
			aria-label={`Workspace health: ${score}% - ${config.label}`}
			className={cn(
				"inline-flex items-center gap-2 px-3 py-1.5 rounded-full",
				"transition-shadow duration-500",
				config.bg,
				config.glow,
			)}
		>
			<span className={cn("text-sm font-medium", config.text)}>{config.label}</span>
			<span className={cn("text-lg font-bold tabular-nums", config.text)}>
				<StaticScore value={score} />
			</span>
		</div>
	);
}

// =============================================================================
// TERMINAL VITALS
// =============================================================================

interface VitalsData {
	pulse: number;
	temperature: number;
	pressure: number;
	oxygen: number;
	score: number;
}

type LineStatus = "dim" | "active" | "good" | "warn";

const statusColors: Record<LineStatus, string> = {
	dim: vitalsTokens.terminal.dim,
	active: vitalsTokens.terminal.active,
	good: vitalsTokens.terminal.good,
	warn: vitalsTokens.terminal.warn,
};

interface LineProps {
	label: string;
	value: string;
	status: LineStatus;
	showCheck?: boolean;
}

function Line({ label, value, status, showCheck }: LineProps) {
	return (
		<div className="flex items-center gap-2">
			<span className={vitalsTokens.neutral.dim.text}>|-</span>
			<span className={cn(vitalsTokens.neutral.muted.text, "w-20")}>{label}:</span>
			<span className={statusColors[status]}>
				{value}
				{showCheck && " ✓"}
			</span>
		</div>
	);
}

interface TerminalVitalsProps {
	vitals: VitalsData;
}

function TerminalVitals({ vitals }: TerminalVitalsProps) {
	const isHealthy = vitals.score === 100;

	const pulseValue = vitals.pulse === 0 ? "resting" : `${vitals.pulse}/min`;
	const pulseStatus: LineStatus = vitals.pulse === 0 ? "dim" : "active";

	const tempValue = vitals.temperature === 0 ? "cold" : `${vitals.temperature}% AI`;
	const tempStatus: LineStatus = vitals.temperature === 0 ? "dim" : "warn";

	const pressureValue = vitals.pressure === 0 ? "nominal" : `${vitals.pressure}%`;
	const pressureStatus: LineStatus = vitals.pressure > 50 ? "warn" : vitals.pressure === 0 ? "good" : "active";

	const oxygenValue = `${vitals.oxygen}% coverage`;
	const oxygenStatus: LineStatus = vitals.oxygen === 100 ? "good" : "warn";

	return (
		<div
			data-testid="terminal-vitals"
			role="region"
			aria-label="Workspace vitals status"
			className="font-mono text-sm"
		>
			{/* Header */}
			<div
				className={cn(
					"flex items-center justify-between pb-2 mb-4",
					vitalsTokens.neutral.border.default,
					"border-b",
				)}
			>
				<div className="flex items-center gap-2">
					<span className={vitalsTokens.terminal.prompt}>$</span>
					<span className="text-zinc-300">snapback status</span>
				</div>
				<div
					data-testid="terminal-score"
					className={cn(
						"px-2 py-0.5 rounded text-xs font-bold",
						isHealthy
							? `${vitalsTokens.health.healthy.bg.replace("/10", "/20")} ${vitalsTokens.health.healthy.text}`
							: `${vitalsTokens.health.elevated.bg.replace("/10", "/20")} ${vitalsTokens.health.elevated.text}`,
					)}
				>
					{vitals.score}
				</div>
			</div>

			{/* Output lines */}
			<div className="space-y-1 text-zinc-400">
				<Line label="pulse" value={pulseValue} status={pulseStatus} />
				<Line label="temp" value={tempValue} status={tempStatus} />
				<Line
					label="pressure"
					value={pressureValue}
					status={pressureStatus}
					showCheck={vitals.pressure === 0}
				/>
				<Line label="oxygen" value={oxygenValue} status={oxygenStatus} showCheck={vitals.oxygen === 100} />
			</div>

			{/* Summary */}
			<div className="mt-4 pt-3 border-t border-zinc-800">
				{isHealthy ? (
					<span className="text-emerald-400">✓ workspace healthy - all ops safe</span>
				) : (
					<span className="text-amber-400">⚠ elevated activity - monitoring</span>
				)}
			</div>
		</div>
	);
}

// =============================================================================
// WORKSPACE VITALS (main export)
// =============================================================================

interface Guidance {
	message: string;
}

export interface WorkspaceVitalsProps {
	vitals: VitalsData;
	guidance?: Guidance;
	showInitPrompt?: boolean;
}

function getVitalsStatus(vitals: VitalsData): HealthStatus {
	if (vitals.score >= 90) {
		return "healthy";
	}
	if (vitals.score >= 60) {
		return "elevated";
	}
	return "critical";
}

/**
 * Complete workspace vitals dashboard component
 * Webview-safe version without motion/react dependency
 */
export function WorkspaceVitals({ vitals, guidance, showInitPrompt = false }: WorkspaceVitalsProps) {
	const status = getVitalsStatus(vitals);

	return (
		<div
			data-testid="workspace-vitals"
			role="region"
			aria-labelledby="workspace-vitals-heading"
			className="space-y-4"
		>
			{/* Header */}
			<div data-testid="workspace-vitals-header" className="flex items-center justify-between">
				<h2 id="workspace-vitals-heading" className="text-lg font-semibold">
					Workspace Vitals
				</h2>
				<HealthBadge score={vitals.score} status={status} />
			</div>

			{/* Terminal-style vitals */}
			<TerminalVitals vitals={vitals} />

			{/* Agent Guidance (optional) */}
			{guidance && (
				<div
					data-testid="agent-guidance"
					className={cn(
						"p-3 rounded-lg border",
						status === "healthy"
							? `${vitalsTokens.health.healthy.bg.replace("/10", "/5")} ${vitalsTokens.health.healthy.text.replace("text-", "border-").replace("-400", "-500/20")}`
							: status === "elevated"
								? `${vitalsTokens.health.elevated.bg.replace("/10", "/5")} ${vitalsTokens.health.elevated.text.replace("text-", "border-").replace("-400", "-500/20")}`
								: "bg-red-500/5 border-red-500/20",
					)}
				>
					<p
						className={cn(
							"text-sm",
							status === "healthy"
								? vitalsTokens.health.healthy.text
								: status === "elevated"
									? vitalsTokens.health.elevated.text
									: "text-red-400",
						)}
					>
						{guidance.message}
					</p>
				</div>
			)}

			{/* Init Prompt */}
			{showInitPrompt && (
				<div
					data-testid="init-prompt"
					className={cn(
						"p-4 rounded-lg border text-center",
						vitalsTokens.neutral.background.surface,
						vitalsTokens.neutral.border.default,
					)}
				>
					<p className={cn("text-sm mb-2", vitalsTokens.neutral.muted.text)}>
						Initialize SnapBack to start tracking
					</p>
					<button
						type="button"
						className={cn(
							"px-4 py-2 rounded-lg transition-colors text-sm font-medium",
							vitalsTokens.health.healthy.bg.replace("/10", "/20"),
							vitalsTokens.health.healthy.text,
							"hover:bg-emerald-500/30",
						)}
					>
						Initialize Workspace
					</button>
				</div>
			)}
		</div>
	);
}
