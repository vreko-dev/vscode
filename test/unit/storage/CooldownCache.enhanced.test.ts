import { describe, it, expect, beforeEach } from 'vitest';
import { CooldownCache } from '../../../src/storage/CooldownCache';
import type { CooldownEntry } from '../../../src/storage/types';

describe('CooldownCache Enhanced Features', () => {
    let cache: CooldownCache;
    const testFilePath = '/test/project/src/app.ts';
    const protectionLevel = 'block';

    beforeEach(() => {
        cache = new CooldownCache();
    });

    describe('Enhanced Cooldown Entry Management', () => {
        const baseEntry: CooldownEntry = {
            filePath: testFilePath,
            protectionLevel,
            triggeredAt: Date.now(),
            expiresAt: Date.now() + 60000, // 1 minute
            actionTaken: 'snapshot_created'
        };

        it('should set and get cooldown entries', () => {
            cache.set(baseEntry);

            const retrieved = cache.get(testFilePath, protectionLevel);
            expect(retrieved).toEqual(baseEntry);
        });

        it('should check if file is in cooldown', () => {
            cache.set(baseEntry);

            expect(cache.isInCooldown(testFilePath, protectionLevel)).toBe(true);
            expect(cache.isInCooldown('/other/file.ts', protectionLevel)).toBe(false);
        });

        it('should remove specific cooldown entries', () => {
            cache.set(baseEntry);

            expect(cache.isInCooldown(testFilePath, protectionLevel)).toBe(true);

            const removed = cache.remove(testFilePath, protectionLevel);
            expect(removed).toBe(true);

            expect(cache.isInCooldown(testFilePath, protectionLevel)).toBe(false);
        });
    });

    describe('Temporary Allowance Support', () => {
        const tempAllowanceEntry: CooldownEntry = {
            filePath: testFilePath,
            protectionLevel: 'temporary', // Special level for temporary allowances
            triggeredAt: Date.now(),
            expiresAt: Date.now() + 300000, // 5 minutes
            actionTaken: 'temporary_allowance'
        };

        it('should support temporary allowance entries', () => {
            cache.set(tempAllowanceEntry);

            const retrieved = cache.get(testFilePath, 'temporary');
            expect(retrieved).toEqual(tempAllowanceEntry);
            expect(retrieved!.actionTaken).toBe('temporary_allowance');
        });

        it('should retrieve entries by file path regardless of protection level', () => {
            cache.set(tempAllowanceEntry);

            const retrieved = cache.getByPath(testFilePath);
            expect(retrieved).toEqual(tempAllowanceEntry);
        });

        it('should remove entries by file path regardless of protection level', () => {
            cache.set(tempAllowanceEntry);

            expect(cache.getByPath(testFilePath)).not.toBeNull();

            const removed = cache.removeByPath(testFilePath);
            expect(removed).toBe(true);

            expect(cache.getByPath(testFilePath)).toBeNull();
        });
    });

    describe('Expiration Handling', () => {
        it('should automatically handle expired entries', () => {
            const expiredEntry: CooldownEntry = {
                filePath: testFilePath,
                protectionLevel,
                triggeredAt: Date.now() - 10000,
                expiresAt: Date.now() - 5000, // Already expired
                actionTaken: 'snapshot_created'
            };

            cache.set(expiredEntry);

            // Should not return expired entries
            const retrieved = cache.get(testFilePath, protectionLevel);
            expect(retrieved).toBeNull();

            // Should not be in cooldown
            expect(cache.isInCooldown(testFilePath, protectionLevel)).toBe(false);
        });

        it('should clean up expired entries during getAll', () => {
            const validEntry: CooldownEntry = {
                filePath: '/valid/file.ts',
                protectionLevel: 'warn',
                triggeredAt: Date.now(),
                expiresAt: Date.now() + 60000,
                actionTaken: 'save_blocked'
            };

            const expiredEntry: CooldownEntry = {
                filePath: '/expired/file.ts',
                protectionLevel: 'block',
                triggeredAt: Date.now() - 10000,
                expiresAt: Date.now() - 5000, // Already expired
                actionTaken: 'snapshot_created'
            };

            cache.set(validEntry);
            cache.set(expiredEntry);

            const allEntries = cache.getAll();
            expect(allEntries.length).toBe(1);
            expect(allEntries[0].filePath).toBe('/valid/file.ts');
        });
    });
});
