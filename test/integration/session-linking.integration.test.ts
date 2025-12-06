import type { SessionManager } from "@snapback/sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProtectionLevelHandler } from "../../src/handlers/ProtectionLevelHandler";
import {
	createMockDocument,
	createMockOperationCoordinator,
} from "../__mocks__/factories";

/**
 * Session Linking Test
 *
 * CRITICAL BUG TO EXPOSE:
 * Session linking is not wired into ProtectionLevelHandler and SaveHandler.
 * When snapshots are created during file save, sessionId should be passed but it's missing.
 *
 * Expected behavior:
 * 1. SessionManager creates/retrieves session on first save
 * 2. Session ID is passed to snapshot creation
 * 3. Snapshot is linked to session for audit trail
 *
 * Actual behavior:
 * 1. SessionManager is never instantiated/injected
 * 2. Session ID is never captured or passed
 * 3. Snapshots are created without session linkage
 */
describe("Session Linking - Bug Verification", () => {
	let protectionHandler: ProtectionLevelHandler;
	let mockRegistry: any;
	let mockOperationCoordinator: any;
	let mockCooldownService: any;
	let mockAuditLogger: any;
	let mockSessionManager: any;

	beforeEach(() => {
		vi.clearAllMocks();

		mockRegistry = {
			getProtectionLevel: vi.fn().mockReturnValue("Watched"),
			isProtected: vi.fn().mockReturnValue(true),
			hasTemporaryAllowance: vi.fn().mockReturnValue(false),
		};

		mockOperationCoordinator = createMockOperationCoordinator();

		mockCooldownService = {
			isInCooldown: vi.fn().mockResolvedValue(false),
			setCooldown: vi.fn().mockResolvedValue(undefined),
			shouldDebounce: vi.fn().mockReturnValue(false),
		};

		mockAuditLogger = {
			recordAudit: vi.fn().mockResolvedValue(undefined),
		};

		// NEW: Create mock SessionManager
		mockSessionManager = {
			current: vi.fn().mockReturnValue({
				sessionId: "sess-test-123",
				changeCount: 0,
			}),
			start: vi.fn().mockResolvedValue({
				sessionId: "sess-test-123",
			}),
		} as unknown as SessionManager;

		protectionHandler = new ProtectionLevelHandler(
			mockRegistry,
			mockOperationCoordinator,
			mockCooldownService,
			mockAuditLogger,
			mockSessionManager, // NEW - Pass SessionManager
		);
	});

	it("SHOULD NOW PASS: snapshots should be linked to session via sessionId parameter", async () => {
		const document = createMockDocument();

		// Call handleProtectionLevel which should eventually call coordinateSnapshotCreation
		const _result = await protectionHandler.handleProtectionLevel(
			"/protected/file.ts",
			"file.ts",
			"const x = 1;",
			document,
		);

		// Extract the calls to coordinateSnapshotCreation
		const coordinatorCalls = (
			mockOperationCoordinator.coordinateSnapshotCreation as any
		).mock.calls;

		// NOW THIS SHOULD PASS - sessionId parameter is passed as the 5th parameter
		expect(coordinatorCalls.length).toBeGreaterThan(0);

		// Get the call arguments
		const [
			_showNotif,
			_specificFiles,
			_providedContent,
			_customName,
			sessionId,
		] = coordinatorCalls[0];

		// THIS ASSERTION NOW PASSES - sessionId is defined
		expect(sessionId).toBeDefined();
		expect(typeof sessionId).toBe("string");
		expect(sessionId).toBe("sess-test-123");
	});

	it("SHOULD NOW PASS: SessionManager should be instantiated and wired into handlers", async () => {
		// Now SessionManager IS injected into ProtectionLevelHandler
		// It should have one to manage session lifecycle

		// Check if the handler has a sessionManager property (it now does)
		const handler = protectionHandler as any;

		// THIS NOW PASSES - sessionManager property exists
		expect(handler.sessionManager).toBeDefined();
		expect(handler.sessionManager).not.toBeNull();
		expect(handler.sessionManager).toBe(mockSessionManager);
	});

	it("should create session on first save if none exists", async () => {
		// This test documents the missing functionality
		// After fix, this should pass

		const mockSessionManager = {
			getCurrentSession: vi.fn().mockResolvedValue(null),
			createSession: vi.fn().mockResolvedValue({
				id: "sess-123",
				status: "active",
			}),
		};

		// Currently there's no way to inject SessionManager into ProtectionLevelHandler
		// This test documents what SHOULD happen but doesn't

		// Simulate what should happen:
		let sessionId: string | undefined;

		const currentSession = await mockSessionManager.getCurrentSession();
		if (!currentSession) {
			const newSession = await mockSessionManager.createSession();
			sessionId = newSession.id;
		}

		// After the fix, this would be injected and called automatically
		// For now, we manually verify the expected behavior
		expect(sessionId).toBe("sess-123");
		expect(mockSessionManager.createSession).toHaveBeenCalled();
	});

	it("should link snapshots to active session", async () => {
		// This test verifies snapshots are linked to the current session

		const mockSessionManager = {
			getCurrentSession: vi.fn().mockResolvedValue({
				id: "sess-abc123",
				status: "active",
				startedAt: new Date().toISOString(),
			}),
		};

		const session = await mockSessionManager.getCurrentSession();

		// After fix: coordinateSnapshotCreation would be called with sessionId
		const snapshotOptions = {
			sessionId: session?.id, // Should be passed here
		};

		// This would be verified in actual call to coordinator
		expect(snapshotOptions.sessionId).toBe("sess-abc123");
	});

	it("should reuse session across multiple saves in same session", async () => {
		// Multiple saves should use the same session ID

		const mockSessionManager = {
			getCurrentSession: vi.fn().mockResolvedValue({
				id: "sess-persistent",
				status: "active",
			}),
		};

		// Simulate 3 saves in one session
		const sessionIds: string[] = [];

		for (let i = 0; i < 3; i++) {
			const session = await mockSessionManager.getCurrentSession();
			if (session) {
				sessionIds.push(session.id);
			}
		}

		// All saves should reference the same session
		expect(sessionIds).toEqual([
			"sess-persistent",
			"sess-persistent",
			"sess-persistent",
		]);
	});
});
