/**
 * Formatting utilities for human-readable display
 *
 * @packageDocumentation
 */

/**
 * Format a number for human-readable display
 *
 * @param value - The number to format
 * @param options - Formatting options
 * @returns Formatted string (e.g., "2.7M", "15K", "342")
 *
 * @example
 * formatNumber(2739700)  // "2.7M"
 * formatNumber(15432)    // "15.4K"
 * formatNumber(342)      // "342"
 * formatNumber(0)        // "0"
 */
export function formatNumber(
	value: number,
	options: {
		/** Number of decimal places (default: 1) */
		decimals?: number;
		/** Always show decimals even if .0 (default: false) */
		forceDecimals?: boolean;
	} = {},
): string {
	const { decimals = 1, forceDecimals = false } = options;

	if (value === 0) {
		return "0";
	}

	const absValue = Math.abs(value);
	const sign = value < 0 ? "-" : "";

	// Billions
	if (absValue >= 1_000_000_000) {
		const formatted = (absValue / 1_000_000_000).toFixed(decimals);
		return `${sign}${forceDecimals ? formatted : stripTrailingZeros(formatted)}B`;
	}

	// Millions
	if (absValue >= 1_000_000) {
		const formatted = (absValue / 1_000_000).toFixed(decimals);
		return `${sign}${forceDecimals ? formatted : stripTrailingZeros(formatted)}M`;
	}

	// Thousands
	if (absValue >= 1_000) {
		const formatted = (absValue / 1_000).toFixed(decimals);
		return `${sign}${forceDecimals ? formatted : stripTrailingZeros(formatted)}K`;
	}

	// Small numbers - no suffix
	return `${sign}${Math.round(absValue)}`;
}

/**
 * Strip trailing zeros from a decimal string
 * "2.0" -> "2", "2.50" -> "2.5", "2.75" -> "2.75"
 */
function stripTrailingZeros(value: string): string {
	if (!value.includes(".")) {
		return value;
	}
	return value.replace(/\.?0+$/, "");
}

/**
 * Format bytes for human-readable display
 *
 * @param bytes - The number of bytes
 * @returns Formatted string (e.g., "1.5 MB", "342 KB", "128 B")
 */
export function formatBytes(bytes: number): string {
	if (bytes === 0) {
		return "0 B";
	}

	const units = ["B", "KB", "MB", "GB", "TB"];
	const i = Math.floor(Math.log(bytes) / Math.log(1024));
	const value = bytes / 1024 ** i;

	// Use integer for bytes, 1 decimal for larger units
	if (i === 0) {
		return `${Math.round(value)} B`;
	}

	return `${stripTrailingZeros(value.toFixed(1))} ${units[i]}`;
}

/**
 * Format a duration in milliseconds for human-readable display
 *
 * @param ms - Duration in milliseconds
 * @returns Formatted string (e.g., "2.5s", "150ms", "1m 30s", "2h 15m")
 */
export function formatDuration(ms: number): string {
	if (ms < 1000) {
		return `${Math.round(ms)}ms`;
	}

	if (ms < 60_000) {
		return `${stripTrailingZeros((ms / 1000).toFixed(1))}s`;
	}

	const totalMinutes = Math.floor(ms / 60_000);
	const hours = Math.floor(totalMinutes / 60);

	if (hours > 0) {
		const remainingMinutes = totalMinutes % 60;
		return remainingMinutes === 0 ? `${hours}h` : `${hours}h ${remainingMinutes}m`;
	}

	const seconds = Math.round((ms % 60_000) / 1000);

	if (seconds === 0) {
		return `${totalMinutes}m`;
	}

	return `${totalMinutes}m ${seconds}s`;
}

/**
 * Format a percentage for display
 *
 * @param value - The percentage value (0-100)
 * @param options - Formatting options
 * @returns Formatted string (e.g., "85%", "99.5%")
 */
export function formatPercent(
	value: number,
	options: {
		/** Number of decimal places (default: 0) */
		decimals?: number;
	} = {},
): string {
	const { decimals = 0 } = options;
	const formatted = value.toFixed(decimals);
	return `${stripTrailingZeros(formatted)}%`;
}

/**
 * Truncate string with ellipsis
 *
 * @param str - String to truncate
 * @param maxLength - Maximum length before truncation
 * @returns Truncated string with ellipsis if needed
 */
export function truncate(str: string, maxLength: number): string {
	if (str.length <= maxLength) {
		return str;
	}
	return `${str.slice(0, maxLength - 3)}...`;
}

// =============================================================================
// Celebration & Recovery Types
// =============================================================================

/**
 * Recovery event data for magnitude scoring
 */
