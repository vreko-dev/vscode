import { vi } from "vitest";

/**
 * Mock factory for Guardian service
 *
 * Provides test doubles for snapshot validation and integrity checking.
 * Used to verify snapshot lifecycle operations without actual file system access.
 */
export const createMockGuardian = () => ({
	/**
	 * Validates snapshot data structure and contents
	 * @returns Promise resolving to validation result (default: true)
	 */
	validateSnapshot: vi.fn().mockResolvedValue(true),

	/**
	 * Checks if a snapshot can be safely restored
	 * @returns Promise resolving to restoration eligibility (default: true)
	 */
	canRestore: vi.fn().mockResolvedValue(true),

	/**
	 * Verifies snapshot integrity and data consistency
	 * @returns Promise resolving to integrity check result
	 */
	checkIntegrity: vi.fn().mockResolvedValue({ valid: true }),

	/**
	 * Quick document risk assessment
	 * @returns Promise resolving to risk assessment result
	 */
	quickCheckDoc: vi.fn().mockResolvedValue({
		score: 0.0,
		factors: [],
		severity: "low",
	}),
});

/**
 * Alias for createMockGuardian factory
 */
export const create = createMockGuardian;

/**
 * Quick document risk assessment
 * @returns Promise resolving to risk assessment result
 */
export const quickCheckDoc = vi.fn().mockResolvedValue({
	score: 0.0,
	factors: [],
	severity: "low",
});
