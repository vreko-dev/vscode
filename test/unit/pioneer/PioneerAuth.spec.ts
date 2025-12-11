import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { PioneerAuth } from '@vscode/pioneer/PioneerAuth';

// Mock vscode.authentication
const mockGetSession = vi.fn();
vi.mock('vscode', () => ({
  authentication: {
    getSession: (...args: any[]) => mockGetSession(...args),
  },
  EventEmitter: class {
    event = vi.fn();
    fire = vi.fn();
    dispose = vi.fn();
  }
}));

// Mock PostHog via TelemetryProxy (conceptually - since PioneerAuth uses a direct capture or similar)
// For now, assuming PioneerAuth might strictly depend on a global or passed generic structure.
// Implementation plan says: "Implement login(): Call vscode.authentication.getSession... Telemetry: posthog.capture..."
// We need to spy on whatever telemetry mechanism we use.

describe('PioneerAuth', () => {
  let pioneerAuth: PioneerAuth;

  beforeEach(() => {
    vi.clearAllMocks();
    pioneerAuth = new PioneerAuth();
  });

  describe('login', () => {
    it('should successfully login and return session', async () => {
      // Happy Path
      const mockSession: vscode.AuthenticationSession = {
        id: 'sess_1',
        accessToken: 'token_123',
        account: { id: 'usr_1', label: 'testuser' },
        scopes: ['read:user'],
      };
      mockGetSession.mockResolvedValue(mockSession);

      const session = await pioneerAuth.login();

      expect(session).toEqual(mockSession);
      expect(mockGetSession).toHaveBeenCalledWith('github', ['read:user', 'user:email'], { createIfNone: true });
    });

    it('should return undefined if login is cancelled or fails silently', async () => {
      // Sad Path
      mockGetSession.mockResolvedValue(undefined);

      const session = await pioneerAuth.login();

      expect(session).toBeUndefined();
    });

    it('should throw error if getSession throws', async () => {
        // Error Path
        mockGetSession.mockRejectedValue(new Error('Auth Error'));

        await expect(pioneerAuth.login()).rejects.toThrow('Auth Error');
    });
  });

  describe('getProfile', () => {
    it('should return null if no session', async () => {
        // Sad Path
        mockGetSession.mockResolvedValue(undefined); // No active session
        // We assume getProfile checks session
        const profile = await pioneerAuth.getProfile();
        expect(profile).toBeNull();
    });

    // We can add more specific profile tests once we implement the fetching logic
    // For now this ensures we have a starting point.
  });
});
