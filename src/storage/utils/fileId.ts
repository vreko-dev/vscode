// apps/vscode/src/storage/utils/fileId.ts
// Re-export ID generation from SDK - Single Source of Truth
// All ID generation logic is now centralized in @snapback/sdk

export {
	generateAuditId,
	generateCheckpointId,
	generateSessionId,
	generateSnapshotId,
	ID_PREFIX,
	type IdPrefix,
	isValidId,
	parseIdTimestamp,
	randomId,
} from "@snapback/sdk";

/**
 * @deprecated Use parseIdTimestamp from @snapback/sdk instead
 * Alias for backward compatibility
 */
export const parseTimestampFromId = (id: string): number | null => {
	// Re-export parseIdTimestamp for backward compatibility with existing callers
	const { parseIdTimestamp } = require("@snapback/sdk");
	return parseIdTimestamp(id);
};
