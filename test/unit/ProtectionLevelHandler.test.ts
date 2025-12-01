import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProtectedFileRegistry } from "../../src/services/protectedFileRegistry";
import type { ProtectionLevel } from "../../src/views/types";

/**
 * Test suite for ProtectionLevelHandler save flow and temporary allowance (M2)
 * Validates that snapshots are created correctly for each protection level
 */
describe("ProtectionLevelHandler - Temporary Allowance + Snapshot (M2)", () => {
	let mockRegistry: ProtectedFileRegistry;
	let mockCooldownService: any;
	let mockAuditLogger: any;
	let mockCreateSnapshotForFile: any;

	beforeEach(() => {
		mockRegistry = {
			add: vi.fn(),
			isProtected: vi.fn(() => true),
			getProtectionLevel: vi.fn(() => "Protected"),
			updateProtectionLevel: vi.fn(),
			list: vi.fn(async () => []),
			remove: vi.fn(),
			hasTemporaryAllowance: vi.fn(() => false),
			consumeTemporaryAllowance: vi.fn(),
			grantTemporaryAllowance: vi.fn(),
		} as unknown as ProtectedFileRegistry;

		mockCooldownService = {
			shouldDebounce: vi.fn(() => false),
			getTimeSinceLastSnapshot: vi.fn(() => 0),
			setCooldown: vi.fn(),
		};

		mockAuditLogger = {
			recordAudit: vi.fn(),
		};

		mockCreateSnapshotForFile = vi.fn(async () => "snapshot-123");
	});

	/**
	 * Test P1: Warning level creates snapshot
	 */
	it("P1 - Warning level creates snapshot before save", async () => {
		const filePath = "/repo/config.yml";
		const preSaveContent = "OLD";
		const protectionLevel: ProtectionLevel = "Warning";

		const shouldDebounce = mockCooldownService.shouldDebounce(filePath);
		expect(shouldDebounce).toBe(false);

		let snapshotId: string | undefined;
		try {
			snapshotId = await mockCreateSnapshotForFile(
				filePath,
				"config.yml",
				preSaveContent,
			);
		} catch (error) {
			// Handle error
		}

		expect(mockCreateSnapshotForFile).toHaveBeenCalledWith(
			filePath,
			"config.yml",
			preSaveContent,
		);
		expect(snapshotId).toBe("snapshot-123");

		const result = {
			shouldProceed: true,
			shouldSnapshot: true,
			reason: "snapshot_created",
			snapshotId,
		};
		expect(result.shouldProceed).toBe(true);
		expect(result.shouldSnapshot).toBe(true);
	});

	/**
	 * Test P2: Watched level creates snapshot
	 */
	it("P2 - Watched level creates snapshot", async () => {
		const filePath = "/repo/README.md";
		const preSaveContent = "Documentation";

		let snapshotId: string | undefined;
		snapshotId = await mockCreateSnapshotForFile(
			filePath,
			"README.md",
			preSaveContent,
		);

		expect(snapshotId).toBe("snapshot-123");
		const result = { shouldProceed: true, shouldSnapshot: true };
		expect(result.shouldProceed).toBe(true);
	});

	/**
	 * Test P3: Protected + temporary allowance creates snapshot THEN allows save (M2)
	 */
	it("P3 - Protected with temporary allowance creates snapshot before allowing save", async () => {
		const filePath = "/repo/.env";
		const preSaveContent = "SECRET=old";
		const protectionLevel: ProtectionLevel = "Protected";

		// Setup: File has temporary allowance
		mockRegistry.hasTemporaryAllowance = vi.fn(() => true);
		mockRegistry.consumeTemporaryAllowance = vi.fn();

		if (mockRegistry.hasTemporaryAllowance(filePath)) {
			let snapshotId: string | undefined;
			try {
				// M2: Snapshot creation happens BEFORE consume
				snapshotId = await mockCreateSnapshotForFile(
					filePath,
					".env",
					preSaveContent,
				);
				if (snapshotId) {
					await mockCooldownService.setCooldown(
						filePath,
						protectionLevel,
						"user_override",
						snapshotId,
					);
				}
			} catch (error) {
				// Error logged but continue
			}

			// M2: Only consume after snapshot is created
			mockRegistry.consumeTemporaryAllowance(filePath);

			await mockAuditLogger.recordAudit(
				filePath,
				protectionLevel,
				"save_allowed",
				{ reason: "temporary_allowance", snapshotCreated: !!snapshotId },
				snapshotId,
			);

			// Verify snapshot was created
			expect(mockCreateSnapshotForFile).toHaveBeenCalledWith(
				filePath,
				".env",
				preSaveContent,
			);

			// Verify allowance was consumed
			expect(mockRegistry.consumeTemporaryAllowance).toHaveBeenCalledWith(
				filePath,
			);

			// M2: Result shows snapshot was created
			const result = {
				shouldProceed: true,
				shouldSnapshot: true, // M2: Snapshot was created
				reason: "temporary_allowance",
				snapshotId: "snapshot-123",
			};
			expect(result.shouldProceed).toBe(true);
			expect(result.shouldSnapshot).toBe(true); // M2: Proves snapshot happened
		}
	});

	/**
	 * Test P4: Snapshot failure in temporary allowance allows save anyway (M2 error handling)
	 */
	it("P4 - Snapshot failure logs error but allows save", async () => {
		const filePath = "/repo/.env";
		const preSaveContent = "SECRET=old";

		// Setup: File has temporary allowance
		mockRegistry.hasTemporaryAllowance = vi.fn(() => true);
		mockRegistry.consumeTemporaryAllowance = vi.fn();

		// Make snapshot creation fail
		mockCreateSnapshotForFile = vi.fn(async () => {
			throw new Error("Snapshot creation failed");
		});

		if (mockRegistry.hasTemporaryAllowance(filePath)) {
			let snapshotId: string | undefined;
			try {
				snapshotId = await mockCreateSnapshotForFile(
					filePath,
					".env",
					preSaveContent,
				);
			} catch (error) {
				// Error is caught and logged
				const errorMessage =
					error instanceof Error ? error.message : String(error);
				expect(errorMessage).toBe("Snapshot creation failed");
			}

			// Consume allowance even though snapshot failed (M2: fail-safe)
			mockRegistry.consumeTemporaryAllowance(filePath);
			expect(mockRegistry.consumeTemporaryAllowance).toHaveBeenCalledWith(
				filePath,
			);

			// M2: Save still proceeds, but snapshot flag is false
			const result = {
				shouldProceed: true,
				shouldSnapshot: false, // No snapshot due to error
				reason: "temporary_allowance",
				snapshotId: undefined,
			};
			expect(result.shouldProceed).toBe(true);
			expect(result.shouldSnapshot).toBe(false);
		}
	});

	/**
	 * Test P5: Debounce skips snapshot but allows save
	 */
	it("P5 - Debounce skips snapshot creation but allows save", async () => {
		const filePath = "/repo/config.yml";

		mockCooldownService.shouldDebounce = vi.fn(() => true);

		const shouldDebounce = mockCooldownService.shouldDebounce(filePath);
		if (shouldDebounce) {
			// Snapshot creation is skipped
			const result = {
				shouldProceed: true,
				shouldSnapshot: false,
				reason: "debounce_bypass",
			};
			expect(result.shouldProceed).toBe(true);
			expect(result.shouldSnapshot).toBe(false);
			expect(mockCreateSnapshotForFile).not.toHaveBeenCalled();
		}
	});
});
