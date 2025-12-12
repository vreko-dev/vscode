import { logger } from "@snapback/infrastructure";

interface FileDiff {
	additions: string[];
	deletions: string[];
	modifications: string[];
}

/**
 * RestorePreview generates diff preview and calculates risk for restore operations.
 */
export class RestorePreview {
	/**
	 * Generates diff between current state and snapshot.
	 */
	generateDiff(snapshot: any): FileDiff {
		if (!snapshot) {
			logger.warn("RestorePreview: Cannot generate diff without snapshot");
			return {
				additions: [],
				deletions: [],
				modifications: [],
			};
		}

		const diff: FileDiff = {
			additions: snapshot.newFiles || [],
			deletions: snapshot.removedFiles || [],
			modifications: snapshot.changedFiles || [],
		};

		logger.debug("RestorePreview: Diff generated", {
			additions: diff.additions.length,
			deletions: diff.deletions.length,
			modifications: diff.modifications.length,
		});

		return diff;
	}

	/**
	 * Calculates risk score for restore operation.
	 * Higher score = higher risk (0-100).
	 */
	calculateRisk(config: any): number {
		let risk = 0;

		if (!config) {
			return 100; // Unknown config = high risk
		}

		// Risk increases with file modifications
		if (config.changedFiles && Array.isArray(config.changedFiles)) {
			risk += Math.min(config.changedFiles.length * 10, 50);
		}

		// Risk increases with file deletions
		if (config.removedFiles && Array.isArray(config.removedFiles)) {
			risk += Math.min(config.removedFiles.length * 15, 40);
		}

		// Cap risk at 100
		risk = Math.min(risk, 100);

		logger.debug("RestorePreview: Risk calculated", { risk });
		return risk;
	}
}
