# Pioneer Program Integration Test Plan

**Version**: 1.0
**Created**: 2025-12-17
**Scope**: Phase 1 Implementation (PION-001 through PION-006)
**Goal**: Verify Pioneer gamification loop works correctly before removing mock data

---

## Test Strategy Overview

### Testing Pyramid

```
                    ┌─────────────┐
                    │    E2E      │  ← 10% (Critical paths only)
                    │  (Playwright)│
                   ─┴─────────────┴─
                  ┌─────────────────┐
                  │  Integration    │  ← 30% (API + WebSocket)
                  │   (Vitest)      │
                 ─┴─────────────────┴─
                ┌───────────────────────┐
                │      Unit Tests       │  ← 60% (Functions, hooks, components)
                │       (Vitest)        │
               ─┴───────────────────────┴─
```

### Coverage Targets

| Layer | Current | Target | Critical Paths |
|-------|---------|--------|----------------|
| API Procedures | ~60% | ≥80% | Leaderboard, Actions |
| Web Hooks | ~20% | ≥70% | usePioneerProgress, useLeaderboard |
| Extension Classes | ~40% | ≥80% | PioneerAuth, PioneerSocket |
| Shared Types | ~90% | ≥90% | ws-types, tier calculations |

---

## Phase 0: Pre-Migration Smoke Tests

**Purpose**: Verify existing functionality before removing mocks

### Web Dashboard Smoke Tests

Run these BEFORE touching `api-mock.ts`:

```typescript
// apps/web/__tests__/smoke/pioneer-pre-migration.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Pioneer Dashboard - Pre-Migration Smoke', () => {
  test.beforeEach(async ({ page }) => {
    // Login as test user
    await page.goto('/api/auth/signin');
    await loginAsTestUser(page);
  });

  test('profile displays current tier and points', async ({ page }) => {
    await page.goto('/pioneer');

    // Verify profile section loads
    await expect(page.getByTestId('pioneer-profile')).toBeVisible();

    // Verify tier is displayed (even if mock)
    await expect(page.getByTestId('current-tier')).toHaveText(/seedling|grower|cultivator|guardian/i);

    // Verify points displayed
    await expect(page.getByTestId('total-points')).toContainText(/\d+ pts/);
  });

  test('progress bar renders without errors', async ({ page }) => {
    await page.goto('/pioneer');

    // Verify progress component exists
    await expect(page.getByTestId('tier-progress-bar')).toBeVisible();

    // Verify no console errors
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.waitForTimeout(2000); // Wait for async operations
    expect(errors).toHaveLength(0);
  });

  test('leaderboard page loads', async ({ page }) => {
    await page.goto('/pioneer/leaderboard');

    // Verify leaderboard table exists
    await expect(page.getByTestId('leaderboard-table')).toBeVisible();

    // Verify at least one entry (mock or real)
    await expect(page.locator('[data-testid^="leaderboard-entry-"]')).toHaveCount({ min: 1 });
  });

  test('referrals page loads', async ({ page }) => {
    await page.goto('/pioneer/referrals');

    // Verify referral code is displayed
    await expect(page.getByTestId('referral-code')).toBeVisible();

    // Verify copy button works
    await page.getByTestId('copy-referral-code').click();
    await expect(page.getByText(/copied/i)).toBeVisible();
  });
});
```

### Run Before Migration

```bash
# Run smoke tests
pnpm test:e2e --grep "Pre-Migration Smoke"

# If all pass, proceed with migration
# If any fail, fix before continuing
```

---

## Phase 1: Unit Tests

### 1.1 Leaderboard API Tests

