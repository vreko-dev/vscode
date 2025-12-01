import base64url from "base64url";
import nacl from "tweetnacl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RulesManager } from "../../../src/rules/RulesManager";

// Mock the logger
vi.mock("../../../src/utils/logger", () => ({
	logger: {
		info: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
	},
}));

// Mock the SnapbackAPI
vi.mock("../../../src/rules/SnapbackAPI", () => ({
	SnapbackAPI: {
		getInstance: vi.fn().mockReturnValue({
			getRulesBundle: vi.fn(),
		}),
	},
}));

// Mock vscode
vi.mock("vscode", () => ({
	ExtensionContext: vi.fn(),
}));

describe("RulesManager - Signature Verification", () => {
	let rulesManager: RulesManager;
	let testKeyPair: nacl.SignKeyPair;

	beforeEach(() => {
		// Clear all mocks before each test
		vi.clearAllMocks();

		// Create a mock context
		const mockContext: any = {
			extension: {
				packageJSON: {
					version: "1.0.0",
				},
			},
		};

		// Get a fresh instance of RulesManager for each test
		rulesManager = RulesManager.getInstance(mockContext);

		// Generate a test keypair
		testKeyPair = nacl.sign.keyPair();

		// Reset the singleton instance for clean state
		(RulesManager as any).instance = null;
	});

	afterEach(() => {
		// Clean up after each test
		vi.restoreAllMocks();
	});

	it("should reject invalid JWS format", async () => {
		const invalidBundle = "invalid.format";

		await expect(
			rulesManager.validateRulesBundle(invalidBundle),
		).rejects.toThrow("Invalid JWS format");
	});

	it("should reject unsigned bundles", async () => {
		// Temporarily override the public key
		const originalPublicKey = (rulesManager as any).PUBLIC_KEY;
		(rulesManager as any).PUBLIC_KEY = testKeyPair.publicKey;

		// Create a bundle with an invalid signature (wrong size)
		const header = base64url.encode(JSON.stringify({ alg: "EdDSA" }));
		const payload = base64url.encode(
			JSON.stringify({
				version: "1.0.0",
				minClientVersion: "0.1.0",
				rules: [{ pattern: "*.env", level: "block" }],
				metadata: { timestamp: Date.now(), schemaVersion: "1.0" },
			}),
		);
		// Create an invalid signature with wrong size that will cause tweetnacl to throw an error
		const invalidSignature = base64url.encode(Buffer.from([0, 1, 2, 3])); // Too short

		const unsignedBundle = `${header}.${payload}.${invalidSignature}`;

		// Should catch the error and rethrow as "Invalid signature"
		await expect(
			rulesManager.validateRulesBundle(unsignedBundle),
		).rejects.toThrow("Invalid signature");

		// Restore the original public key
		(rulesManager as any).PUBLIC_KEY = originalPublicKey;
	});

	it("should reject tampered bundles", async () => {
		// Temporarily override the public key
		const originalPublicKey = (rulesManager as any).PUBLIC_KEY;
		(rulesManager as any).PUBLIC_KEY = testKeyPair.publicKey;

		// Create a valid bundle first
		const validBundle = await createSignedBundle(
			{
				version: "1.0.0",
				minClientVersion: "0.1.0",
				rules: [{ pattern: "*.env", level: "block" }],
				metadata: { timestamp: Date.now(), schemaVersion: "1.0" },
			},
			testKeyPair,
		);

		const [header, _payload, signature] = validBundle.split(".");
		const tamperedPayload = base64url.encode(
			JSON.stringify({ malicious: true }),
		);
		const tamperedBundle = `${header}.${tamperedPayload}.${signature}`;

		await expect(
			rulesManager.validateRulesBundle(tamperedBundle),
		).rejects.toThrow("Invalid signature");

		// Restore the original public key
		(rulesManager as any).PUBLIC_KEY = originalPublicKey;
	});

	it("should reject invalid schema", async () => {
		// Temporarily override the public key
		const originalPublicKey = (rulesManager as any).PUBLIC_KEY;
		(rulesManager as any).PUBLIC_KEY = testKeyPair.publicKey;

		const invalidSchemaBundle = await createSignedBundle(
			{
				version: "1.0.0",
				// Missing minClientVersion
				rules: [{ pattern: "*.env", level: "block" }],
				metadata: { timestamp: Date.now(), schemaVersion: "1.0" },
			},
			testKeyPair,
		);

		await expect(
			rulesManager.validateRulesBundle(invalidSchemaBundle),
		).rejects.toThrow("Invalid bundle schema");

		// Restore the original public key
		(rulesManager as any).PUBLIC_KEY = originalPublicKey;
	});

	it("should enforce minClientVersion", async () => {
		// Temporarily override the public key
		const originalPublicKey = (rulesManager as any).PUBLIC_KEY;
		(rulesManager as any).PUBLIC_KEY = testKeyPair.publicKey;

		const futureVersionBundle = await createSignedBundle(
			{
				version: "1.0.0",
				minClientVersion: "999.0.0", // Far future version
				rules: [{ pattern: "*.env", level: "block" }],
				metadata: { timestamp: Date.now(), schemaVersion: "1.0" },
			},
			testKeyPair,
		);

		await expect(
			rulesManager.validateRulesBundle(futureVersionBundle),
		).rejects.toThrow("Extension update required");

		// Restore the original public key
		(rulesManager as any).PUBLIC_KEY = originalPublicKey;
	});

	it("should warn about stale bundles but still accept them", async () => {
		// Temporarily override the public key
		const originalPublicKey = (rulesManager as any).PUBLIC_KEY;
		(rulesManager as any).PUBLIC_KEY = testKeyPair.publicKey;

		const oldTimestamp = Date.now() - 8 * 24 * 60 * 60 * 1000; // 8 days old
		const staleBundle = await createSignedBundle(
			{
				version: "1.0.0",
				minClientVersion: "0.1.0",
				rules: [{ pattern: "*.env", level: "block" }],
				metadata: { timestamp: oldTimestamp, schemaVersion: "1.0" },
			},
			testKeyPair,
		);

		// Should not throw but should warn
		const result = await rulesManager.validateRulesBundle(staleBundle);
		expect(result.rules).toHaveLength(1);

		// Restore the original public key
		(rulesManager as any).PUBLIC_KEY = originalPublicKey;
	});

	it("should accept valid signed bundles", async () => {
		// Temporarily override the public key
		const originalPublicKey = (rulesManager as any).PUBLIC_KEY;
		(rulesManager as any).PUBLIC_KEY = testKeyPair.publicKey;

		const validBundle = await createSignedBundle(
			{
				version: "1.0.0",
				minClientVersion: "0.1.0",
				rules: [{ pattern: "*.env", level: "block" }],
				metadata: { timestamp: Date.now(), schemaVersion: "1.0" },
			},
			testKeyPair,
		);

		const result = await rulesManager.validateRulesBundle(validBundle);
		expect(result.rules).toHaveLength(1);
		expect(result.version).toBe("1.0.0");
		expect(result.minClientVersion).toBe("0.1.0");

		// Restore the original public key
		(rulesManager as any).PUBLIC_KEY = originalPublicKey;
	});
});

// Helper function to create a signed bundle for testing
async function createSignedBundle(
	payload: any,
	keyPair: nacl.SignKeyPair,
): Promise<string> {
	// Create JWS header
	const header = { alg: "EdDSA" };
	const headerB64 = base64url.encode(JSON.stringify(header));

	// Create payload
	const payloadB64 = base64url.encode(JSON.stringify(payload));

	// Create the message to sign
	const message = new TextEncoder().encode(`${headerB64}.${payloadB64}`);

	// Sign the message using tweetnacl
	const signature = nacl.sign.detached(message, keyPair.secretKey);
	const signatureB64 = base64url.encode(Buffer.from(signature));

	return `${headerB64}.${payloadB64}.${signatureB64}`;
}
