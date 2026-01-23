import { logger } from "../utils/logger";
import { PhaseLogger } from "./phaseLogger";

/**
 * Initialize Phase 1 services
 *
 * NOTE: ServiceFederation (@snapback/core) was removed - unused in extension.
 * Heavy MCP operations now handled by language server or MCP server.
 */
export function initializePhase1Services() {
	try {
		logger.info("Phase 1: Core services initialized (no-op)");
		PhaseLogger.logPhase("1: Core Services");

		return {};
	} catch (error) {
		PhaseLogger.logError("1: Core Services", error as Error);
		throw error;
	}
}