**File**: `apps/api/modules/pioneer/tests/leaderboard.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestContext, cleanupTestContext } from '@/test/helpers';
import { leaderboardProcedure } from '../procedures/leaderboard';

describe('Pioneer Leaderboard Procedure', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestContext();
    // Seed test pioneers
    await ctx.db.insert(pioneers).values([
      { userId: 'user_1', username: 'alice', totalPoints: 500, tier: 'grower', leaderboardVisibility: 'public' },
      { userId: 'user_2', username: 'bob', totalPoints: 1000, tier: 'cultivator', leaderboardVisibility: 'anonymous' },
      { userId: 'user_3', username: 'charlie', totalPoints: 200, tier: 'seedling', leaderboardVisibility: 'hidden' },
      { userId: 'user_4', username: 'diana', totalPoints: 750, tier: 'cultivator', leaderboardVisibility: 'public' },
    ]);
  });

  afterEach(async () => {
    await cleanupTestContext(ctx);
  });

  describe('ranking logic', () => {
    it('returns pioneers ordered by points descending', async () => {
      const result = await leaderboardProcedure({ limit: 10, offset: 0 }, ctx);

      expect(result.leaderboard[0].points).toBe(1000); // bob
      expect(result.leaderboard[1].points).toBe(750);  // diana
      expect(result.leaderboard[2].points).toBe(500);  // alice
    });

    it('excludes hidden users from results', async () => {
      const result = await leaderboardProcedure({ limit: 10, offset: 0 }, ctx);

      const usernames = result.leaderboard.map(e => e.display);
      expect(usernames).not.toContain('charlie');
      expect(usernames).not.toContain('c*****e');
    });

    it('excludes hidden users from total count', async () => {
      const result = await leaderboardProcedure({ limit: 10, offset: 0 }, ctx);

      expect(result.total).toBe(3); // alice, bob, diana (not charlie)
    });

    it('assigns correct ranks', async () => {
      const result = await leaderboardProcedure({ limit: 10, offset: 0 }, ctx);

      expect(result.leaderboard[0].rank).toBe(1);
      expect(result.leaderboard[1].rank).toBe(2);
      expect(result.leaderboard[2].rank).toBe(3);
    });
  });

  describe('privacy controls', () => {
    it('shows full username for public visibility', async () => {
      const result = await leaderboardProcedure({ limit: 10, offset: 0 }, ctx);

      const alice = result.leaderboard.find(e => e.rank === 3); // alice is rank 3
      expect(alice?.display).toBe('alice');
    });

    it('obfuscates username for anonymous visibility', async () => {
      const result = await leaderboardProcedure({ limit: 10, offset: 0 }, ctx);

      const bob = result.leaderboard.find(e => e.rank === 1); // bob is rank 1
      expect(bob?.display).toBe('b*b');
    });

    it('handles short usernames correctly', async () => {
      await ctx.db.insert(pioneers).values({
        userId: 'user_5', username: 'jo', totalPoints: 100, tier: 'seedling', leaderboardVisibility: 'anonymous'
      });

      const result = await leaderboardProcedure({ limit: 10, offset: 0 }, ctx);

      const jo = result.leaderboard.find(e => e.points === 100);
      expect(jo?.display).toBe('j**');
    });
  });

  describe('pagination', () => {
    beforeEach(async () => {
      // Add more users for pagination testing
      const additionalUsers = Array.from({ length: 20 }, (_, i) => ({
        userId: `user_${i + 10}`,
        username: `user${i + 10}`,
        totalPoints: 100 + i * 10,
        tier: 'seedling' as const,
        leaderboardVisibility: 'public' as const,
      }));
      await ctx.db.insert(pioneers).values(additionalUsers);
    });

    it('respects limit parameter', async () => {
      const result = await leaderboardProcedure({ limit: 5, offset: 0 }, ctx);

      expect(result.leaderboard).toHaveLength(5);
    });

    it('respects offset parameter', async () => {
      const first = await leaderboardProcedure({ limit: 5, offset: 0 }, ctx);
      const second = await leaderboardProcedure({ limit: 5, offset: 5 }, ctx);

      expect(first.leaderboard[0].rank).toBe(1);
      expect(second.leaderboard[0].rank).toBe(6);
    });

    it('returns empty array when offset exceeds total', async () => {
      const result = await leaderboardProcedure({ limit: 10, offset: 1000 }, ctx);

      expect(result.leaderboard).toHaveLength(0);
      expect(result.total).toBeGreaterThan(0); // Total still accurate
    });
  });

  describe('current user inclusion', () => {
    it('includes current user rank when authenticated', async () => {
      ctx.session = { userId: 'user_1' }; // alice

      const result = await leaderboardProcedure({ limit: 10, offset: 0, includeCurrentUser: true }, ctx);

      expect(result.currentUserRank).toBe(3); // alice is rank 3
    });

    it('marks current user entry with isCurrentUser flag', async () => {
      ctx.session = { userId: 'user_1' };

      const result = await leaderboardProcedure({ limit: 10, offset: 0, includeCurrentUser: true }, ctx);

      const alice = result.leaderboard.find(e => e.isCurrentUser);
      expect(alice).toBeDefined();
      expect(alice?.rank).toBe(3);
    });

    it('includes current user even if not in top results', async () => {
      ctx.session = { userId: 'user_1' }; // alice is rank 3

      const result = await leaderboardProcedure({ limit: 2, offset: 0, includeCurrentUser: true }, ctx);

      // Only top 2 in results, but currentUserRank still returned
      expect(result.leaderboard).toHaveLength(2);
      expect(result.currentUserRank).toBe(3);
    });

    it('omits current user rank when not authenticated', async () => {
      ctx.session = null;

      const result = await leaderboardProcedure({ limit: 10, offset: 0, includeCurrentUser: true }, ctx);

      expect(result.currentUserRank).toBeUndefined();
    });
  });

  describe('input validation', () => {
    it('rejects limit > 100', async () => {
      await expect(
        leaderboardProcedure({ limit: 101, offset: 0 }, ctx)
      ).rejects.toThrow(/limit/i);
    });

    it('rejects negative offset', async () => {
      await expect(
        leaderboardProcedure({ limit: 10, offset: -1 }, ctx)
      ).rejects.toThrow(/offset/i);
    });

    it('uses defaults when parameters omitted', async () => {
      const result = await leaderboardProcedure({}, ctx);

      expect(result.leaderboard.length).toBeLessThanOrEqual(10); // default limit
    });
  });
});
```

### 1.2 Extension PioneerAuth Tests

**File**: `apps/vscode/test/unit/pioneer/PioneerAuth.spec.ts`

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PioneerAuth } from '../../../src/pioneer/PioneerAuth';
import * as vscode from 'vscode';

// Mock VS Code API
vi.mock('vscode', () => ({
  authentication: {
    getSession: vi.fn(),
  },
  ExtensionContext: vi.fn(),
}));

