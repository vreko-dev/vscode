import { describe, expect, it, vi, beforeEach } from "vitest";
import { UserIdentityService } from "@vscode/services/UserIdentityService";

describe("UserIdentityService", () => {
	let service: UserIdentityService;

    // Mocks
	const mockAnonymousIdManager = {
		getOrCreate: vi.fn(),
		get: vi.fn(),
	};
	const mockAuthService = {
		getCurrentUser: vi.fn(),
	};
	const mockTelemetryProxy = {
		identify: vi.fn(),
	} as any;

	beforeEach(() => {
		vi.resetAllMocks();
		service = new UserIdentityService(
			mockAnonymousIdManager as any,
			mockAuthService as any,
			mockTelemetryProxy as any,
		);
	});

	describe("getCurrentId", () => {
		it("should return Authenticated ID if user is logged in", async () => {
			// GIVEN: User is logged in
			mockAuthService.getCurrentUser.mockResolvedValue({ id: "auth_user_123" });
            // Mock anon ID ensuring it's NOT returned
            mockAnonymousIdManager.getOrCreate.mockResolvedValue("anon_123");

			// WHEN: Getting ID
			const id = await service.getCurrentId();

			// THEN: Return Auth ID
			expect(id).toBe("auth_user_123");
		});

		it("should return Anonymous ID if user is NOT logged in", async () => {
			// GIVEN: User is NOT logged in
			mockAuthService.getCurrentUser.mockResolvedValue(null);
			// AND: Anon ID exists or is created
			mockAnonymousIdManager.getOrCreate.mockResolvedValue("anon_generated_xyz");

			// WHEN: Getting ID
			const id = await service.getCurrentId();

			// THEN: Return Anon ID
			expect(id).toBe("anon_generated_xyz");
		});
	});

	describe("handleLogin", () => {
		it("should call identify with linking if anonymous ID exists", async () => {
			// GIVEN: User just logged in
			const authId = "auth_new_login";
            // AND: Experienced user (has anon ID)
			mockAnonymousIdManager.get.mockResolvedValue("anon_existing_123");

			// WHEN: Handling login
			await service.handleLogin(authId);

			// THEN: Should identify(auth, anon) to merge
			expect(mockTelemetryProxy.identify).toHaveBeenCalledWith(authId, "anon_existing_123");
		});

		it("should call identify without linking if no anonymous ID exists", async () => {
			// GIVEN: Fresh install or weird state (no anon ID)
			const authId = "auth_only";
			mockAnonymousIdManager.get.mockResolvedValue(null);

			// WHEN: Handling login
			await service.handleLogin(authId);

			// THEN: Should identify(auth) only
			expect(mockTelemetryProxy.identify).toHaveBeenCalledWith(authId);
		});

        it("should handle errors gracefully", async () => {
            // GIVEN: Telemetry fails
            mockAnonymousIdManager.get.mockResolvedValue("anon_1");
            mockTelemetryProxy.identify.mockRejectedValue(new Error("Network Error"));

            // WHEN: Handling login
            // THEN: Should not throw
            await expect(service.handleLogin("auth_1")).resolves.not.toThrow();
        });
	});
});
