/**
 * LearningsService - Learnings, Violations, and Patterns Management
 *
 * Single responsibility: Load and manage data from .snapback/ directory (learnings, violations, patterns).
 *
 * @packageDocumentation
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { logger } from "../../utils/logger";
import type { Learning, Violation, WorkspacePattern } from "./types";

/**
 * Callback for data change notifications
 */
export type LearningsChangeCallback = (event: "learnings-updated" | "violations-updated" | "patterns-updated") => void;

/**
 * Service for managing learnings, violations, and patterns from .snapback directory
 */
export class LearningsService {
	private learnings: Learning[] = [];
	private violations: Violation[] = [];
	private patterns: WorkspacePattern[] = [];
	private onChangeCallback?: LearningsChangeCallback;

	constructor(private readonly snapbackDir: string) {}

	/**
	 * Set change callback for notifying parent service
	 */
	setOnChangeCallback(callback: LearningsChangeCallback): void {
		this.onChangeCallback = callback;
	}

	/**
	 * Get current learnings
	 */
	getLearnings(): Learning[] {
		return [...this.learnings];
	}

	/**
	 * Get current violations
	 */
	getViolations(): Violation[] {
		return [...this.violations];
	}

	/**
	 * Get current patterns
	 */
	getPatterns(): WorkspacePattern[] {
		return [...this.patterns];
	}

	/**
	 * Load all data from .snapback/ directory
	 */
	loadAll(): void {
		this.loadLearnings();
		this.loadViolations();
		this.loadPatterns();
	}

	/**
	 * Load learnings from .snapback/learnings/
	 */
	loadLearnings(): void {
		const learningsDir = path.join(this.snapbackDir, "learnings");
		const files = ["user-learnings.jsonl", "learnings.jsonl"];

		for (const file of files) {
			const filePath = path.join(learningsDir, file);
			if (fs.existsSync(filePath)) {
				this.parseLearningsFile(filePath);
				return;
			}
		}

		this.learnings = [];
	}

	/**
	 * Parse JSONL learnings file
	 */
	private parseLearningsFile(filePath: string): void {
		try {
			const content = fs.readFileSync(filePath, "utf-8");
			const lines = content.trim().split("\n").filter(Boolean);

			this.learnings = lines
				.map((line) => {
					try {
						return JSON.parse(line) as Learning;
					} catch {
						return null;
					}
				})
				.filter((l): l is Learning => l !== null);

			this.onChangeCallback?.("learnings-updated");
		} catch (error) {
			logger.debug("LearningsService: Failed to parse learnings file", { filePath, error });
			this.learnings = [];
		}
	}

	/**
	 * Load violations from .snapback/patterns/violations.jsonl
	 */
	loadViolations(): void {
		const violationsFile = path.join(this.snapbackDir, "patterns", "violations.jsonl");

		if (!fs.existsSync(violationsFile)) {
			this.violations = [];
			return;
		}

		try {
			const content = fs.readFileSync(violationsFile, "utf-8");
			const lines = content.trim().split("\n").filter(Boolean);

			const violationMap = new Map<string, Violation>();

			for (const line of lines) {
				try {
					const entry = JSON.parse(line);
					const key = `${entry.type}:${entry.file}`;

					if (violationMap.has(key)) {
						const existing = violationMap.get(key);
						if (existing) {
							existing.count++;
							existing.date = entry.date || existing.date;
						}
					} else {
						violationMap.set(key, {
							type: entry.type,
							file: entry.file,
							message: entry.message || entry.whatHappened || "",
							count: 1,
							date: entry.date || new Date().toISOString(),
							prevention: entry.prevention,
							promotionStatus: this.getPromotionStatus(1),
						});
					}
				} catch {
					// Skip malformed lines
				}
			}

			// Update promotion status
			for (const violation of violationMap.values()) {
				violation.promotionStatus = this.getPromotionStatus(violation.count);
			}

			this.violations = Array.from(violationMap.values());
			this.onChangeCallback?.("violations-updated");
		} catch (error) {
			logger.debug("LearningsService: Failed to load violations", { error });
			this.violations = [];
		}
	}

	/**
	 * Get promotion status based on occurrence count
	 */
	private getPromotionStatus(count: number): Violation["promotionStatus"] {
		if (count >= 5) {
			return "automated";
		}
		if (count >= 3) {
			return "promoted";
		}
		if (count >= 2) {
			return "ready_for_promotion";
		}
		return "tracking";
	}

	/**
	 * Load patterns from .snapback/patterns/workspace-patterns.json
	 */
	loadPatterns(): void {
		const patternsFile = path.join(this.snapbackDir, "patterns", "workspace-patterns.json");

		if (!fs.existsSync(patternsFile)) {
			this.patterns = [];
			return;
		}

		try {
			const content = fs.readFileSync(patternsFile, "utf-8");
			this.patterns = JSON.parse(content) as WorkspacePattern[];
			this.onChangeCallback?.("patterns-updated");
		} catch (error) {
			logger.debug("LearningsService: Failed to load patterns", { error });
			this.patterns = [];
		}
	}
}