describe('PioneerAuth', () => {
  let auth: PioneerAuth;
  let mockContext: vscode.ExtensionContext;
  let mockSecrets: Map<string, string>;

  beforeEach(() => {
    mockSecrets = new Map();
    mockContext = {
      secrets: {
        get: vi.fn((key) => Promise.resolve(mockSecrets.get(key))),
        store: vi.fn((key, value) => {
          mockSecrets.set(key, value);
          return Promise.resolve();
        }),
        delete: vi.fn((key) => {
          mockSecrets.delete(key);
          return Promise.resolve();
        }),
      },
      globalState: {
        get: vi.fn(),
        update: vi.fn(),
      },
    } as unknown as vscode.ExtensionContext;

    auth = new PioneerAuth(mockContext);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('login', () => {
    it('requests GitHub session with correct scopes', async () => {
      const mockSession = {
        accessToken: 'github_token_123',
        account: { id: 'github_user', label: 'TestUser' },
      };
      vi.mocked(vscode.authentication.getSession).mockResolvedValue(mockSession);

      // Mock the token exchange
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ sessionToken: 'better_auth_token_456' }),
      });

      await auth.login();

      expect(vscode.authentication.getSession).toHaveBeenCalledWith(
        'github',
        ['read:user', 'user:email'],
        { createIfNone: true }
      );
    });

    it('stores Better Auth session token in secrets', async () => {
      const mockSession = { accessToken: 'github_token_123' };
      vi.mocked(vscode.authentication.getSession).mockResolvedValue(mockSession);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ sessionToken: 'better_auth_token_456' }),
      });

      await auth.login();

      expect(mockContext.secrets.store).toHaveBeenCalledWith(
        'snapback.pioneer.session',
        'better_auth_token_456'
      );
    });

    it('throws on GitHub auth failure', async () => {
      vi.mocked(vscode.authentication.getSession).mockRejectedValue(new Error('User cancelled'));

      await expect(auth.login()).rejects.toThrow('User cancelled');
    });

    it('throws on token exchange failure', async () => {
      vi.mocked(vscode.authentication.getSession).mockResolvedValue({ accessToken: 'token' });

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
      });

      await expect(auth.login()).rejects.toThrow(/token exchange/i);
    });
  });

  describe('getProfile', () => {
    it('fetches profile from API with session token', async () => {
      mockSecrets.set('snapback.pioneer.session', 'valid_token');

      const mockProfile = {
        pioneer: {
          id: 'pioneer_123',
          username: 'testuser',
          tier: 'grower',
          totalPoints: 450,
        },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockProfile),
      });

      const profile = await auth.getProfile();

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/pioneer/me'),
        expect.objectContaining({
          headers: { Authorization: 'Bearer valid_token' },
        })
      );
      expect(profile).toEqual(mockProfile.pioneer);
    });

    it('returns null when no session token', async () => {
      const profile = await auth.getProfile();

      expect(profile).toBeNull();
      expect(fetch).not.toHaveBeenCalled();
    });

    it('caches profile in memory for subsequent calls', async () => {
      mockSecrets.set('snapback.pioneer.session', 'valid_token');

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ pioneer: { tier: 'grower' } }),
      });

      await auth.getProfile();
      await auth.getProfile();

      expect(fetch).toHaveBeenCalledTimes(1); // Only one fetch
    });

    it('returns cached profile on network error', async () => {
      mockSecrets.set('snapback.pioneer.session', 'valid_token');

      // First call succeeds
      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ pioneer: { tier: 'grower' } }),
        })
        .mockRejectedValueOnce(new Error('Network error'));

      const first = await auth.getProfile();
      auth.invalidateCache(); // Force re-fetch
      const second = await auth.getProfile();

      expect(first).toEqual({ tier: 'grower' });
      expect(second).toEqual({ tier: 'grower' }); // Returns cached
    });

    it('refreshes token on 401 and retries', async () => {
      mockSecrets.set('snapback.pioneer.session', 'expired_token');

      global.fetch = vi.fn()
        .mockResolvedValueOnce({ ok: false, status: 401 }) // First attempt fails
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ sessionToken: 'new_token' }),
        }) // Token refresh
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ pioneer: { tier: 'grower' } }),
        }); // Retry succeeds

      const profile = await auth.getProfile();

      expect(profile).toEqual({ tier: 'grower' });
      expect(fetch).toHaveBeenCalledTimes(3);
    });
  });

  describe('logout', () => {
    it('clears session token from secrets', async () => {
      mockSecrets.set('snapback.pioneer.session', 'token');

      await auth.logout();

      expect(mockContext.secrets.delete).toHaveBeenCalledWith('snapback.pioneer.session');
    });

    it('clears cached profile', async () => {
      mockSecrets.set('snapback.pioneer.session', 'valid_token');

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ pioneer: { tier: 'grower' } }),
      });

      await auth.getProfile(); // Cache profile
      await auth.logout();
      const profile = await auth.getProfile();

      expect(profile).toBeNull();
    });
  });

  describe('getSessionToken', () => {
    it('returns stored token', async () => {
      mockSecrets.set('snapback.pioneer.session', 'my_token');

      const token = await auth.getSessionToken();

      expect(token).toBe('my_token');
    });

    it('returns null when no token stored', async () => {
      const token = await auth.getSessionToken();

      expect(token).toBeNull();
    });
  });
});
```

### 1.3 Web Hook Tests

**File**: `apps/web/modules/pioneer/hooks/__tests__/use-pioneer-progress.test.tsx`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePioneerProgress } from '../use-pioneer-progress';

// Mock oRPC client
vi.mock('@/lib/orpc-client', () => ({
  client: {
    pioneer: {
      me: vi.fn(),
    },
  },
}));

import { client } from '@/lib/orpc-client';

describe('usePioneerProgress', () => {
  let queryClient: QueryClient;

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    vi.clearAllMocks();
  });

  it('fetches pioneer profile on mount', async () => {
    const mockResponse = {
      pioneer: {
        id: 'pioneer_123',
        username: 'testuser',
        tier: 'grower',
        totalPoints: 450,
      },
      progress: {
        currentTier: 'grower',
        nextTier: 'cultivator',
        pointsToNext: 300,
        percentToNext: 40,
      },
    };

    vi.mocked(client.pioneer.me).mockResolvedValue(mockResponse);

    const { result } = renderHook(() => usePioneerProgress(), { wrapper });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.profile).toEqual(mockResponse.pioneer);
    expect(result.current.progress).toEqual(mockResponse.progress);
  });

  it('returns null profile when API returns 404', async () => {
    vi.mocked(client.pioneer.me).mockRejectedValue({ status: 404 });

    const { result } = renderHook(() => usePioneerProgress(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.profile).toBeNull();
    expect(result.current.error).toBeDefined();
  });

  it('calculates progress percentage correctly', async () => {
    vi.mocked(client.pioneer.me).mockResolvedValue({
      pioneer: { tier: 'seedling', totalPoints: 125 },
      progress: {
        currentTier: 'seedling',
        nextTier: 'grower',
        pointsToNext: 125, // 250 - 125
        percentToNext: 50,
      },
    });

    const { result } = renderHook(() => usePioneerProgress(), { wrapper });

    await waitFor(() => {
      expect(result.current.progress?.percentToNext).toBe(50);
    });
  });

  it('returns null nextTier for Guardian', async () => {
    vi.mocked(client.pioneer.me).mockResolvedValue({
      pioneer: { tier: 'guardian', totalPoints: 2000 },
      progress: {
        currentTier: 'guardian',
        nextTier: null,
        pointsToNext: 0,
        percentToNext: 100,
      },
    });

    const { result } = renderHook(() => usePioneerProgress(), { wrapper });

    await waitFor(() => {
      expect(result.current.progress?.nextTier).toBeNull();
    });
  });

  it('uses stale data while revalidating', async () => {
    vi.mocked(client.pioneer.me)
      .mockResolvedValueOnce({ pioneer: { totalPoints: 100 } })
      .mockResolvedValueOnce({ pioneer: { totalPoints: 200 } });

    const { result, rerender } = renderHook(() => usePioneerProgress(), { wrapper });

    await waitFor(() => {
      expect(result.current.profile?.totalPoints).toBe(100);
    });

    // Trigger refetch
    await queryClient.invalidateQueries({ queryKey: ['pioneer', 'me'] });

    // Should still show old data while fetching
    expect(result.current.profile?.totalPoints).toBe(100);

    await waitFor(() => {
      expect(result.current.profile?.totalPoints).toBe(200);
    });
  });
});
```

