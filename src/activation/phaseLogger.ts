import { logger } from "../utils/logger.js";

export const PhaseLogger = {
	logPhase(phase: string, details?: Record<string, unknown>) {
		logger.info(`Phase ${phase} completed`, details);
	},

	logError(phase: string, error: Error) {
		logger.error(`Phase ${phase} failed`, error);
	},
};
