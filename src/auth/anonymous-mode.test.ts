/**
 * GREEN TEST: Anonymous Mode Refactoring
 *
 * Tests the refactored architecture with AuthState and AnonymousIdManager
 * Reference: feedback.md §3.1 Issue 1 - AnonymousMode God Object
 * TDD Status: GREEN (implementation tests)
 *
 * @package apps/vscode
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as vscode from "vscode";
import { AnonymousIdManager } from "./AnonymousIdManager.js";
import { AuthState } from "./AuthState.js";
import type {
	CredentialsManager,
	ExtensionCredentials,
} from "./credentials.js";
import {
	canAccessFeature,
	isAnonymousContext,
	isAuthenticatedContext,
} from "./UserContext.js";

/**
 * Test AuthState class - Single responsibility: auth status checking
 */
describe("AuthState", () => {
	let mockCredentialsManager: CredentialsManager;
	let authState: AuthState;

	beforeEach(() => {
		mockCredentialsManager = {
			getCredentials: vi.fn(),
			setCredentials: vi.fn(),
			clearCredentials: vi.fn(),
			isAccessTokenExpired: vi.fn(),
		};

		authState = new AuthState(mockCredentialsManager);
	});

	it("should return true when user is authenticated", async () => {
		const mockCreds: ExtensionCredentials = {
			accessToken: "token",
			refreshToken: "refresh",
			expiresAt: Date.now() + 900000,
			user: { id: "user1", email: "test@example.com" },
		};

		vi.mocked(mockCredentialsManager.getCredentials).mockResolvedValue(
			mockCreds,
		);

		const isAuth = await authState.isAuthenticated();
		expect(isAuth).toBe(true);
	});

	it("should return false when user is not authenticated", async () => {
		vi.mocked(mockCredentialsManager.getCredentials).mockResolvedValue(null);

		const isAuth = await authState.isAuthenticated();
		expect(isAuth).toBe(false);
	});

	it("should return null credentials when not authenticated", async () => {
		vi.mocked(mockCredentialsManager.getCredentials).mockResolvedValue(null);

		const creds = await authState.getCredentials();
		expect(creds).toBeNull();
	});

	it("should return user credentials when authenticated", async () => {
		const mockCreds: ExtensionCredentials = {
			accessToken: "token",
			refreshToken: "refresh",
			expiresAt: Date.now() + 900000,
			user: { id: "user1", email: "test@example.com", name: "Test User" },
		};

		vi.mocked(mockCredentialsManager.getCredentials).mockResolvedValue(
			mockCreds,
		);

		const creds = await authState.getCredentials();
		expect(creds).toEqual({
			id: "user1",
			email: "test@example.com",
			name: "Test User",
		});
	});

	it("should call clearCredentials on signOut", async () => {
		vi.mocked(mockCredentialsManager.clearCredentials).mockResolvedValue();

		await authState.signOut();
		expect(mockCredentialsManager.clearCredentials).toHaveBeenCalledTimes(1);
	});
});

/**
 * Test AnonymousIdManager - Single responsibility: anonymous ID lifecycle
 */
describe("AnonymousIdManager", () => {
	let mockMemento: Record<string, unknown> = {};
	let anonIdManager: AnonymousIdManager;

	beforeEach(() => {
		mockMemento = {};

		const mockGlobalState: vscode.Memento = {
			get: (key: string, defaultValue?: any) =>
				mockMemento[key] ?? defaultValue,
			update: vi.fn(async (key: string, value: any) => {
				mockMemento[key] = value;
			}),
			keys: () => [],
		};

		anonIdManager = new AnonymousIdManager(mockGlobalState);
	});

	it("should generate new anonymous ID if not exists", async () => {
		const id = await anonIdManager.getOrCreate();

		expect(id).toMatch(
			/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i,
		);

		const persisted = mockMemento["snapback.anonymousId"];
		expect(persisted).toBe(id);
	});

	it("should return existing anonymous ID if already created", async () => {
		const existingId = "550e8400-e29b-41d4-a716-446655440000";
		mockMemento["snapback.anonymousId"] = existingId;

		const id = await anonIdManager.getOrCreate();
		expect(id).toBe(existingId);
	});

	it("should get current anonymous ID without creating", async () => {
		const existingId = "550e8400-e29b-41d4-a716-446655440000";
		mockMemento["snapback.anonymousId"] = existingId;

		const id = await anonIdManager.get();
		expect(id).toBe(existingId);
	});

	it("should return null when anonymous ID not found", async () => {
		const id = await anonIdManager.get();
		expect(id).toBeNull();
	});

	it("should reset anonymous ID", async () => {
		mockMemento["snapback.anonymousId"] =
			"550e8400-e29b-41d4-a716-446655440000";

		await anonIdManager.reset();

		const id = await anonIdManager.get();
		expect(id).toBeNull();
	});
});

