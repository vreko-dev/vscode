/**
 * AlertGenerator - Generates proactive alerts based on workspace context
 *
 * Monitors file changes, protection patterns, violation history, and workspace
 * pressure to generate contextual alerts for LLMs.
 *
 * @module services/AlertGenerator
 */

import { basename, isAbsolute, join, normalize } from "node:path";
import type { ProactiveAlert } from "../types/mcp";

/**
 * Violation record from history
 */
interface ViolationRecord {
	type: string;
	count: number;
	lastOccurrence: number;
}

/**
 * File protection service interface
 */
interface IFileProtectionService {
	isProtected(filePath: string): boolean;
	getProtectedFiles(): string[];
}

/**
 * Violation reader interface
 */
interface IViolationReader {
	getViolationsForFile(filePath: string): Promise<ViolationRecord[]>;
}

/**
 * Pressure gauge interface
 */
interface IPressureGauge {
	getCurrentPressure(): Promise<number>;
}

/**
 * Alert generator configuration
 */
export interface AlertGeneratorConfig {
	workspaceRoot: string;
	fileProtectionService: IFileProtectionService;
	violationReader: IViolationReader;
	pressureGauge: IPressureGauge;
}

// Critical file patterns
const CRITICAL_FILE_PATTERNS = [/\.env/, /secrets?\./, /\.key$/, /\.pem$/, /credentials/i];
const HIGH_RISK_PATTERNS = [/auth/, /payment/, /billing/, /stripe/];

export class AlertGenerator {
	private workspaceRoot: string;
	private fileProtectionService: IFileProtectionService;
	private violationReader: IViolationReader;
	private pressureGauge: IPressureGauge;

	constructor(config: AlertGeneratorConfig) {
		this.workspaceRoot = config.workspaceRoot;
		this.fileProtectionService = config.fileProtectionService;
		this.violationReader = config.violationReader;
		this.pressureGauge = config.pressureGauge;
	}

	/**
	 * Check a file and generate relevant alerts
	 */
	async checkFile(filePath: string): Promise<ProactiveAlert[]> {
		try {
			if (!filePath || filePath.length === 0) {
				return [];
			}

			// Normalize path
			const normalizedPath = this.normalizePath(filePath);
			const alerts: ProactiveAlert[] = [];

			// Check if this is a critical file
			if (this.isCriticalFile(normalizedPath)) {
				alerts.push(this.generateCriticalFileAlert(normalizedPath));
				return alerts; // Critical alert is enough
			}

			// Check if protected
			if (!this.isFileProtected(normalizedPath)) {
				return alerts;
			}

			// Check for past violations
			const violations = await this.violationReader.getViolationsForFile(normalizedPath);
			if (violations && violations.length > 0) {
				const totalIssues = violations.reduce((sum, v) => sum + v.count, 0);
				alerts.push(this.generateHighRiskAlert(normalizedPath, totalIssues, violations[0].type));
			} else if (this.isHighRiskFile(normalizedPath)) {
				// No violations but still high-risk by pattern
				alerts.push(this.generateHighRiskAlert(normalizedPath, 0, "high-risk pattern"));
			}

			return alerts;
		} catch (_error) {
			// Gracefully handle errors - return empty array
			return [];
		}
	}

	/**
	 * Check current workspace pressure and generate alert if needed
	 */
	async checkPressure(): Promise<ProactiveAlert | null> {
		try {
			const pressure = await this.pressureGauge.getCurrentPressure();

			if (pressure > 70) {
				return {
					id: this.generateId(),
					timestamp: Date.now(),
					severity: pressure > 85 ? "critical" : "warning",
					category: "pressure_threshold",
					summary: `⚠️ Workspace pressure at ${pressure}% - consider creating a snapshot`,
					suggested_action: "Create a snapshot before continuing",
					confidence: 85,
					dismissible: true,
				};
			}

			return null;
		} catch (_error) {
			return null;
		}
	}

	/**
	 * Check for violation recurrence in a specific file
	 */
	async checkViolations(filePath: string): Promise<ProactiveAlert | null> {
		try {
			const normalizedPath = this.normalizePath(filePath);
			const violations = await this.violationReader.getViolationsForFile(normalizedPath);

			if (!violations || violations.length === 0) {
				return null;
			}

			const mostRecent = violations.sort((a, b) => b.lastOccurrence - a.lastOccurrence)[0];

			return {
				id: this.generateId(),
				timestamp: Date.now(),
				severity: "warning",
				category: "violation_recurrence",
				summary: `⚠️ This file had ${mostRecent.type} issue ${mostRecent.count} time(s) before`,
				details: `Last occurrence: ${new Date(mostRecent.lastOccurrence).toLocaleString()}`,
				suggested_action: `Review pattern: ${mostRecent.type}`,
				learning_id: `violation-${mostRecent.type}`,
				confidence: 95,
				dismissible: true,
			};
		} catch (_error) {
			return null;
		}
	}

	/**
	 * Check if file is protected
	 */
	private isFileProtected(filePath: string): boolean {
		try {
			return this.fileProtectionService.isProtected(filePath);
		} catch {
			return false;
		}
	}

	/**
	 * Check if file matches critical patterns
	 */
	private isCriticalFile(filePath: string): boolean {
		const fileName = basename(filePath);
		return CRITICAL_FILE_PATTERNS.some((pattern) => pattern.test(fileName));
	}

	/**
	 * Check if file matches high-risk patterns
	 */
	private isHighRiskFile(filePath: string): boolean {
		return HIGH_RISK_PATTERNS.some((pattern) => pattern.test(filePath));
	}

	/**
	 * Generate critical file alert
	 */
	private generateCriticalFileAlert(filePath: string): ProactiveAlert {
		const fileName = basename(filePath);
		return {
			id: this.generateId(),
			timestamp: Date.now(),
			severity: "critical",
			category: "critical_file_touch",
			summary: `🚨 Modifying critical file: ${fileName}`,
			details: "This file contains sensitive configuration or secrets",
			suggested_action: "Ensure changes are reviewed and snapshotted",
			confidence: 95,
			dismissible: false, // Critical files - don't allow dismiss
		};
	}

	/**
	 * Generate high-risk file alert
	 */
	private generateHighRiskAlert(filePath: string, issueCount: number, issueType: string): ProactiveAlert {
		const fileName = basename(filePath);
		const summary =
			issueCount > 0
				? `⚠️ ${fileName} has caused ${issueCount} issue(s) in the past`
				: `⚠️ ${fileName} is a high-risk file`;

		return {
			id: this.generateId(),
			timestamp: Date.now(),
			severity: "warning",
			category: "high_risk_file",
			summary,
			details: issueCount > 0 ? `Most recent: ${issueType}` : "Pattern-based risk detection",
			suggested_action: "Review changes carefully before committing",
			confidence: 90,
			dismissible: true,
		};
	}

	/**
	 * Normalize file path for consistent comparison
	 */
	private normalizePath(filePath: string): string {
		if (!filePath) {
			return "";
		}

		// If not absolute, make it relative to workspace
		if (!isAbsolute(filePath)) {
			return normalize(join(this.workspaceRoot, filePath));
		}

		return normalize(filePath);
	}

	/**
	 * Generate unique alert ID
	 */
	private generateId(): string {
		return `alert-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
	}
}