### 1.4 Username Obfuscation Tests

**File**: `packages/shared/src/pioneer/__tests__/obfuscate.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { obfuscateUsername } from '../obfuscate';

describe('obfuscateUsername', () => {
  it('handles standard usernames', () => {
    expect(obfuscateUsername('qwynn')).toBe('q***n');
    expect(obfuscateUsername('developer')).toBe('d*******r');
    expect(obfuscateUsername('alice')).toBe('a***e');
  });

  it('handles short usernames (≤3 chars)', () => {
    expect(obfuscateUsername('jo')).toBe('j**');
    expect(obfuscateUsername('bob')).toBe('b**');
    expect(obfuscateUsername('a')).toBe('a**');
  });

  it('handles usernames with numbers', () => {
    expect(obfuscateUsername('dev123')).toBe('d***3');
    expect(obfuscateUsername('2cool4school')).toBe('2**********l');
  });

  it('handles usernames with underscores', () => {
    expect(obfuscateUsername('dev_ninja_2024')).toBe('d************4');
  });

  it('handles empty string', () => {
    expect(obfuscateUsername('')).toBe('***');
  });

  it('preserves exactly first and last character', () => {
    const result = obfuscateUsername('testing');
    expect(result[0]).toBe('t');
    expect(result[result.length - 1]).toBe('g');
    expect(result.slice(1, -1)).toMatch(/^\*+$/);
  });
});
```

---

## Phase 2: Integration Tests

### 2.1 API + Database Integration

**File**: `apps/api/modules/pioneer/tests/integration/leaderboard.integration.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestServer, TestServer } from '@/test/server';
import { db } from '@/db';
import { pioneers } from '@/db/schema';

describe('Leaderboard API Integration', () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await createTestServer();
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(async () => {
    // Clean and seed database
    await db.delete(pioneers);
    await db.insert(pioneers).values([
      { userId: 'u1', username: 'alice', totalPoints: 500, tier: 'grower', leaderboardVisibility: 'public' },
      { userId: 'u2', username: 'bob', totalPoints: 1000, tier: 'cultivator', leaderboardVisibility: 'anonymous' },
      { userId: 'u3', username: 'charlie', totalPoints: 200, tier: 'seedling', leaderboardVisibility: 'hidden' },
    ]);
  });

  it('GET /api/pioneer/leaderboard returns ranked pioneers', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/pioneer/leaderboard?limit=10',
      headers: { Authorization: `Bearer ${await server.getTestToken()}` },
    });

    expect(response.statusCode).toBe(200);

    const body = JSON.parse(response.body);
    expect(body.leaderboard).toHaveLength(2); // charlie is hidden
    expect(body.leaderboard[0].points).toBe(1000); // bob first
    expect(body.leaderboard[0].display).toBe('b*b'); // obfuscated
    expect(body.total).toBe(2);
  });

  it('includes current user rank when authenticated', async () => {
    const token = await server.getTestToken({ userId: 'u1' }); // alice

    const response = await server.inject({
      method: 'GET',
      url: '/api/pioneer/leaderboard?includeCurrentUser=true',
      headers: { Authorization: `Bearer ${token}` },
    });

    const body = JSON.parse(response.body);
    expect(body.currentUserRank).toBe(2); // alice is rank 2
  });

  it('rejects unauthenticated requests', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/pioneer/leaderboard',
    });

    expect(response.statusCode).toBe(401);
  });
});
```