export interface RecoveryEvent {
	fileCount: number;
	totalLinesChanged: number;
	aiDetected: boolean;
	aiTool?: "cursor" | "copilot" | "claude" | "codewhisperer" | "unknown";
	aiConfidence?: number;
	timeSinceChange: number;
	clusterRestore: boolean;
	isFirstRecovery: boolean;
}

/**
 * Celebration tier based on recovery magnitude
 */
export type CelebrationTier = "subtle" | "satisfying" | "heroic" | "legendary";

/**
 * Result of magnitude scoring
 */
export interface RecoveryScore {
	tier: CelebrationTier;
	score: number;
	factors: string[];
}

/**
 * AI confidence display result
 */
export type AIConfidenceDisplay =
	| { level: "high"; label: string }
	| { level: "medium"; label: string }
	| { level: "low"; label: null };

// =============================================================================
// Celebration Functions
// =============================================================================

/**
 * Score the magnitude of a recovery event and determine celebration tier
 */
export function scoreMagnitude(event: RecoveryEvent): RecoveryScore {
	let score = 0;
	const factors: string[] = [];

	// File count weight (1-4 points)
	if (event.fileCount >= 10) {
		score += 4;
		factors.push(`${event.fileCount} files`);
	} else if (event.fileCount >= 5) {
		score += 3;
		factors.push(`${event.fileCount} files`);
	} else if (event.fileCount >= 2) {
		score += 2;
		factors.push(`${event.fileCount} files`);
	} else {
		score += 1;
	}

	// Lines changed weight (1-4 points)
	if (event.totalLinesChanged >= 500) {
		score += 4;
		factors.push(`${event.totalLinesChanged.toLocaleString()} lines`);
	} else if (event.totalLinesChanged >= 100) {
		score += 3;
		factors.push(`${event.totalLinesChanged} lines`);
	} else if (event.totalLinesChanged >= 20) {
		score += 2;
	} else {
		score += 1;
	}

	// AI detection bonus (+2 points)
	if (event.aiDetected) {
		score += 2;
		factors.push(`${event.aiTool || "AI"} detected`);
	}

	// Cluster restore bonus (+1 point)
	if (event.clusterRestore) {
		score += 1;
		factors.push("cluster restore");
	}

	// Quick catch bonus (+1 point) - caught it within 1 minute
	if (event.timeSinceChange < 60_000) {
		score += 1;
		factors.push("quick catch");
	}

	let tier: CelebrationTier;
	if (score >= 10) {
		tier = "legendary";
	} else if (score >= 7) {
		tier = "heroic";
	} else if (score >= 4) {
		tier = "satisfying";
	} else {
		tier = "subtle";
	}

	return { tier, score, factors };
}

/**
 * Format tool name for display.
 * Handles both lowercase identifiers (from MCP/daemon) and SCREAMING_SNAKE_CASE
 * identifiers (from AI detection service).
 */
export function formatToolName(tool: string): string {
	const names: Record<string, string> = {
		// Lowercase variants (MCP/daemon/notification events)
		cursor: "Cursor",
		copilot: "GitHub Copilot",
		"github.copilot": "GitHub Copilot",
		claude: "Claude",
		codewhisperer: "CodeWhisperer",
		tabnine: "Tabnine",
		codeium: "Codeium",
		kite: "Kite",
		unknown: "AI",
		// SCREAMING_SNAKE_CASE variants (AI detection service)
		CURSOR: "Cursor",
		GITHUB_COPILOT: "GitHub Copilot",
		GITHUB_COPILOT_X: "GitHub Copilot X",
		CLAUDE: "Claude",
		AMAZON_CODEWHISPERER: "Amazon CodeWhisperer",
		TABNINE: "Tabnine",
		CODEIUM: "Codeium",
		KITE: "Kite",
		JETBRAINS_AI: "JetBrains AI",
	};

	return names[tool] ?? tool.replace(/_/g, " ");
}

/**
 * Format AI confidence for display
 */
export function formatAIConfidence(confidence: number, tool?: string): AIConfidenceDisplay {
	if (confidence >= 85) {
		return {
			level: "high",
			label: tool ? `${formatToolName(tool)} detected` : "AI activity detected",
		};
	}

	if (confidence >= 60) {
		return {
			level: "medium",
			label: "Possible AI activity detected",
		};
	}

	return {
		level: "low",
		label: null,
	};
}

/**
 * Format AI confidence for detail page display
 */
export function formatAIConfidenceForDetailPage(confidence: number, tool?: string): string {
	const display = formatAIConfidence(confidence, tool);

	if (display.level === "low") {
		return `AI detection: ${confidence}% confidence (below threshold)`;
	}

	return `${display.label} (${confidence}% confidence)`;
}
