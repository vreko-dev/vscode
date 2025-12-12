import { logger } from "@snapback/infrastructure";

/**
 * RecoveryDetection identifies when the system is in an unrecoverable state.
 * Triggers recovery mode when protection rules become invalid.
 */
export class RecoveryDetection {
	private isFirstInit = true;

	/**
	 * Detects if current state requires recovery.
	 * Returns false on first initialization to avoid false positives.
	 */
	isRecoverableState(rules?: any): boolean {
		// Skip recovery detection on first init
		if (this.isFirstInit) {
			this.isFirstInit = false;
			logger.debug("RecoveryDetection: Skipping check on first initialization");
			return false;
		}

		// Check if rules are valid
		if (!rules) {
			logger.warn("RecoveryDetection: Invalid rules detected - recovery needed");
			return true;
		}

		// Validate rule structure
		if (typeof rules !== "object" || Array.isArray(rules)) {
			logger.warn("RecoveryDetection: Malformed rules - recovery needed");
			return true;
		}

		logger.debug("RecoveryDetection: Rules are valid");
		return false;
	}

	/**
	 * Returns true if should skip recovery check on first initialization.
	 */
	shouldSkipFirstInit(): boolean {
		return this.isFirstInit;
	}

	/**
	 * Resets the first-init flag (for testing).
	 */
	reset(): void {
		this.isFirstInit = true;
	}
}