### 2.2 WebSocket Integration

**File**: `apps/api/ws/__tests__/pioneer-hub.integration.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import WebSocket from 'ws';
import { createTestServer, TestServer } from '@/test/server';
import { getPioneerHub } from '../pioneer-hub';

describe('Pioneer WebSocket Hub Integration', () => {
  let server: TestServer;
  let wsUrl: string;

  beforeAll(async () => {
    server = await createTestServer();
    wsUrl = `ws://localhost:${server.port}/ws/pioneer`;
  });

  afterAll(async () => {
    await server.close();
  });

  const connectWithToken = async (token: string): Promise<WebSocket> => {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`${wsUrl}?token=${token}`);
      ws.on('open', () => resolve(ws));
      ws.on('error', reject);
      setTimeout(() => reject(new Error('Connection timeout')), 5000);
    });
  };

  describe('connection', () => {
    it('accepts valid token and sends connected message', async () => {
      const token = await server.getTestToken({ userId: 'user_123' });
      const ws = await connectWithToken(token);

      const message = await new Promise<any>((resolve) => {
        ws.on('message', (data) => resolve(JSON.parse(data.toString())));
      });

      expect(message.type).toBe('connected');
      expect(message.payload.userId).toBe('user_123');
      expect(message.payload.room).toBe('user_user_123');

      ws.close();
    });

    it('rejects missing token', async () => {
      const ws = new WebSocket(wsUrl);

      const closeCode = await new Promise<number>((resolve) => {
        ws.on('close', (code) => resolve(code));
      });

      expect(closeCode).toBe(4001);
    });

    it('rejects invalid token', async () => {
      const ws = new WebSocket(`${wsUrl}?token=invalid_token`);

      const closeCode = await new Promise<number>((resolve) => {
        ws.on('close', (code) => resolve(code));
      });

      expect(closeCode).toBe(4001);
    });
  });

  describe('broadcasting', () => {
    it('broadcasts to all clients in same room', async () => {
      const token = await server.getTestToken({ userId: 'user_123' });
      const ws1 = await connectWithToken(token);
      const ws2 = await connectWithToken(token);

      // Skip connected messages
      await Promise.all([
        new Promise((r) => ws1.once('message', r)),
        new Promise((r) => ws2.once('message', r)),
      ]);

      // Broadcast event
      getPioneerHub().broadcastToUser('user_123', {
        type: 'pioneer:points_updated',
        payload: { userId: 'user_123', points: 500, delta: 100, actionType: 'star' },
      });

      const [msg1, msg2] = await Promise.all([
        new Promise<any>((r) => ws1.once('message', (d) => r(JSON.parse(d.toString())))),
        new Promise<any>((r) => ws2.once('message', (d) => r(JSON.parse(d.toString())))),
      ]);

      expect(msg1.type).toBe('pioneer:points_updated');
      expect(msg2.type).toBe('pioneer:points_updated');
      expect(msg1.payload.points).toBe(500);

      ws1.close();
      ws2.close();
    });

    it('does not broadcast to other users', async () => {
      const token1 = await server.getTestToken({ userId: 'user_123' });
      const token2 = await server.getTestToken({ userId: 'user_456' });
      const ws1 = await connectWithToken(token1);
      const ws2 = await connectWithToken(token2);

      // Skip connected messages
      await Promise.all([
        new Promise((r) => ws1.once('message', r)),
        new Promise((r) => ws2.once('message', r)),
      ]);

      // Broadcast only to user_123
      getPioneerHub().broadcastToUser('user_123', {
        type: 'pioneer:points_updated',
        payload: { userId: 'user_123', points: 500, delta: 100, actionType: 'star' },
      });

      // ws1 should receive
      const msg1 = await new Promise<any>((r) =>
        ws1.once('message', (d) => r(JSON.parse(d.toString())))
      );
      expect(msg1.type).toBe('pioneer:points_updated');

      // ws2 should NOT receive (timeout)
      const received = await Promise.race([
        new Promise<boolean>((r) => ws2.once('message', () => r(true))),
        new Promise<boolean>((r) => setTimeout(() => r(false), 500)),
      ]);
      expect(received).toBe(false);

      ws1.close();
      ws2.close();
    });
  });

  describe('heartbeat', () => {
    it('responds to ping with pong', async () => {
      const token = await server.getTestToken({ userId: 'user_123' });
      const ws = await connectWithToken(token);

      // Skip connected message
      await new Promise((r) => ws.once('message', r));

      // Send ping
      ws.send(JSON.stringify({ type: 'ping' }));

      const pong = await new Promise<any>((r) =>
        ws.once('message', (d) => r(JSON.parse(d.toString())))
      );

      expect(pong.type).toBe('pong');
      expect(pong.payload.timestamp).toBeDefined();

      ws.close();
    });
  });
});
```

### 2.3 Action → Broadcast Integration

**File**: `apps/api/modules/pioneer/tests/integration/action-broadcast.integration.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import WebSocket from 'ws';
import { createTestServer, TestServer } from '@/test/server';
import { db } from '@/db';
import { pioneers, pioneerActions } from '@/db/schema';

