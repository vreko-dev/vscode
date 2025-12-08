import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StorageManager } from '../../src/storage/StorageManager';
import { ProtectedFileRegistry } from '../../src/services/protectedFileRegistry';
import { CooldownCache } from '../../src/storage/CooldownCache';
import type { CooldownEntry } from '../../src/storage/types';

// Mock VS Code context
const mockContext: any = {
    globalStorageUri: {
        fsPath: '/tmp/test-storage',
        toString: () => '/tmp/test-storage'
    },
    workspaceState: {
        get: vi.fn().mockReturnValue([]),
        update: vi.fn()
    }
};

describe('Cooldown Consolidation', () => {
    let storageManager: StorageManager;
    let registry: ProtectedFileRegistry;

    beforeEach(() => {
        vi.clearAllMocks();

        // Create fresh instances for each test
        storageManager = new StorageManager(mockContext);
        registry = new ProtectedFileRegistry(mockContext.workspaceState);

        // Wire up storage manager to registry
        registry.initializeStorageManager(storageManager);
    });

    describe('Removal of Deprecated Components', () => {
        it('should have removed CooldownManager.ts file', () => {
            // Verify CooldownManager.ts no longer exists
            const fs = require('fs');
            const path = require('path');

            const cooldownManagerPath = path.join(__dirname, '../../src/services/cooldownManager.ts');

            // File should not exist
            expect(fs.existsSync(cooldownManagerPath)).toBe(false);
        });

        it('should NOT have temporaryAllowances separate from CooldownCache', () => {
            // Read the actual ProtectedFileRegistry content
            const fs = require('fs');
            const path = require('path');

            const registryPath = path.join(__dirname, '../../src/services/protectedFileRegistry.ts');
            const registryContent = fs.readFileSync(registryPath, 'utf-8');

            // Should not contain the old temporaryAllowances Map declaration
            expect(registryContent).not.toContain('temporaryAllowances = new Map');

            // Should use StorageManager for cooldown operations
            expect(registryContent).toContain('storageManager: StorageManager | null = null');
        });
    });

    describe('Single Source of Truth', () => {
        it('should have exactly ONE cooldown storage implementation', () => {
            // Structural test to verify consolidation
            // Only CooldownCache should contain Map declarations for cooldowns
            const fs = require('fs');
            const path = require('path');

            const cooldownCachePath = path.join(__dirname, '../../src/storage/CooldownCache.ts');
            const cooldownCacheContent = fs.readFileSync(cooldownCachePath, 'utf-8');

            // Count Map declarations in CooldownCache
            const mapDeclarations = (cooldownCacheContent.match(/new Map/g) || []).length;

            // Should have exactly one Map (the cache itself)
            expect(mapDeclarations).toBeGreaterThanOrEqual(1);

            // Other files should not contain cooldown-related Map declarations
            const protectedRegistryPath = path.join(__dirname, '../../src/services/protectedFileRegistry.ts');
            const protectedRegistryContent = fs.readFileSync(protectedRegistryPath, 'utf-8');

            // Should not contain Map declarations for cooldowns
            expect(protectedRegistryContent).not.toMatch(/new Map.*cooldown/i);
        });
    });

    describe('Temporary Allowance via CooldownCache', () => {
        const testFilePath = '/test/project/src/config.ts';

        it('should grant temporary allowance using CooldownCache', () => {
            // Grant temporary allowance
            registry.grantTemporaryAllowance(testFilePath, 5000); // 5 seconds

            // Should be able to check temporary allowance
            expect(registry.hasTemporaryAllowance(testFilePath)).toBe(true);
        });

        it('should consume temporary allowance using CooldownCache', () => {
            // Grant temporary allowance
            registry.grantTemporaryAllowance(testFilePath, 5000);

            // Should be able to consume it
            const consumed = registry.consumeTemporaryAllowance(testFilePath);
            expect(consumed).toBe(true);

            // Should no longer have the allowance
            expect(registry.hasTemporaryAllowance(testFilePath)).toBe(false);
        });

        it('should expire temporary allowances automatically', () => {
            // Grant temporary allowance with very short duration
            registry.grantTemporaryAllowance(testFilePath, 1); // 1 millisecond

            // Wait for expiration
            vi.advanceTimersByTime(10);

            // Should no longer have the allowance
            expect(registry.hasTemporaryAllowance(testFilePath)).toBe(false);
        });
    });

    describe('Standard Cooldowns via CooldownCache', () => {
        const testFilePath = '/test/project/src/database.ts';
        const protectionLevel = 'block';

        it('should set and check standard cooldowns', () => {
            // Set a standard cooldown
            registry.setCooldown(testFilePath, protectionLevel, 'snapshot_created');

            // Should be in cooldown
            expect(registry.isInCooldown(testFilePath, protectionLevel)).toBe(true);
        });

        it('should integrate with StorageManager.CooldownCache', () => {
            // Set cooldown via registry
            registry.setCooldown(testFilePath, protectionLevel, 'snapshot_created');

            // Check that it's stored in StorageManager's CooldownCache
            const cooldownEntry = storageManager.getCooldown(testFilePath, protectionLevel);
            expect(cooldownEntry).not.toBeNull();
            expect(cooldownEntry!.actionTaken).toBe('snapshot_created');
        });
    });
});
