import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PioneerGatekeeper } from '@vscode/pioneer/PioneerGatekeeper';
import { PioneerProfile, Tier } from '@vscode/pioneer/types';

describe('PioneerGatekeeper', () => {
  let gatekeeper: PioneerGatekeeper;

  beforeEach(() => {
    // Reset singleton if needed or create new instance logic for testing
    // Assuming we can access strict instance or reset it.
    // Ideally we might refactor Singleton to allow resetting for tests,
    // or we just use the public API.

    // For TDD, let's assume getInstance()
    gatekeeper = PioneerGatekeeper.getInstance();
    // Reset state
    (gatekeeper as any).currentProfile = null;
  });

  const mockProfile: PioneerProfile = {
    id: '1',
    username: 'tester',
    tier: 'seedling',
    totalPoints: 50,
    joinedAt: '2025-01-01',
    referralCode: 'REF123',
    githubStarred: true
  };

  describe('canUseFeature', () => {
    it('should block all features if no profile (Guest)', () => {
        // Edge Path
        expect(gatekeeper.canUseFeature('co-change')).toBe(false);
        expect(gatekeeper.canUseFeature('clusters')).toBe(false);
        // Note: Implementation Plan says "If feature === 'clusters' return true (All Pioneers)"
        // It says "If !this.currentProfile return false." so guests get false even for clusters?
        // Let's stick to plan: "If !this.currentProfile return false"
    });

    it('should allow "clusters" for Seedling tier', () => {
        // Happy Path
        gatekeeper.setProfile(mockProfile); // We'll need a setter or it comes from Auth
        expect(gatekeeper.canUseFeature('clusters')).toBe(true);
    });

    it('should block "co-change" for Seedling tier', () => {
        // Sad Path
        gatekeeper.setProfile({ ...mockProfile, tier: 'seedling' });
        expect(gatekeeper.canUseFeature('co-change')).toBe(false);
    });

    it('should allow "co-change" for Grower tier', () => {
        // Happy Path
        gatekeeper.setProfile({ ...mockProfile, tier: 'grower' });
        expect(gatekeeper.canUseFeature('co-change')).toBe(true);
    });

    it('should handle unlisted features safely', () => {
        // Edge Path
        gatekeeper.setProfile(mockProfile);
        expect(gatekeeper.canUseFeature('unknown-feature' as any)).toBe(false);
    });
  });

  describe('getUpsellMessage', () => {
      it('should return correct upsell for co-change when Seedling', () => {
          gatekeeper.setProfile({ ...mockProfile, tier: 'seedling' });
          expect(gatekeeper.getUpsellMessage('co-change')).toContain('Reach Grower tier');
      });
  });
});