describe('Action Submit → WebSocket Broadcast', () => {
  let server: TestServer;
  let wsUrl: string;

  beforeAll(async () => {
    server = await createTestServer();
    wsUrl = `ws://localhost:${server.port}/ws/pioneer`;
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(async () => {
    await db.delete(pioneerActions);
    await db.delete(pioneers);
    await db.insert(pioneers).values({
      id: 'pioneer_1',
      userId: 'user_123',
      username: 'testuser',
      totalPoints: 200,
      tier: 'seedling',
    });
  });

  it('broadcasts points_updated when action submitted', async () => {
    const token = await server.getTestToken({ userId: 'user_123' });

    // Connect WebSocket
    const ws = new WebSocket(`${wsUrl}?token=${token}`);
    await new Promise((r) => ws.on('open', r));
    await new Promise((r) => ws.once('message', r)); // Skip connected

    // Submit action via API
    const response = await server.inject({
      method: 'POST',
      url: '/api/pioneer/actions',
      headers: { Authorization: `Bearer ${token}` },
      body: { actionType: 'github_starred' },
    });

    expect(response.statusCode).toBe(200);

    // Verify WebSocket received broadcast
    const wsMessage = await new Promise<any>((resolve) => {
      ws.once('message', (data) => resolve(JSON.parse(data.toString())));
    });

    expect(wsMessage.type).toBe('pioneer:points_updated');
    expect(wsMessage.payload.delta).toBe(100); // GitHub star points
    expect(wsMessage.payload.points).toBe(300); // 200 + 100

    ws.close();
  });

  it('broadcasts tier_changed when crossing threshold', async () => {
    // Set user to 240 points (10 away from Grower)
    await db.update(pioneers).set({ totalPoints: 240 }).where({ userId: 'user_123' });

    const token = await server.getTestToken({ userId: 'user_123' });

    const ws = new WebSocket(`${wsUrl}?token=${token}`);
    await new Promise((r) => ws.on('open', r));
    await new Promise((r) => ws.once('message', r)); // Skip connected

    // Submit action that crosses threshold (+25 points for email verification)
    await server.inject({
      method: 'POST',
      url: '/api/pioneer/actions',
      headers: { Authorization: `Bearer ${token}` },
      body: { actionType: 'email_verified' },
    });

    // Should receive points_updated
    const pointsMsg = await new Promise<any>((r) =>
      ws.once('message', (d) => r(JSON.parse(d.toString())))
    );
    expect(pointsMsg.type).toBe('pioneer:points_updated');

    // Should also receive tier_changed
    const tierMsg = await new Promise<any>((r) =>
      ws.once('message', (d) => r(JSON.parse(d.toString())))
    );
    expect(tierMsg.type).toBe('pioneer:tier_changed');
    expect(tierMsg.payload.from).toBe('seedling');
    expect(tierMsg.payload.to).toBe('grower');
    expect(tierMsg.payload.benefits).toContain('Co-change analysis');

    ws.close();
  });

  it('does not broadcast tier_changed when tier unchanged', async () => {
    const token = await server.getTestToken({ userId: 'user_123' });

    const ws = new WebSocket(`${wsUrl}?token=${token}`);
    await new Promise((r) => ws.on('open', r));
    await new Promise((r) => ws.once('message', r)); // Skip connected

    // Submit action that doesn't cross threshold (200 + 25 = 225, still seedling)
    await server.inject({
      method: 'POST',
      url: '/api/pioneer/actions',
      headers: { Authorization: `Bearer ${token}` },
      body: { actionType: 'email_verified' },
    });

    // Should receive points_updated
    const pointsMsg = await new Promise<any>((r) =>
      ws.once('message', (d) => r(JSON.parse(d.toString())))
    );
    expect(pointsMsg.type).toBe('pioneer:points_updated');

    // Should NOT receive tier_changed (timeout)
    const receivedTierChange = await Promise.race([
      new Promise<boolean>((r) => ws.once('message', () => r(true))),
      new Promise<boolean>((r) => setTimeout(() => r(false), 500)),
    ]);
    expect(receivedTierChange).toBe(false);

    ws.close();
  });
});
```

---

## Phase 3: End-to-End Tests

### 3.1 Pioneer Flow E2E

**File**: `apps/web/__tests__/e2e/pioneer-flow.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test.describe('Pioneer Program E2E', () => {
  test.beforeEach(async ({ page }) => {
    // Login as test user
    await page.goto('/api/auth/signin/test?userId=e2e_user_1');
    await page.waitForURL('/');
  });

  test('full pioneer journey: signup → action → tier up', async ({ page }) => {
    // Step 1: Visit pioneer page (auto-creates profile)
    await page.goto('/pioneer');
    await expect(page.getByTestId('pioneer-profile')).toBeVisible();
    await expect(page.getByTestId('current-tier')).toHaveText('Seedling');

    // Step 2: Check initial points
    const initialPoints = await page.getByTestId('total-points').textContent();
    expect(initialPoints).toContain('50'); // account_created bonus

    // Step 3: Star GitHub repo action
    await page.getByTestId('action-github-star').click();

    // Wait for API and WebSocket update
    await expect(page.getByTestId('total-points')).toHaveText(/150 pts/, {
      timeout: 5000,
    });

    // Step 4: Verify progress bar updated
    const progressBar = page.getByTestId('tier-progress-bar');
    await expect(progressBar).toHaveAttribute('aria-valuenow', '60'); // 150/250 = 60%

    // Step 5: Submit feedback to cross tier threshold
    await page.getByTestId('action-submit-feedback').click();
    await page.getByTestId('feedback-textarea').fill('Great product!');
    await page.getByTestId('feedback-submit').click();

    // Step 6: Verify tier up celebration
    await expect(page.getByTestId('tier-celebration')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/Grower/)).toBeVisible();

    // Step 7: Verify new tier persists
    await page.reload();
    await expect(page.getByTestId('current-tier')).toHaveText('Grower');
  });

  test('leaderboard shows real rankings', async ({ page }) => {
    await page.goto('/pioneer/leaderboard');

    // Verify leaderboard loads
    await expect(page.getByTestId('leaderboard-table')).toBeVisible();

    // Verify entries have required fields
    const firstEntry = page.locator('[data-testid^="leaderboard-entry-"]').first();
    await expect(firstEntry.getByTestId('entry-rank')).toHaveText(/\d+/);
    await expect(firstEntry.getByTestId('entry-display')).not.toBeEmpty();
    await expect(firstEntry.getByTestId('entry-points')).toHaveText(/\d+ pts/);

    // Verify current user is highlighted
    const currentUserEntry = page.locator('[data-testid="leaderboard-entry-current"]');
    await expect(currentUserEntry).toHaveClass(/highlight/);
  });

  test('referral code can be copied', async ({ page }) => {
    await page.goto('/pioneer/referrals');

    // Verify referral code displayed
    const codeElement = page.getByTestId('referral-code');
    await expect(codeElement).toBeVisible();
    const code = await codeElement.textContent();
    expect(code).toMatch(/^[a-z0-9]{6,}$/i);

    // Copy code
    await page.getByTestId('copy-referral-code').click();

    // Verify clipboard (may need permissions)
    await expect(page.getByText(/copied/i)).toBeVisible();
  });

  test('action history shows completed actions', async ({ page }) => {
    await page.goto('/pioneer');

    // Verify action history section
    const historySection = page.getByTestId('action-history');
    await expect(historySection).toBeVisible();

    // Verify at least account_created action
    await expect(historySection.getByText(/Joined Pioneer Program/i)).toBeVisible();
    await expect(historySection.getByText(/\+50 pts/)).toBeVisible();
  });
});
```

### 3.2 Cross-Surface Sync E2E

**File**: `apps/web/__tests__/e2e/cross-surface-sync.spec.ts`

```typescript
import { test, expect, BrowserContext, Page } from '@playwright/test';

test.describe('Cross-Surface Real-Time Sync', () => {
  let context: BrowserContext;
  let tab1: Page;
  let tab2: Page;

  test.beforeEach(async ({ browser }) => {
    context = await browser.newContext();
    tab1 = await context.newPage();
    tab2 = await context.newPage();

    // Login in both tabs
    await tab1.goto('/api/auth/signin/test?userId=sync_test_user');
    await tab2.goto('/api/auth/signin/test?userId=sync_test_user');

    await tab1.waitForURL('/');
    await tab2.waitForURL('/');
  });

  test.afterEach(async () => {
    await context.close();
  });

  test('points update syncs across tabs via WebSocket', async () => {
    // Open pioneer dashboard in both tabs
    await tab1.goto('/pioneer');
    await tab2.goto('/pioneer');

    // Get initial points
    const initialPoints = await tab1.getByTestId('total-points').textContent();

    // Trigger action in tab1
    await tab1.getByTestId('action-github-star').click();

    // Verify tab1 updates
    await expect(tab1.getByTestId('total-points')).not.toHaveText(initialPoints!, {
      timeout: 5000,
    });

    // Verify tab2 also updates (via WebSocket)
    await expect(tab2.getByTestId('total-points')).not.toHaveText(initialPoints!, {
      timeout: 5000,
    });

    // Both should show same value
    const tab1Points = await tab1.getByTestId('total-points').textContent();
    const tab2Points = await tab2.getByTestId('total-points').textContent();
    expect(tab1Points).toBe(tab2Points);
  });

  test('tier change celebration fires in all tabs', async () => {
    // Set user to 240 points (10 away from Grower)
    await setupUserPoints('sync_test_user', 240);

    await tab1.goto('/pioneer');
    await tab2.goto('/pioneer');

    // Trigger action that crosses threshold in tab1
    await tab1.getByTestId('action-email-verify').click();

    // Both tabs should show celebration
    await expect(tab1.getByTestId('tier-celebration')).toBeVisible({ timeout: 5000 });
    await expect(tab2.getByTestId('tier-celebration')).toBeVisible({ timeout: 5000 });
  });
});
```

---

## Phase 4: Migration Verification Tests

### 4.1 Before/After Comparison

**File**: `apps/web/__tests__/migration/mock-removal.spec.ts`

```typescript
import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';

test.describe('Mock Data Removal Verification', () => {
  test('api-mock.ts file is deleted', async () => {
    const exists = await Bun.file(
      'apps/web/modules/pioneer/lib/api-mock.ts'
    ).exists();
    expect(exists).toBe(false);
  });

  test('no imports of api-mock remain in codebase', async () => {
    const result = execSync(
      'grep -r "api-mock" apps/web/modules/pioneer --include="*.ts" --include="*.tsx" || true',
      { encoding: 'utf-8' }
    );
    expect(result.trim()).toBe('');
  });

  test('hooks import from orpc-client', async () => {
    const progressHook = await Bun.file(
      'apps/web/modules/pioneer/hooks/use-pioneer-progress.ts'
    ).text();
    expect(progressHook).toContain("from '@/lib/orpc-client'");
    expect(progressHook).not.toContain('api-mock');
  });

  test('no hardcoded mock data in hook files', async () => {
    const files = [
      'apps/web/modules/pioneer/hooks/use-pioneer-progress.ts',
      'apps/web/modules/pioneer/hooks/use-leaderboard.ts',
      'apps/web/modules/pioneer/hooks/use-referrals.ts',
    ];

    for (const file of files) {
      const content = await Bun.file(file).text();
      expect(content).not.toMatch(/seedling|grower|cultivator|guardian.*:/);
      expect(content).not.toMatch(/totalPoints:\s*\d+/);
    }
  });
});
```

### 4.2 API Response Contract Tests

**File**: `apps/api/modules/pioneer/tests/contracts/me.contract.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// Define expected response schema
const PioneerMeResponseSchema = z.object({
  pioneer: z.object({
    id: z.string(),
    userId: z.string(),
    username: z.string(),
    tier: z.enum(['seedling', 'grower', 'cultivator', 'guardian']),
    totalPoints: z.number().int().nonnegative(),
    referralCode: z.string(),
    createdAt: z.string().datetime(),
  }),
  progress: z.object({
    currentTier: z.string(),
    nextTier: z.string().nullable(),
    pointsToNext: z.number().int().nonnegative(),
    percentToNext: z.number().min(0).max(100),
  }),
  completedActions: z.array(z.string()),
  availableActions: z.array(
    z.object({
      actionType: z.string(),
      points: z.number(),
      completed: z.boolean(),
      repeatable: z.boolean(),
    })
  ),
});

describe('Pioneer /me Endpoint Contract', () => {
  it('response matches expected schema', async () => {
    const response = await fetch('http://localhost:3000/api/pioneer/me', {
      headers: { Authorization: `Bearer ${process.env.TEST_TOKEN}` },
    });

    expect(response.ok).toBe(true);

    const data = await response.json();
    const result = PioneerMeResponseSchema.safeParse(data);

    if (!result.success) {
      console.error('Schema validation errors:', result.error.issues);
    }

    expect(result.success).toBe(true);
  });

  it('tier matches point threshold', async () => {
    const response = await fetch('http://localhost:3000/api/pioneer/me', {
      headers: { Authorization: `Bearer ${process.env.TEST_TOKEN}` },
    });

    const { pioneer } = await response.json();

    const expectedTier = calculateExpectedTier(pioneer.totalPoints);
    expect(pioneer.tier).toBe(expectedTier);
  });
});

function calculateExpectedTier(points: number): string {
  if (points >= 1500) return 'guardian';
  if (points >= 750) return 'cultivator';
  if (points >= 250) return 'grower';
  return 'seedling';
}
```

---

## Manual QA Checklist

### Pre-Migration

- [ ] Screenshot current /pioneer page with mock data
- [ ] Screenshot current /pioneer/leaderboard with mock data
- [ ] Document current behavior for regression comparison

### Post-Migration: Web

- [ ] **Profile Display**
  - [ ] Tier badge shows correct tier for logged-in user
  - [ ] Points display matches database value
  - [ ] Progress bar percentage is accurate
  - [ ] Username displays correctly

- [ ] **Leaderboard**
  - [ ] Rankings load from real database
  - [ ] Anonymous users show obfuscated names
  - [ ] Current user is highlighted
  - [ ] Pagination works (if 10+ entries)

- [ ] **Referrals**
  - [ ] Referral code displays
  - [ ] Copy button works
  - [ ] Referral stats load (0 if none)

- [ ] **Loading States**
  - [ ] Skeleton loaders show during fetch
  - [ ] No flash of mock data

- [ ] **Error States**
  - [ ] API error shows friendly message
  - [ ] Retry button works

### Post-Migration: Extension

- [ ] **Status Bar**
  - [ ] Shows correct tier emoji
  - [ ] Shows correct point count
  - [ ] Updates after action

- [ ] **Authentication**
  - [ ] GitHub OAuth works
  - [ ] Token persists across restarts
  - [ ] Logout clears state

- [ ] **Feature Gating**
  - [ ] Seedling can't access Grower features
  - [ ] Grower+ can access co-change analysis

### Post-Migration: Cross-Surface

- [ ] **Real-Time Sync**
  - [ ] Earn points in extension → Web updates
  - [ ] Tier change triggers celebration in both
  - [ ] Multiple browser tabs sync

- [ ] **Celebration**
  - [ ] Tier-up shows toast in extension
  - [ ] Tier-up shows confetti in web
  - [ ] Benefits listed in celebration message

---

## Test Execution Commands

```bash
# Run all unit tests
pnpm test:unit

# Run integration tests
pnpm test:integration

# Run E2E tests
pnpm test:e2e

# Run specific test file
pnpm test apps/api/modules/pioneer/tests/leaderboard.test.ts

# Run with coverage
pnpm test:coverage

# Run migration verification
pnpm test apps/web/__tests__/migration/

# Run pre-migration smoke tests
pnpm test:e2e --grep "Pre-Migration Smoke"

# Run full Pioneer test suite
pnpm test --filter="*pioneer*"
```

---

## CI/CD Integration

Add to `.github/workflows/ci.yml`:

```yaml
  pioneer-tests:
    name: Pioneer Integration Tests
    runs-on: ubuntu-latest
    needs: [build]
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'

      - run: pnpm install
      - run: pnpm db:push

      - name: Run Pioneer Unit Tests
        run: pnpm test --filter="*pioneer*" --coverage

      - name: Run Pioneer Integration Tests
        run: pnpm test:integration --filter="*pioneer*"

      - name: Upload Coverage
        uses: codecov/codecov-action@v3
        with:
          files: coverage/lcov.info
          flags: pioneer
```

---

## Success Criteria

### Phase 1 Complete When:

- [ ] All unit tests passing (≥80% coverage)
- [ ] All integration tests passing
- [ ] All E2E tests passing
- [ ] No console errors in browser
- [ ] `api-mock.ts` deleted
- [ ] Manual QA checklist complete
- [ ] Performance budgets met (<500ms API response)
