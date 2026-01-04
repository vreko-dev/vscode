import { LazyLoader } from "../services/LazyLoader";
import { logger } from "../utils/logger";
import { PhaseLogger } from "./phaseLogger";

// Re-export type for consumers (stripped at compile time)
export type { ServiceFederation } from "@snapback/core/mcp";

/**
 * Initialize Phase 1 services with lazy loading
 * Returns LazyLoader instead of initialized instance to optimize activation time
 */
export function initializePhase1Services() {
	try {
		// Create lazy loader for ServiceFederation (deferred initialization)
		// Using dynamic import to avoid bundling @snapback/core (~4MB) into main extension bundle
		const federationLoader = new LazyLoader(async () => {
			logger.info("ServiceFederation loading (lazy)...");
			const { ServiceFederation } = await import("@snapback/core/mcp");
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