/**
 * Test discriminated union for UserContext
 */
describe("UserContext Discriminated Union", () => {
	it("should allow type-safe context checking", () => {
		const authed = {
			isAuthenticated: true as const,
			userId: "user1",
			email: "test@example.com",
			tier: "free" as const,
		};

		const anon = {
			isAuthenticated: false as const,
			anonymousId: "550e8400-e29b-41d4-a716-446655440000",
		};

		expect(isAuthenticatedContext(authed)).toBe(true);
		expect(isAnonymousContext(authed)).toBe(false);
		expect(isAuthenticatedContext(anon)).toBe(false);
		expect(isAnonymousContext(anon)).toBe(true);
	});

	it("should provide feature access control", () => {
		const authed = {
			isAuthenticated: true as const,
			userId: "user1",
			email: "test@example.com",
			tier: "pro" as const,
		};

		const anon = {
			isAuthenticated: false as const,
			anonymousId: "550e8400-e29b-41d4-a716-446655440000",
		};

		expect(canAccessFeature(authed, "snapshots")).toBe(true);
		expect(canAccessFeature(anon, "snapshots")).toBe(true);
		expect(canAccessFeature(authed, "cloud-backup")).toBe(true);
		expect(canAccessFeature(anon, "cloud-backup")).toBe(false);
	});

	it("should have different feature sets for different tiers", () => {
		const free = {
			isAuthenticated: true as const,
			userId: "user1",
			email: "test@example.com",
			tier: "free" as const,
		};

		const pro = {
			isAuthenticated: true as const,
			userId: "user2",
			email: "test2@example.com",
			tier: "pro" as const,
		};

		expect(canAccessFeature(free, "cloud-backup-limited")).toBe(true);
		expect(canAccessFeature(free, "cloud-backup")).toBe(false);
		expect(canAccessFeature(pro, "cloud-backup")).toBe(true);
		expect(canAccessFeature(pro, "team-collaboration")).toBe(true);
	});
});

/**
 * Test integration: AuthState + AnonymousIdManager
 */
describe("Auth State Integration", () => {
	let mockCredentialsManager: CredentialsManager;
	let mockMemento: Record<string, unknown>;
	let authState: AuthState;
	let anonIdManager: AnonymousIdManager;

	beforeEach(() => {
		mockMemento = {};

		mockCredentialsManager = {
			getCredentials: vi.fn(),
			setCredentials: vi.fn(),
			clearCredentials: vi.fn(),
			isAccessTokenExpired: vi.fn(),
		};

		const mockGlobalState: vscode.Memento = {
			get: (key: string, defaultValue?: any) =>
				mockMemento[key] ?? defaultValue,
			update: vi.fn(async (key: string, value: any) => {
				mockMemento[key] = value;
			}),
			keys: () => [],
		};

		authState = new AuthState(mockCredentialsManager);
		anonIdManager = new AnonymousIdManager(mockGlobalState);
	});

	it("should build UserContext from AuthState when authenticated", async () => {
		const mockCreds: ExtensionCredentials = {
			accessToken: "token",
			refreshToken: "refresh",
			expiresAt: Date.now() + 900000,
			user: { id: "user1", email: "test@example.com" },
			workspace: { id: "ws1", name: "My Workspace", plan: "free" },
		};

		vi.mocked(mockCredentialsManager.getCredentials).mockResolvedValue(
			mockCreds,
		);

		const isAuth = await authState.isAuthenticated();
		const credentials = await authState.getCredentials();

		let context: any;
		if (isAuth && credentials) {
			context = {
				isAuthenticated: true,
				userId: credentials.id,
				email: credentials.email,
				tier: mockCreds.workspace?.plan ?? "free",
			};
		}

		expect(context.isAuthenticated).toBe(true);
		expect(context.userId).toBe("user1");
		expect(context.tier).toBe("free");
	});

	it("should build UserContext from AnonymousIdManager when not authenticated", async () => {
		vi.mocked(mockCredentialsManager.getCredentials).mockResolvedValue(null);

		const isAuth = await authState.isAuthenticated();

		let context: any;
		if (!isAuth) {
			const anonId = await anonIdManager.getOrCreate();
			context = {
				isAuthenticated: false,
				anonymousId: anonId,
			};
		}

		expect(context.isAuthenticated).toBe(false);
		expect(context.anonymousId).toMatch(
			/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i,
		);
	});
});
