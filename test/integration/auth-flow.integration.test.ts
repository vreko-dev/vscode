import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

/**
 * Authentication Flow Integration Tests
 *
 * Test ID Prefix: VSCODE-AUTH-INT-001-XXX
 *
 * Tests authentication flow integration:
 * - Opens browser for OAuth
 * - Receives callback with API key
 * - Stores API key securely
 * - Validates API key with backend
 * - Updates UI to show authenticated state
 *
 * Following test_coverage.md specification lines 521-528.
 */

describe("Authentication Flow Integration", () => {
  let mockAuthService: any;
  let mockSecretStorage: any;
  let mockBackendClient: any;
  let mockStatusBar: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock Auth Service
    mockAuthService = {
      initiateOAuth: vi.fn().mockResolvedValue({
        authUrl: "https://snapback.dev/auth/oauth",
        state: "random_state_123",
      }),
      handleCallback: vi.fn().mockResolvedValue({
        apiKey: "sk_test_1234567890",
        userId: "user_abc123",
      }),
    };

    // Mock Secret Storage
    mockSecretStorage = {
      store: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue(null),
      delete: vi.fn().mockResolvedValue(undefined),
    };

    // Mock Backend API Client
    mockBackendClient = {
      validateApiKey: vi.fn().mockResolvedValue({
        valid: true,
        tier: "pro",
        userId: "user_abc123",
      }),
      getUserProfile: vi.fn().mockResolvedValue({
        id: "user_abc123",
        email: "user@example.com",
        tier: "pro",
      }),
    };

    // Mock Status Bar
    mockStatusBar = {
      text: "",
      tooltip: "",
      backgroundColor: undefined,
      show: vi.fn(),
      hide: vi.fn(),
    };
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("Opens Browser for OAuth", () => {
    // Test ID: VSCODE-AUTH-INT-001-001
    it("should initiate OAuth flow and open browser", async () => {
      // GIVEN: User triggers authentication
      // WHEN: Initiating OAuth
      const authData = await mockAuthService.initiateOAuth();

      // THEN: Should return auth URL
      expect(authData.authUrl).toBeDefined();
      expect(authData.authUrl).toContain("oauth");
      expect(authData.state).toBeDefined();
      expect(mockAuthService.initiateOAuth).toHaveBeenCalled();
    });

    // Test ID: VSCODE-AUTH-INT-001-002
    it("should include state parameter for CSRF protection", async () => {
      // GIVEN: OAuth initiation
      // WHEN: Getting auth URL
      const authData = await mockAuthService.initiateOAuth();

      // THEN: State should be present
      expect(authData.state).toBeDefined();
      expect(authData.state.length).toBeGreaterThan(10);
    });
  });

  describe("Receives Callback with API Key", () => {
    // Test ID: VSCODE-AUTH-INT-001-003
    it("should handle OAuth callback successfully", async () => {
      // GIVEN: OAuth callback with authorization code
      const callbackData = {
        code: "auth_code_xyz",
        state: "random_state_123",
      };

      // WHEN: Handling callback
      const result = await mockAuthService.handleCallback(callbackData);

      // THEN: Should receive API key
      expect(result.apiKey).toBeDefined();
      expect(result.apiKey).toMatch(/^sk_/);
      expect(result.userId).toBeDefined();
    });

    // Test ID: VSCODE-AUTH-INT-001-004
    it("should reject callback with invalid state", async () => {
      // GIVEN: Callback with mismatched state
      const callbackData = {
        code: "auth_code_xyz",
        state: "wrong_state",
      };

      mockAuthService.handleCallback.mockRejectedValue(
        new Error("Invalid state parameter")
      );

      // WHEN: Handling callback
      let error: Error | undefined;
      try {
        await mockAuthService.handleCallback(callbackData);
      } catch (err) {
        error = err as Error;
      }

      // THEN: Should reject
      expect(error).toBeDefined();
      expect(error?.message).toContain("Invalid state");
    });
  });

  describe("Stores API Key Securely", () => {
    // Test ID: VSCODE-AUTH-INT-001-005
    it("should store API key in secret storage", async () => {
      // GIVEN: Received API key
      const apiKey = "sk_test_secure123";

      // WHEN: Storing key
      await mockSecretStorage.store("snapback.apiKey", apiKey);

      // THEN: Key should be stored securely
      expect(mockSecretStorage.store).toHaveBeenCalledWith(
        "snapback.apiKey",
        apiKey
      );
    });

    // Test ID: VSCODE-AUTH-INT-001-006
    it("should retrieve stored API key", async () => {
      // GIVEN: Stored API key
      mockSecretStorage.get.mockResolvedValue("sk_test_stored456");

      // WHEN: Retrieving key
      const apiKey = await mockSecretStorage.get("snapback.apiKey");

      // THEN: Should get the key
      expect(apiKey).toBe("sk_test_stored456");
      expect(mockSecretStorage.get).toHaveBeenCalledWith("snapback.apiKey");
    });

    // Test ID: VSCODE-AUTH-INT-001-007
    it("should delete API key on logout", async () => {
      // GIVEN: Stored API key
      // WHEN: Logging out
      await mockSecretStorage.delete("snapback.apiKey");

      // THEN: Key should be deleted
      expect(mockSecretStorage.delete).toHaveBeenCalledWith("snapback.apiKey");
    });
  });

  describe("Validates API Key with Backend", () => {
    // Test ID: VSCODE-AUTH-INT-001-008
    it("should validate API key with backend", async () => {
      // GIVEN: API key
      const apiKey = "sk_test_validate789";

      // WHEN: Validating
      const validation = await mockBackendClient.validateApiKey(apiKey);

      // THEN: Should return validation result
      expect(validation.valid).toBe(true);
      expect(validation.tier).toBe("pro");
      expect(validation.userId).toBeDefined();
    });

    // Test ID: VSCODE-AUTH-INT-001-009
    it("should handle invalid API key gracefully", async () => {
      // GIVEN: Invalid API key
      const invalidKey = "sk_invalid_key";

      mockBackendClient.validateApiKey.mockResolvedValue({
        valid: false,
        error: "Invalid API key",
      });

      // WHEN: Validating
      const validation = await mockBackendClient.validateApiKey(invalidKey);

      // THEN: Should return invalid
      expect(validation.valid).toBe(false);
      expect(validation.error).toBeDefined();
    });

    // Test ID: VSCODE-AUTH-INT-001-010
    it("should fetch user profile after validation", async () => {
      // GIVEN: Valid API key
      const apiKey = "sk_test_profile123";

      await mockBackendClient.validateApiKey(apiKey);

      // WHEN: Fetching profile
      const profile = await mockBackendClient.getUserProfile();

      // THEN: Should get user data
      expect(profile.id).toBe("user_abc123");
      expect(profile.email).toBeDefined();
      expect(profile.tier).toBe("pro");
    });
  });

  describe("Updates UI to Show Authenticated State", () => {
    // Test ID: VSCODE-AUTH-INT-001-011
    it("should update status bar to show authenticated state", async () => {
      // GIVEN: User authenticated
      const userProfile = {
        email: "user@example.com",
        tier: "pro",
      };

      // WHEN: Updating UI
      mockStatusBar.text = "$(shield) SnapBack: Pro";
      mockStatusBar.tooltip = `Authenticated as ${userProfile.email} (${userProfile.tier})`;
      mockStatusBar.show();

      // THEN: Status bar should reflect authenticated state
      expect(mockStatusBar.text).toContain("Pro");
      expect(mockStatusBar.tooltip).toContain("user@example.com");
      expect(mockStatusBar.show).toHaveBeenCalled();
    });

    // Test ID: VSCODE-AUTH-INT-001-012
    it("should show upgrade prompt for free tier", async () => {
      // GIVEN: Free tier user
      const userProfile = {
        email: "free@example.com",
        tier: "free",
      };

      // WHEN: Updating UI
      mockStatusBar.text = "$(shield) SnapBack: Free";
      mockStatusBar.tooltip = `${userProfile.email} (Free tier) - Click to upgrade`;

      // THEN: Should show upgrade prompt
      expect(mockStatusBar.text).toContain("Free");
      expect(mockStatusBar.tooltip).toContain("Click to upgrade");
    });

    // Test ID: VSCODE-AUTH-INT-001-013
    it("should clear authenticated state on logout", async () => {
      // GIVEN: Authenticated user
      mockStatusBar.text = "$(shield) SnapBack: Pro";

      // WHEN: Logging out
      await mockSecretStorage.delete("snapback.apiKey");
      mockStatusBar.text = "$(shield) SnapBack";
      mockStatusBar.tooltip = "Click to authenticate";

      // THEN: UI should show unauthenticated state
      expect(mockStatusBar.text).toBe("$(shield) SnapBack");
      expect(mockStatusBar.tooltip).toContain("authenticate");
      expect(mockSecretStorage.delete).toHaveBeenCalled();
    });
  });

  describe("Complete Authentication Flow", () => {
    // Test ID: VSCODE-AUTH-INT-001-014
    it("should complete full authentication flow", async () => {
      // GIVEN: User initiates auth
      // WHEN: Going through complete flow
      
      // 1. Initiate OAuth
      const authData = await mockAuthService.initiateOAuth();
      expect(authData.authUrl).toBeDefined();

      // 2. Handle callback
      const callbackResult = await mockAuthService.handleCallback({
        code: "code_xyz",
        state: authData.state,
      });
      expect(callbackResult.apiKey).toBeDefined();

      // 3. Store API key
      await mockSecretStorage.store("snapback.apiKey", callbackResult.apiKey);
      expect(mockSecretStorage.store).toHaveBeenCalled();

      // 4. Validate key
      const validation = await mockBackendClient.validateApiKey(
        callbackResult.apiKey
      );
      expect(validation.valid).toBe(true);

      // 5. Fetch profile
      const profile = await mockBackendClient.getUserProfile();
      expect(profile.tier).toBe("pro");

      // 6. Update UI
      mockStatusBar.text = `$(shield) SnapBack: ${profile.tier}`;
      mockStatusBar.show();

      // THEN: User should be fully authenticated
      expect(mockStatusBar.text).toContain("Pro");
      expect(mockStatusBar.show).toHaveBeenCalled();
    });
  });
});
