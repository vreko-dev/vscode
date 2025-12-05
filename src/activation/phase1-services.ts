import { ServiceFederation } from "@snapback/core/mcp";
import { LazyLoader } from "../services/LazyLoader.js";
import { logger } from "../utils/logger.js";
import { PhaseLogger } from "./phaseLogger.js";

/**
 * Initialize Phase 1 services with lazy loading
 * Returns LazyLoader instead of initialized instance to optimize activation time
 */
export function initializePhase1Services() {
	try {
		// Create lazy loader for ServiceFederation (deferred initialization)
		const federationLoader = new LazyLoader(async () => {
			logger.info("ServiceFederation loading (lazy)...");
			const federation = new ServiceFederation(process.cwd());
			logger.info("ServiceFederation loaded successfully");
			return federation;
		}, "ServiceFederation");

		logger.info("ServiceFederation LazyLoader created");
		PhaseLogger.logPhase("1: Core Services (lazy)");

		return { federationLoader };
	} catch (error) {
		PhaseLogger.logError("1: Core Services", error as Error);
		throw error;
	}
}
