import { logger } from "../utils/logger";

export const PhaseLogger = {
	logPhase(phase: string, details?: Record<string, unknown>) {
		// Only pass details if it's defined and has properties
		if (details && Object.keys(details).length > 0) {
			logger.info(`Phase ${phase} completed`, details);
		} else {
			logger.info(`Phase ${phase} completed`);
		}
	},

	logError(phase: string, error: Error) {
		logger.error(`Phase ${phase} failed`, error);
	},
};
